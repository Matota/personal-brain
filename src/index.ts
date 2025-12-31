
import { ChatOpenAI } from "@langchain/openai";
import {
    StateGraph,
    START,
    END,
    MessagesAnnotation,
    Annotation
} from "@langchain/langgraph";
import { AIMessage, HumanMessage, ToolMessage, SystemMessage } from "@langchain/core/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tool } from "@langchain/core/tools";
import * as dotenv from "dotenv";
import * as readline from "readline";

dotenv.config();

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

/**
 * 1. Define the State
 */
const BrainState = Annotation.Root({
    ...MessagesAnnotation.spec,
    // We can add "focus" or "current_context" here later
});

/**
 * 2. Wrapper for MCP Tools
 */
class LocalMcpTool extends Tool {
    name: string;
    description: string;
    private client: Client;
    private toolName: string;

    constructor(name: string, description: string, client: Client, toolName: string) {
        super();
        this.name = name;
        this.description = description;
        this.client = client;
        this.toolName = toolName;
    }

    async _call(input: string): Promise<string> {
        try {
            let args = {};
            try {
                args = JSON.parse(input);
            } catch {
                if (this.toolName === "search_documents") args = { query: input };
            }

            const result = await this.client.callTool({
                name: this.toolName,
                arguments: args
            });

            // @ts-ignore
            return result.content.map(c => c.text).join("\n");
        } catch (error) {
            return `Error in ${this.toolName}: ${error instanceof Error ? error.message : String(error)}`;
        }
    }
}

/**
 * 3. The Personal Brain Agent
 */
export class PersonalBrain {
    private model: ChatOpenAI;
    private docClient: Client;
    private tools: LocalMcpTool[] = [];
    private graph: any;

    constructor() {
        // CONFIGURE OLLAMA: Point OpenAI SDK to Local Endpoint
        this.model = new ChatOpenAI({
            apiKey: "ollama",           // Placeholder
            configuration: {
                baseURL: "http://localhost:11434/v1",
            },
            modelName: "llama3:latest",
            temperature: 0,
        });

        this.docClient = new Client(
            { name: "brain-library", version: "1.0.0" },
            { capabilities: {} }
        );
    }

    async initialize() {
        console.log("[Brain] Initializing Local Intelligence...");

        // Connect to local Document Server
        await this.docClient.connect(new StdioClientTransport({
            command: "node",
            args: ["dist/document-server.js"]
        }));

        // Wrap tool
        const toolsResult = await this.docClient.listTools();
        this.tools = toolsResult.tools.map(t =>
            new LocalMcpTool(t.name, t.description || "", this.docClient, t.name)
        );

        const modelWithTools = this.model.bindTools(this.tools);

        // Simplified RAG Node: Search first, then generate
        const retrieveContext = async (state: typeof BrainState.State) => {
            console.log("[Brain] Checking for relevant context...");
            const lastMessage = state.messages[state.messages.length - 1] as HumanMessage;
            const query = lastMessage.content.toString();

            const searchTool = this.tools.find(t => t.name === "search_documents");
            if (searchTool) {
                const results = await searchTool._call(query);
                if (results && results !== "No matching information found.") {
                    console.log(`[Brain] Context found (length: ${results.length}). Updating state.`);
                    // Replace the last message with a context-enriched one
                    const enrichedContent = `CONTEXT FROM YOUR BRAIN:\n${results}\n\nUSER QUESTION: ${query}\n\nPlease answer based strictly on the context above.`;
                    return { messages: [new HumanMessage(enrichedContent)] };
                }
            }
            return { messages: [] };
        };

        const callModel = async (state: typeof BrainState.State) => {
            console.log("[Brain] Synthesizing Final Answer...");
            // For this simplified logic, we just take the last (enriched) message
            const lastMessage = state.messages[state.messages.length - 1];
            if (!lastMessage) throw new Error("No messages in state");
            const response = await this.model.invoke([lastMessage]);
            console.log("[Brain] Response synthesized successfully.");
            return { messages: [response] };
        };

        const workflow = new StateGraph(BrainState)
            .addNode("retrieve", retrieveContext)
            .addNode("generate", callModel)
            .addEdge(START, "retrieve")
            .addEdge("retrieve", "generate")
            .addEdge("generate", END);

        this.graph = workflow.compile();
        console.log("[Brain] LangGraph compiled with Local LLM (Ollama) support.");
    }

    async ask(userInput: string) {
        const result = await this.graph.invoke({
            messages: [new HumanMessage(userInput)]
        });
        return result.messages[result.messages.length - 1].content;
    }
}

// 4. Interactive CLI
async function main() {
    const brain = new PersonalBrain();
    await brain.initialize();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("\n🧠 [Second Brain] Ready. How can I help you today? (Type '/quit' to exit)\n");

    const loop = () => {
        rl.question("You: ", async (input) => {
            if (input.toLowerCase() === "/quit") {
                rl.close();
                process.exit(0);
            }

            console.log("[Brain] Processing locally...");
            try {
                const response = await brain.ask(input);
                console.log(`\nBrain: ${response}\n`);
            } catch (error) {
                console.error("[Brain] Error:", error instanceof Error ? error.message : error);
            }
            loop();
        });
    };

    loop();
}

if (process.argv[1] === import.meta.url.replace("file://", "")) {
    main().catch(console.error);
}
