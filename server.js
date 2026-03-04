// server.js — Shared Hippocampus server
// Works locally and on Glitch.com (uses process.env.PORT)
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildGraph } = require('./processor');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_FILE = path.join(__dirname, 'data.json');
const GRAPH_FILE = path.join(__dirname, 'graph.json');

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ── Helpers ──────────────────────────────────────────────────────────

function readData() {
    try {
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch {
        return [];
    }
}

function writeData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function writeGraph(graph) {
    fs.writeFileSync(GRAPH_FILE, JSON.stringify(graph, null, 2), 'utf8');
}

function rebuildGraph() {
    const data = readData();
    const graph = buildGraph(data);
    writeGraph(graph);
    return graph;
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// ── API Routes ───────────────────────────────────────────────────────

app.post('/api/submit', (req, res) => {
    const { idea, tags, emotion } = req.body;
    if (!idea || idea.trim().length === 0) {
        return res.status(400).json({ error: 'Idea text is required' });
    }

    const entry = {
        timestamp: new Date().toISOString(),
        idea: idea.trim(),
        tags: (tags || '').split(',').map(t => t.trim()).filter(t => t.length > 0),
        emotion: emotion || 'other'
    };

    const data = readData();
    data.push(entry);
    writeData(data);
    rebuildGraph();

    res.json({ ok: true, count: data.length });
});

app.get('/api/data', (req, res) => res.json(readData()));

app.get('/api/graph', (req, res) => {
    try {
        res.json(JSON.parse(fs.readFileSync(GRAPH_FILE, 'utf8')));
    } catch {
        res.json({ nodes: [], links: [] });
    }
});

app.get('/api/stats', (req, res) => {
    res.json({ count: readData().length });
});

app.post('/api/reset', (req, res) => {
    writeData([]);
    writeGraph({ nodes: [], links: [] });
    res.json({ ok: true });
});

// Server info — works on Glitch (uses req.headers.host) or locally (falls back to IP)
app.get('/api/info', (req, res) => {
    const host = req.headers.host;
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const baseUrl = `${protocol}://${host}`;

    res.json({
        submitUrl: `${baseUrl}/submit.html`,
        dashboardUrl: `${baseUrl}/`,
        vizUrl: `${baseUrl}/visualize.html`
    });
});

// ── Start ────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║        🧠 SHARED HIPPOCAMPUS                ║');
    console.log('  ╠══════════════════════════════════════════════╣');
    console.log(`  ║  Local:   http://localhost:${PORT}/`);
    console.log(`  ║  Network: http://${ip}:${PORT}/`);
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
});
