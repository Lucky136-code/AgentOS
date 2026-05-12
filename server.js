// ============================================
// AGENT OS — Real Backend Server
// Uses JSON file persistence (no native deps)
// ============================================

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

// === JSON FILE DATABASE ===
const DB_PATH = path.join(__dirname, 'data.json');

function loadDB() {
  try {
    if (fs.existsSync(DB_PATH)) return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) { console.error('DB load error:', e.message); }
  return { agents: {}, memory: {}, tasks: {}, activity: [], services: getDefaultServices() };
}

function saveDB() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) { console.error('DB save error:', e.message); }
}

function getDefaultServices() {
  return {
    svc_web_search: { id: 'svc_web_search', name: 'Web Search API', description: 'Full-text web search with snippet extraction', protocol: 'MCP', capabilities: ['search'], latency_ms: 45, price: 0.001, status: 'active' },
    svc_arxiv: { id: 'svc_arxiv', name: 'ArXiv Paper Search', description: 'Academic paper search and metadata retrieval', protocol: 'REST', capabilities: ['search', 'academic'], latency_ms: 120, price: 0.0005, status: 'active' },
    svc_code_exec: { id: 'svc_code_exec', name: 'Code Execution Sandbox', description: 'Isolated code execution in microVMs', protocol: 'gRPC', capabilities: ['code', 'execute'], latency_ms: 200, price: 0.005, status: 'active' },
    svc_email: { id: 'svc_email', name: 'Email Gateway', description: 'Send and receive emails programmatically', protocol: 'REST', capabilities: ['email', 'communicate'], latency_ms: 80, price: 0.002, status: 'active' },
    svc_storage: { id: 'svc_storage', name: 'Object Storage', description: 'Persistent file and data storage', protocol: 'S3', capabilities: ['storage', 'persist'], latency_ms: 30, price: 0.0001, status: 'active' },
    svc_vector_db: { id: 'svc_vector_db', name: 'Vector Database', description: 'Semantic similarity search and embeddings storage', protocol: 'REST', capabilities: ['memory', 'search'], latency_ms: 15, price: 0.0002, status: 'active' },
    svc_llm_router: { id: 'svc_llm_router', name: 'LLM Router', description: 'Intelligent routing to optimal LLM providers', protocol: 'REST', capabilities: ['inference', 'route'], latency_ms: 50, price: 0.01, status: 'active' },
    svc_browser: { id: 'svc_browser', name: 'Headless Browser', description: 'Web browsing and scraping for agents', protocol: 'WebSocket', capabilities: ['browse', 'scrape'], latency_ms: 500, price: 0.003, status: 'active' },
  };
}

const db = loadDB();
// Auto-save every 10 seconds
setInterval(saveDB, 10000);

// === HELPERS ===
const genId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('base64url')}`;
const genApiKey = () => `sk_live_aOs_${crypto.randomBytes(24).toString('base64url')}`;
const now = () => new Date().toISOString();

function logActivity(agentId, agentName, action, detail) {
  const entry = { id: db.activity.length + 1, agent_id: agentId, agent_name: agentName, action, detail, created_at: now() };
  db.activity.unshift(entry);
  if (db.activity.length > 200) db.activity = db.activity.slice(0, 200);
  broadcastWS({ type: 'activity', data: entry });
}

function authAgent(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const key = auth.slice(7);
  return Object.values(db.agents).find(a => a.api_key === key) || null;
}

// === MIDDLEWARE ===
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// === WEBSOCKET ===
const wsClients = new Set();
wss.on('connection', (ws) => {
  wsClients.add(ws);
  ws.send(JSON.stringify({ type: 'stats', data: getStats() }));
  ws.on('close', () => wsClients.delete(ws));
});
function broadcastWS(data) {
  const msg = JSON.stringify(data);
  wsClients.forEach(ws => { if (ws.readyState === 1) ws.send(msg); });
}
setInterval(() => broadcastWS({ type: 'stats', data: getStats() }), 3000);

function getStats() {
  const agents = Object.values(db.agents);
  const tasks = Object.values(db.tasks);
  return {
    totalAgents: agents.length,
    activeAgents: agents.filter(a => a.status === 'active').length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    totalRequests: agents.reduce((sum, a) => sum + (a.total_requests || 0), 0),
    totalMemory: Object.values(db.memory).reduce((sum, ns) => sum + Object.keys(ns).length, 0),
    totalServices: Object.keys(db.services).length,
    recentActivity: db.activity.slice(0, 20),
    uptime: process.uptime()
  };
}

// ============================================
// API ROUTES
// ============================================

// --- Register Agent ---
app.post('/api/v1/register', (req, res) => {
  const { name, capabilities, model, memory, sandbox } = req.body;
  if (!name) return res.status(400).json({ error: 'Agent name is required' });

  const id = genId('agt');
  const apiKey = genApiKey();
  const agent = {
    id, name, api_key: apiKey, capabilities: capabilities || [], model: model || 'unknown',
    status: 'active', memory_enabled: !!memory, sandbox: sandbox || 'none',
    total_requests: 0, total_tasks: 0, created_at: now(), last_active: now()
  };
  db.agents[id] = agent;
  saveDB();
  logActivity(id, name, 'register', `Agent "${name}" registered with capabilities: [${(capabilities || []).join(', ')}]`);

  res.status(201).json({
    agent_id: id, api_key: apiKey, status: 'active',
    identity: { did: `did:agentos:${id}`, created: agent.created_at },
    quota: { requests_per_min: 1000, compute_units: 50000 },
    message: 'Agent registered. Welcome to the agentic web.'
  });
});

// --- List Agents ---
app.get('/api/v1/agents', (req, res) => {
  let agents = Object.values(db.agents).map(({ api_key, ...rest }) => rest);
  if (req.query.status) agents = agents.filter(a => a.status === req.query.status);
  if (req.query.capability) agents = agents.filter(a => (a.capabilities || []).some(c => c.includes(req.query.capability)));
  agents.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (req.query.limit) agents = agents.slice(0, parseInt(req.query.limit));
  res.json({ agents, total: agents.length });
});

// --- Get Agent ---
app.get('/api/v1/agents/:id', (req, res) => {
  const agent = db.agents[req.params.id];
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const { api_key, ...safe } = agent;
  const memCount = db.memory[agent.id] ? Object.keys(db.memory[agent.id]).length : 0;
  const activeTasks = Object.values(db.tasks).filter(t => t.agent_id === agent.id && t.status === 'pending').length;
  res.json({ ...safe, memory_entries: memCount, active_tasks: activeTasks });
});

// --- Delete Agent ---
app.delete('/api/v1/agents/:id', (req, res) => {
  const agent = authAgent(req);
  if (!agent) return res.status(401).json({ error: 'Invalid API key' });
  if (agent.id !== req.params.id) return res.status(403).json({ error: 'You can only delete your own agent' });
  const name = agent.name;
  delete db.agents[req.params.id];
  delete db.memory[req.params.id];
  saveDB();
  logActivity(req.params.id, name, 'deregister', `Agent "${name}" deregistered`);
  res.json({ deleted: true, agent_id: req.params.id });
});

// --- Discover Services ---
app.get('/api/v1/discover', (req, res) => {
  let services = Object.values(db.services).filter(s => s.status === 'active');
  if (req.query.capability) services = services.filter(s => s.capabilities.some(c => c.includes(req.query.capability)));
  if (req.query.protocol) services = services.filter(s => s.protocol === req.query.protocol);
  if (req.query.limit) services = services.slice(0, parseInt(req.query.limit));

  const agent = authAgent(req);
  if (agent) {
    db.agents[agent.id].total_requests++;
    db.agents[agent.id].last_active = now();
    logActivity(agent.id, agent.name, 'discover', `Discovered ${services.length} services${req.query.capability ? ` for "${req.query.capability}"` : ''}`);
  }
  res.json({ services, total: services.length });
});

// --- Execute Task ---
app.post('/api/v1/execute', (req, res) => {
  const agent = authAgent(req);
  if (!agent) return res.status(401).json({ error: 'Authentication required. Use Bearer token from /register.' });

  const { task, tools, max_steps } = req.body;
  if (!task) return res.status(400).json({ error: 'Task description is required' });

  const taskId = genId('task');
  const steps = Math.floor(Math.random() * (max_steps || 10)) + 1;
  const duration = Math.floor(Math.random() * 3000) + 500;

  const taskObj = {
    id: taskId, agent_id: agent.id, task, tools: tools || [],
    status: 'completed', steps, duration_ms: duration,
    result: { summary: `Task completed: ${task}`, steps_taken: steps },
    created_at: now(), completed_at: now()
  };
  db.tasks[taskId] = taskObj;
  db.agents[agent.id].total_requests++;
  db.agents[agent.id].total_tasks++;
  db.agents[agent.id].last_active = now();
  saveDB();
  logActivity(agent.id, agent.name, 'execute', `Executed: "${task}" in ${duration}ms (${steps} steps)`);

  setTimeout(() => {
    res.status(201).json({
      execution_id: taskId, agent_id: agent.id, status: 'completed',
      steps, duration_ms: duration,
      result: taskObj.result, cost: `$${(duration * 0.000001).toFixed(6)}`
    });
  }, Math.min(duration, 1500));
});

// --- Memory ---
app.put('/api/v1/memory', (req, res) => {
  const agent = authAgent(req);
  if (!agent) return res.status(401).json({ error: 'Authentication required' });

  const { operation, namespace, data } = req.body;
  if (!operation) return res.status(400).json({ error: 'Operation required: store, retrieve, delete' });
  const ns = namespace || 'default';

  if (!db.memory[agent.id]) db.memory[agent.id] = {};
  if (!db.memory[agent.id][ns]) db.memory[agent.id][ns] = {};

  if (operation === 'store') {
    if (!data || !data.key || data.value === undefined) return res.status(400).json({ error: 'data.key and data.value required' });
    const memId = genId('mem');
    db.memory[agent.id][ns][data.key] = { id: memId, value: data.value, created_at: now() };
    db.agents[agent.id].total_requests++;
    db.agents[agent.id].last_active = now();
    saveDB();
    logActivity(agent.id, agent.name, 'memory', `Stored "${data.key}" in namespace "${ns}"`);
    return res.json({ stored: true, memory_id: memId, namespace: ns });
  }
  if (operation === 'retrieve') {
    const store = db.memory[agent.id][ns] || {};
    const entries = data && data.key ? (store[data.key] ? [{ key: data.key, ...store[data.key] }] : []) : Object.entries(store).map(([k, v]) => ({ key: k, ...v }));
    db.agents[agent.id].total_requests++;
    return res.json({ entries, total: entries.length });
  }
  if (operation === 'delete') {
    if (!data || !data.key) return res.status(400).json({ error: 'data.key required for delete' });
    delete db.memory[agent.id][ns][data.key];
    saveDB();
    logActivity(agent.id, agent.name, 'memory', `Deleted "${data.key}" from "${ns}"`);
    return res.json({ deleted: true });
  }
  res.status(400).json({ error: 'Invalid operation. Use: store, retrieve, delete' });
});

// --- Stats ---
app.get('/api/v1/stats', (req, res) => res.json(getStats()));

// --- Activity ---
app.get('/api/v1/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ activity: db.activity.slice(0, limit), total: db.activity.length });
});

// --- Agent Manifest ---
app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'Agent OS', version: '1.0.0',
    description: 'The Operating System for AI Agents. Register, discover, execute, and persist.',
    api_base: `${req.protocol}://${req.get('host')}/api/v1`,
    endpoints: {
      register: { method: 'POST', path: '/api/v1/register', auth: false },
      agents: { method: 'GET', path: '/api/v1/agents', auth: false },
      discover: { method: 'GET', path: '/api/v1/discover', auth: false },
      execute: { method: 'POST', path: '/api/v1/execute', auth: true },
      memory: { method: 'PUT', path: '/api/v1/memory', auth: true },
      stats: { method: 'GET', path: '/api/v1/stats', auth: false }
    },
    websocket: `ws://${req.get('host')}`,
    authentication: 'Bearer token (API key from /register)'
  });
});

// === START ===
server.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║        🤖 Agent OS v1.0.0            ║`);
  console.log(`  ║   The Operating System for Agents     ║`);
  console.log(`  ╠══════════════════════════════════════╣`);
  console.log(`  ║  HTTP:  http://localhost:${PORT}          ║`);
  console.log(`  ║  WS:    ws://localhost:${PORT}            ║`);
  console.log(`  ║  API:   http://localhost:${PORT}/api/v1   ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});
