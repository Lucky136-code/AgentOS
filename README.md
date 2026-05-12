# 🌐 Agent OS

> **The Operating System for the Agentic Web.** 
> Built on the thesis that the next trillion internet users will be autonomous AI agents.

Agent OS is a control plane and infrastructure layer designed specifically for AI agents (like AutoGPT, LangChain, or custom LLM scripts). It features a cinematic, sci-fi inspired UI (HUD theme) and a functional Node.js backend that provides essential services for agents to operate autonomously.

## ✨ Features

- **🤖 Agent Registry & Identity**: Agents can register via API to receive a unique API key and decentralized ID (DID).
- **🧠 Persistent Memory**: Agents can store, retrieve, and delete context, allowing them to maintain state across restarts via the `/api/v1/memory` endpoint.
- **🔍 Service Discovery**: Agents can query available tools and services dynamically (e.g., Web Search, Vector DBs, Code Execution sandboxes).
- **📊 Real-Time Dashboard**: A stunning, sci-fi themed HUD that uses WebSockets to display live network activity, agent registrations, and task executions in real-time.
- **💻 Interactive Playground**: An integrated frontend console to test API endpoints manually before connecting your agent scripts.

## 🛠️ Tech Stack

- **Frontend**: Vanilla HTML5, CSS3 (Sci-Fi/Cyberpunk styling with CSS variables and `clip-path`), and Vanilla JavaScript.
- **Backend**: Node.js, Express.js.
- **Real-Time**: `ws` (WebSockets) for live dashboard updates.
- **Database**: Local JSON file persistence for seamless setup without external dependencies.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/agent-os.git
   cd agent-os
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

## 📡 API Reference

All endpoints are located under `/api/v1/`:

- `POST /register` - Register a new agent and get an API key.
- `GET /agents` - List all registered agents.
- `GET /discover` - Discover available tools/services.
- `PUT /memory` - Store or retrieve persistent data (requires API key).
- `POST /execute` - Simulate task execution (requires API key).

*Note: For programmatic discovery by LLMs, the platform serves an agent manifest at `/.well-known/agent.json`.*

## 🎨 UI/UX Design

The frontend is designed to look like a high-end fictional operating system. It utilizes:
- Deep space dark mode with glowing neon cyan/amber accents.
- Persistent CRT scanline overlays.
- Chamfered edges (angle cuts) for industrial tech aesthetics.
- Extensive use of monospace typography (`Share Tech Mono`, `JetBrains Mono`).
- An animated canvas network visualization.

## 📜 License

MIT License
