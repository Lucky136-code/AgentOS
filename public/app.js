// ============================================
// AGENT OS — Frontend (Real API Integration)
// ============================================

const API_BASE = '/api/v1';
let ws = null;

document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    initCountersFromAPI();
    initRegistryFromAPI();
    initPlayground();
    initWebSocket();
    initNetworkViz();
    initMouseGlow();
    initNavScroll();
});

// === PARTICLE BACKGROUND ===
function initParticles() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);

    class Particle {
        constructor() { this.reset(); }
        reset() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 1.5 + 0.5;
            this.speedX = (Math.random() - 0.5) * 0.3;
            this.speedY = (Math.random() - 0.5) * 0.3;
            this.opacity = Math.random() * 0.5 + 0.1;
        }
        update() {
            this.x += this.speedX; this.y += this.speedY;
            if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) this.reset();
        }
        draw() {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(99,102,241,${this.opacity})`; ctx.fill();
        }
    }

    for (let i = 0; i < 80; i++) particles.push(new Particle());

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => { p.update(); p.draw(); });
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 120) {
                    ctx.beginPath(); ctx.moveTo(particles[i].x, particles[i].y); ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(99,102,241,${0.06 * (1 - dist / 120)})`; ctx.lineWidth = 0.5; ctx.stroke();
                }
            }
        }
        requestAnimationFrame(animate);
    }
    animate();
}

// === REAL STATS FROM API ===
async function initCountersFromAPI() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        const stats = await res.json();
        updateStatCards(stats);
    } catch (e) { console.error('Stats fetch failed:', e); }
}

function updateStatCards(stats) {
    const cards = document.querySelectorAll('.stat-number');
    const values = [
        { target: stats.totalServices || 0, label: 'Services' },
        { target: stats.activeAgents || 0, label: 'Active Agents' },
        { target: stats.uptime ? Math.min(99.99, 99 + (stats.uptime / 86400)).toFixed(2) : 0, label: 'Uptime %' },
        { target: stats.totalRequests || 0, label: 'Total Requests' }
    ];
    cards.forEach((card, i) => {
        if (!values[i]) return;
        const target = parseFloat(values[i].target);
        const isDecimal = target % 1 !== 0;
        const duration = 1500, startTime = performance.now();
        function update(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            card.textContent = isDecimal ? (eased * target).toFixed(2) : Math.floor(eased * target).toLocaleString();
            if (progress < 1) requestAnimationFrame(update);
        }
        requestAnimationFrame(update);
        // Update label
        const label = card.nextElementSibling;
        if (label && values[i].label) label.textContent = values[i].label;
    });
}

// === REAL AGENT REGISTRY ===
async function initRegistryFromAPI() {
    const grid = document.getElementById('registry-grid');
    if (!grid) return;

    await loadAgents();

    // Search
    const searchInput = document.getElementById('registry-search-input');
    searchInput.addEventListener('input', debounce(async (e) => {
        const q = e.target.value.toLowerCase();
        await loadAgents(q);
    }, 300));

    // Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            if (filter === 'all') return loadAgents();
            if (filter === 'active') return loadAgents('', 'active');
            return loadAgents('', '', filter);
        });
    });
}

async function loadAgents(search = '', status = '', capability = '') {
    const grid = document.getElementById('registry-grid');
    try {
        let url = `${API_BASE}/agents?`;
        if (status) url += `status=${status}&`;
        if (capability) url += `capability=${capability}&`;
        const res = await fetch(url);
        const data = await res.json();
        let agents = data.agents || [];

        if (search) {
            agents = agents.filter(a =>
                a.name.toLowerCase().includes(search) ||
                a.id.includes(search) ||
                (a.capabilities || []).some(c => c.toLowerCase().includes(search))
            );
        }

        if (agents.length === 0) {
            grid.innerHTML = `<div class="empty-state">
                <p style="color:var(--text-muted);text-align:center;padding:60px 20px;grid-column:1/-1;">
                    No agents registered yet.<br>
                    <span style="font-size:0.85rem;">Use the Playground to register your first agent via <code>POST /v1/register</code></span>
                </p>
            </div>`;
            return;
        }
        renderAgents(agents);
    } catch (e) {
        grid.innerHTML = `<p style="color:var(--accent-rose);text-align:center;padding:40px;grid-column:1/-1;">Failed to load agents: ${e.message}</p>`;
    }
}

function renderAgents(agents) {
    const grid = document.getElementById('registry-grid');
    const colors = ['#6366f1','#06b6d4','#8b5cf6','#34d399','#f59e0b','#f43f5e','#a78bfa','#ec4899'];
    grid.innerHTML = agents.map((a, i) => {
        const caps = a.capabilities || [];
        const color = colors[i % colors.length];
        const timeSince = getTimeSince(a.last_active);
        return `
        <div class="agent-card" data-id="${a.id}">
            <div class="agent-card-header">
                <div class="agent-avatar" style="background:${color}">${a.name[0].toUpperCase()}</div>
                <div><div class="agent-name">${a.name}</div><div class="agent-id">${a.id}</div></div>
                <div class="agent-status"><span class="status-dot ${a.status === 'active' ? 'online' : 'idle'}"></span>${a.status}</div>
            </div>
            <div class="agent-desc">Model: ${a.model} • Created: ${new Date(a.created_at).toLocaleDateString()}</div>
            <div class="agent-caps">${caps.map(c => `<span class="cap-tag">${c}</span>`).join('')}</div>
            <div class="agent-meta">
                <span>⚡ ${(a.total_requests || 0).toLocaleString()} reqs</span>
                <span>📋 ${a.total_tasks || 0} tasks</span>
                <span>🕐 ${timeSince}</span>
            </div>
        </div>`;
    }).join('');
}

// === REAL API PLAYGROUND ===
const ENDPOINTS = {
    register: {
        method: 'POST', path: '/api/v1/register',
        body: `{\n  "name": "my-research-agent",\n  "capabilities": ["search", "summarize", "cite"],\n  "model": "gpt-4o",\n  "memory": true,\n  "sandbox": "micro-vm"\n}`
    },
    discover: {
        method: 'GET', path: '/api/v1/discover?capability=search',
        body: `// GET request — no body needed\n// Query params: capability, protocol, limit`
    },
    execute: {
        method: 'POST', path: '/api/v1/execute',
        body: `{\n  "task": "Search for recent papers on LLM agents",\n  "tools": ["svc_arxiv", "svc_web_search"],\n  "max_steps": 10,\n  "timeout": 30000\n}`,
        needsAuth: true
    },
    memory: {
        method: 'PUT', path: '/api/v1/memory',
        body: `{\n  "operation": "store",\n  "namespace": "research",\n  "data": {\n    "key": "llm-survey-2026",\n    "value": "Survey of 23 recent papers on autonomous agents..."\n  }\n}`,
        needsAuth: true
    },
    status: {
        method: 'GET', path: '/api/v1/stats',
        body: `// GET request — no body needed\n// Returns real-time platform statistics`
    }
};

let lastApiKey = null; // Store from registration

function initPlayground() {
    const endpointBtns = document.querySelectorAll('.endpoint-btn');
    const sendBtn = document.getElementById('pg-send');
    if (!sendBtn) return;

    endpointBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            endpointBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const ep = ENDPOINTS[btn.dataset.endpoint];
            document.getElementById('pg-method').textContent = ep.method;
            document.getElementById('pg-url').textContent = window.location.origin + ep.path;
            document.getElementById('pg-request').textContent = ep.body;
            document.getElementById('pg-response').innerHTML = '<span class="json-comment">// Click "Send Request" to hit the real API</span>';
            document.getElementById('pg-status').textContent = '';
            document.getElementById('pg-status').className = 'response-status';
        });
    });

    sendBtn.addEventListener('click', async () => {
        const activeBtn = document.querySelector('.endpoint-btn.active');
        const ep = ENDPOINTS[activeBtn.dataset.endpoint];
        const statusEl = document.getElementById('pg-status');
        const responseEl = document.getElementById('pg-response');
        const requestEl = document.getElementById('pg-request');

        responseEl.innerHTML = '<span class="json-comment">// Sending request to real API...</span>';
        statusEl.textContent = '⏳ sending...';
        statusEl.className = 'response-status';

        try {
            const fetchOpts = { method: ep.method, headers: { 'Content-Type': 'application/json' } };

            // Add auth if we have a key and endpoint needs it
            if (ep.needsAuth && lastApiKey) {
                fetchOpts.headers['Authorization'] = `Bearer ${lastApiKey}`;
            } else if (ep.needsAuth && !lastApiKey) {
                responseEl.textContent = JSON.stringify({
                    error: "Authentication required. Register an agent first using POST /v1/register to get an API key."
                }, null, 2);
                statusEl.textContent = '401 Unauthorized';
                statusEl.className = 'response-status';
                statusEl.style.color = 'var(--accent-rose)';
                return;
            }

            // Add body for non-GET
            if (ep.method !== 'GET') {
                const bodyText = requestEl.textContent;
                try {
                    fetchOpts.body = bodyText;
                    JSON.parse(bodyText); // validate
                } catch {
                    responseEl.textContent = '// Error: Invalid JSON in request body';
                    statusEl.textContent = 'Invalid JSON';
                    statusEl.style.color = 'var(--accent-rose)';
                    return;
                }
            }

            const startTime = performance.now();
            const res = await fetch(ep.path.split('?')[0] + (ep.path.includes('?') ? '?' + ep.path.split('?')[1] : ''), fetchOpts);
            const duration = Math.round(performance.now() - startTime);
            const data = await res.json();

            // Capture API key from registration
            if (activeBtn.dataset.endpoint === 'register' && data.api_key) {
                lastApiKey = data.api_key;
            }

            statusEl.textContent = `${res.status} ${res.statusText} (${duration}ms)`;
            statusEl.className = 'response-status';
            statusEl.style.color = res.ok ? 'var(--accent-emerald)' : 'var(--accent-rose)';
            responseEl.textContent = JSON.stringify(data, null, 2);

            // Refresh registry after registration
            if (activeBtn.dataset.endpoint === 'register' && res.ok) {
                setTimeout(() => loadAgents(), 500);
            }

        } catch (err) {
            statusEl.textContent = 'Network Error';
            statusEl.style.color = 'var(--accent-rose)';
            responseEl.textContent = JSON.stringify({ error: err.message }, null, 2);
        }
    });
}

// === WEBSOCKET FOR REAL-TIME DASHBOARD ===
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}`);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'stats') updateDashboard(msg.data);
        if (msg.type === 'activity') addActivityItem(msg.data);
    };

    ws.onclose = () => { setTimeout(initWebSocket, 3000); };
    ws.onerror = () => {};
}

function updateDashboard(stats) {
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('dash-active', (stats.activeAgents || 0).toLocaleString());
    el('dash-requests', (stats.totalRequests || 0).toLocaleString());
    el('dash-latency', `${Math.floor(stats.uptime || 0)}s`);
    el('dash-uptime', stats.totalTasks ? `${stats.completedTasks}/${stats.totalTasks}` : '0/0');

    // Update labels
    const labels = { 'dash-active': 'Agents Registered', 'dash-requests': 'Total API Requests', 'dash-latency': 'Server Uptime', 'dash-uptime': 'Tasks Completed' };
    Object.entries(labels).forEach(([id, label]) => {
        const valEl = document.getElementById(id);
        if (valEl) {
            const labelEl = valEl.nextElementSibling;
            if (labelEl) labelEl.textContent = label;
        }
    });

    // Update stat cards in hero too
    const cards = document.querySelectorAll('.stat-number');
    const values = [stats.totalServices || 0, stats.activeAgents || 0, stats.uptime ? Math.min(99.99, 99 + (stats.uptime / 86400)).toFixed(2) : 0, stats.totalRequests || 0];
    cards.forEach((c, i) => { if (values[i] !== undefined) c.textContent = typeof values[i] === 'number' && values[i] % 1 === 0 ? values[i].toLocaleString() : values[i]; });

    // Render activity from stats
    if (stats.recentActivity && stats.recentActivity.length > 0) {
        const feedList = document.getElementById('feed-list');
        if (feedList && feedList.children.length === 0) {
            stats.recentActivity.reverse().forEach(a => addActivityItem(a));
        }
    }
}

function addActivityItem(activity) {
    const feedList = document.getElementById('feed-list');
    if (!feedList) return;

    const icons = { register: '🚀', discover: '🔍', execute: '⚡', memory: '🧠', deregister: '🔴' };
    const colors = { register: '#6366f1', discover: '#06b6d4', execute: '#34d399', memory: '#8b5cf6', deregister: '#f43f5e' };
    const action = activity.action || 'unknown';
    const icon = icons[action] || '📡';
    const color = colors[action] || '#6366f1';
    const timeSince = getTimeSince(activity.created_at);

    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `
        <div class="feed-icon" style="background:${color}22;color:${color}">${icon}</div>
        <div class="feed-text"><strong>${activity.agent_name || 'System'}</strong> ${activity.detail || action}</div>
        <div class="feed-time">${timeSince}</div>
    `;
    feedList.prepend(item);
    if (feedList.children.length > 15) feedList.removeChild(feedList.lastChild);
}

// === NETWORK VISUALIZATION ===
function initNetworkViz() {
    const canvas = document.getElementById('network-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const resize = () => {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width - 48; canvas.height = 340;
    };
    resize();

    const nodes = [];
    const centerX = () => canvas.width / 2, centerY = () => canvas.height / 2;
    nodes.push({ x: canvas.width / 2, y: canvas.height / 2, r: 16, color: '#6366f1', label: 'OS', vx: 0, vy: 0, fixed: true });

    const agentColors = ['#06b6d4', '#8b5cf6', '#34d399', '#f59e0b', '#f43f5e', '#a78bfa'];
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        nodes.push({
            x: canvas.width / 2 + Math.cos(angle) * (80 + Math.random() * 40),
            y: canvas.height / 2 + Math.sin(angle) * (80 + Math.random() * 40),
            r: 6 + Math.random() * 4, color: agentColors[i],
            vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, fixed: false
        });
    }

    let pulses = [];
    setInterval(() => {
        if (pulses.length < 4) {
            const to = 1 + Math.floor(Math.random() * (nodes.length - 1));
            pulses.push({ from: 0, to, progress: 0, color: nodes[to].color });
        }
    }, 1000);

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        nodes[0].x = canvas.width / 2; nodes[0].y = canvas.height / 2;
        nodes.forEach(n => {
            if (n.fixed) return;
            n.x += n.vx; n.y += n.vy;
            if (n.x < 30 || n.x > canvas.width - 30) n.vx *= -1;
            if (n.y < 30 || n.y > canvas.height - 30) n.vy *= -1;
        });
        for (let i = 1; i < nodes.length; i++) {
            ctx.beginPath(); ctx.moveTo(nodes[0].x, nodes[0].y); ctx.lineTo(nodes[i].x, nodes[i].y);
            ctx.strokeStyle = 'rgba(99,102,241,0.12)'; ctx.lineWidth = 1; ctx.stroke();
        }
        pulses = pulses.filter(p => {
            p.progress += 0.015;
            if (p.progress > 1) return false;
            const from = nodes[p.from], to = nodes[p.to];
            const x = from.x + (to.x - from.x) * p.progress, y = from.y + (to.y - from.y) * p.progress;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.fill();
            const grad = ctx.createRadialGradient(x, y, 2, x, y, 10);
            grad.addColorStop(0, p.color + '44'); grad.addColorStop(1, 'transparent');
            ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
            return true;
        });
        nodes.forEach(n => {
            const grad = ctx.createRadialGradient(n.x, n.y, n.r, n.x, n.y, n.r + 12);
            grad.addColorStop(0, n.color + '33'); grad.addColorStop(1, 'transparent');
            ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 12, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
            ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fillStyle = n.color; ctx.fill();
            if (n.label) { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Inter'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n.label, n.x, n.y); }
        });
        requestAnimationFrame(animate);
    }
    animate();
    window.addEventListener('resize', resize);
}

// === MOUSE GLOW ===
function initMouseGlow() {
    document.addEventListener('mousemove', (e) => {
        document.querySelectorAll('.feature-card').forEach(card => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mx', `${e.clientX - rect.left}px`);
            card.style.setProperty('--my', `${e.clientY - rect.top}px`);
        });
    });
}

// === NAV SCROLL ===
function initNavScroll() {
    const nav = document.getElementById('main-nav');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            nav.style.borderBottomColor = 'rgba(99,102,241,0.2)';
            nav.style.background = 'rgba(6,8,15,0.9)';
        } else {
            nav.style.borderBottomColor = 'rgba(99,102,241,0.15)';
            nav.style.background = 'rgba(6,8,15,0.7)';
        }
    });
    document.querySelectorAll('a[href^="#"]').forEach(a => {
        a.addEventListener('click', (e) => {
            const target = document.querySelector(a.getAttribute('href'));
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
    });
}

// === UTILS ===
function debounce(fn, ms) {
    let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}
function getTimeSince(dateStr) {
    if (!dateStr) return 'just now';
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 5) return 'just now';
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}
