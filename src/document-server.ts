
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

process.on('uncaughtException', (err) => {
    console.error('SERVER UNCAUGHT EXCEPTION:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('SERVER UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const DOCUMENTS_DIR = "./documents";

class BrainLibrary {
    private indexedDocs: { content: string; source: string }[] = [];

    async initialize() {
        console.error("[Library] Initializing Local Keyword Search...");
        if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR);

        try {
            const files = fs.readdirSync(DOCUMENTS_DIR).filter(f => f.endsWith('.txt') || f.endsWith('.md'));

            for (const file of files) {
                const content = fs.readFileSync(path.join(DOCUMENTS_DIR, file), 'utf-8');
                const sections = content.split('\n\n').filter(s => s.trim());
                sections.forEach(section => {
                    this.indexedDocs.push({ content: section.trim(), source: file });
                });
            }
            console.error(`[Library] Indexed ${this.indexedDocs.length} sections from ${files.length} files.`);
        } catch (err) {
            console.error("[Library] Load Error:", err);
        }
    }

    async search(query: string) {
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        const results = this.indexedDocs
            .map(doc => {
                let score = 0;
                terms.forEach(t => { if (doc.content.toLowerCase().includes(t)) score++; });
                return { ...doc, score };
            })
            .filter(d => d.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        return results;
    }
}

const lib = new BrainLibrary();
const server = new Server(
    { name: "brain-library", version: "1.0.0" },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "search_documents",
        description: "Search your personal documents for information.",
        inputSchema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"]
        }
    }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "search_documents") {
        const { query } = z.object({ query: z.string() }).parse(request.params.arguments);
        const results = await lib.search(query);
        const text = results.length ?
            results.map((r: any) => `[${r.source}] ${r.content}`).join("\n\n") :
            "No matching information found.";
        return { content: [{ type: "text", text }] };
    }
    throw new Error("Tool not found");
});

async function main() {
    await lib.initialize();
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);
