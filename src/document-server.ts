
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import chokidar from "chokidar";
import * as matterImport from "gray-matter";
import * as pdfImport from "pdf-parse";

// Handle ESM/CJS interop
const matter = (matterImport as any).default || matterImport;
const pdf = (pdfImport as any).default || pdfImport;

process.on('uncaughtException', (err) => {
    console.error('SERVER UNCAUGHT EXCEPTION:', err);
});

const DOCUMENTS_DIR = "./documents";

class BrainLibrary {
    private indexedDocs: { content: string; source: string }[] = [];

    async initialize() {
        console.error("[Library] Initializing Live Brain Library...");
        if (!fs.existsSync(DOCUMENTS_DIR)) fs.mkdirSync(DOCUMENTS_DIR);

        // Initial Load
        const files = fs.readdirSync(DOCUMENTS_DIR);
        for (const file of files) {
            await this.processFile(path.join(DOCUMENTS_DIR, file));
        }

        // Setup Watcher for Automated Ingestion (Milestone 2)
        const watcher = chokidar.watch(DOCUMENTS_DIR, {
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: true
        });

        watcher.on("add", (p) => this.processFile(p));
        watcher.on("change", (p) => this.processFile(p));
        watcher.on("unlink", (p) => this.removeFile(path.basename(p)));

        console.error(`[Library] Watching ${DOCUMENTS_DIR} for changes...`);
    }

    async processFile(filePath: string) {
        const ext = path.extname(filePath).toLowerCase();
        const fileName = path.basename(filePath);
        if (![".txt", ".md", ".pdf"].includes(ext)) return;

        console.error(`[Library] Indexing ${fileName}...`);

        try {
            let text = "";
            if (ext === ".pdf") {
                const dataBuffer = fs.readFileSync(filePath);
                // @ts-ignore
                const pdfData = await pdf(dataBuffer);
                text = pdfData.text;
            } else if (ext === ".md") {
                const content = fs.readFileSync(filePath, "utf-8");
                const { content: markdownContent } = matter(content);
                text = markdownContent;
            } else {
                text = fs.readFileSync(filePath, "utf-8");
            }

            // Remove old version of this file
            this.removeFile(fileName);

            // Chunk and add
            const chunks = text.split("\n\n").filter(c => c.trim().length > 10);
            chunks.forEach(chunk => {
                this.indexedDocs.push({ content: chunk.trim(), source: fileName });
            });

            console.error(`[Library] ${fileName} indexed (${chunks.length} chunks).`);
        } catch (err) {
            console.error(`[Library] Error processing ${fileName}:`, err);
        }
    }

    removeFile(fileName: string) {
        this.indexedDocs = this.indexedDocs.filter(d => d.source !== fileName);
    }

    async search(query: string) {
        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        return this.indexedDocs
            .map(doc => {
                let score = 0;
                terms.forEach(t => { if (doc.content.toLowerCase().includes(t)) score++; });
                return { ...doc, score };
            })
            .filter(d => d.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);
    }
}

const lib = new BrainLibrary();
const server = new Server(
    { name: "brain-library", version: "1.1.0" },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: "search_documents",
        description: "Search your personal documents (Text, MD, PDF).",
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
