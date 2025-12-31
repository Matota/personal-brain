
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";

async function test() {
    console.log("Testing Ollama via OpenAI Bridge...");
    const model = new ChatOpenAI({
        apiKey: "ollama",
        configuration: {
            baseURL: "http://localhost:11434/v1",
        },
        modelName: "llama3:latest",
        temperature: 0,
    });

    try {
        const response = await model.invoke([new HumanMessage("Hello, who are you?")]);
        console.log("Response:", response.content);
    } catch (err) {
        console.error("Error:", err);
    }
}

test();
