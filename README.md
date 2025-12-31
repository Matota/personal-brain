# Personal Knowledge Assistant (Second Brain)

A local-first, private AI assistant built with **Ollama**, **LangGraph**, and **Model Context Protocol (MCP)**.

## 🌟 Features
- **100% Local**: Uses Ollama for LLM inference (Llama 3).
- **Private RAG**: Decoupled document server using keyword search (ChromaDB support coming soon).
- **State-Driven**: Orchestrated by LangGraph for robust agentic behavior.

## 🚀 Getting Started

### Prerequisites
1. **Ollama**: [Install Ollama](https://ollama.com/) and run `ollama pull llama3`.
2. **Node.js**: Version 18+.

### Installation
```bash
npm install
npx tsc
```

### Usage
Start the interactive brain:
```bash
node dist/index.js
```

## 🗺️ Roadmap
- [x] Milestone 1: Local Foundation
- [ ] Milestone 2: Automated Ingestion
- [ ] Milestone 3: Web-Enhanced Research
- [ ] Milestone 4: Modern Web Interface

## 🛡️ License
ISC
