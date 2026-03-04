// visualization.js — Neural Galaxy Constellation
// Nodes grow dramatically bigger and glow brighter the more connections they have
// Designed for fullscreen projection at 60fps

// ── State ────────────────────────────────────────────────────────────
let graphData = { nodes: [], links: [] };
let neurons = [];
let neuronMap = {};
let synapticPulses = [];
let backgroundStars = [];
let birthEffects = [];
let dustParticles = [];
let lastFetch = 0;
let prevNodeCount = 0;
const FETCH_INTERVAL = 3000;

// ── Physics ──────────────────────────────────────────────────────────
const DAMPING = 0.965;
const REPULSION = 1800;
const SPRING_LENGTH = 180;
const SPRING_K = 0.003;
const DRIFT_FORCE = 0.04;
const CENTER_GRAVITY = 0.00025;

// ── Color palette — bioluminescent neural tones ──────────────────────
const NEURON_COLORS = [
    [60, 180, 255], [140, 90, 255], [0, 240, 220],
    [255, 100, 200], [80, 255, 160], [255, 180, 50],
    [200, 130, 255], [0, 200, 180],
];

function getNeuronColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
    return NEURON_COLORS[Math.abs(h) % NEURON_COLORS.length];
}

// ── Weight → visual mapping (the key scaling functions) ──────────────
// These make high-weight (popular/connected) nodes dramatically larger & brighter

function weightToSize(w) {
    // Exponential scaling: weight 1 → 14px, weight 5 → 35px, weight 10 → 65px, weight 20+ → 100px
    return 10 + Math.pow(w, 1.4) * 5;
}

function weightToGlowIntensity(w) {
    // Glow multiplier: weight 1 → 1x, weight 5 → 2.2x, weight 10 → 4x, weight 20 → 7x
    return 0.7 + Math.pow(w, 0.85) * 0.6;
}

function weightToGlowLayers(w) {
    // More glow layers for heavier nodes
    return Math.min(Math.floor(3 + w * 0.8), 10);
}

function weightToCoronaSize(w) {
    // Massive corona halo for popular nodes
    return Math.pow(w, 1.3) * 12 + 30;
}

// ── p5 Setup ─────────────────────────────────────────────────────────
function setup() {
    createCanvas(windowWidth, windowHeight);
    textFont('Inter, system-ui, sans-serif');
    textAlign(CENTER, CENTER);
    noCursor();
    pixelDensity(1);

    for (let i = 0; i < 300; i++) {
        backgroundStars.push({
            x: random(width), y: random(height),
            size: random(0.5, 2.5),
            twinkleSpeed: random(0.005, 0.025),
            twinkleOffset: random(TWO_PI),
            brightness: random(60, 180)
        });
    }

    for (let i = 0; i < 60; i++) {
        dustParticles.push({
            x: random(width), y: random(height),
            vx: random(-0.15, 0.15), vy: random(-0.15, 0.15),
            size: random(1, 4), alpha: random(8, 25),
            color: NEURON_COLORS[floor(random(NEURON_COLORS.length))]
        });
    }
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

// ── Main Draw ────────────────────────────────────────────────────────
function draw() {
    background(2, 2, 8);

    if (millis() - lastFetch > FETCH_INTERVAL) {
        lastFetch = millis();
        fetchGraph();
    }

    drawBackgroundStars();
    drawDustParticles();

    if (neurons.length === 0) { drawEmptyState(); return; }

    applyPhysics();
    drawDeepNebulaLayer();
    drawSynapticLinks();
    drawSynapticPulses();
    drawNeurons();
    drawBirthEffects();
}

// ── Background ───────────────────────────────────────────────────────
function drawBackgroundStars() {
    noStroke();
    for (const s of backgroundStars) {
        let t = 0.5 + 0.5 * sin(frameCount * s.twinkleSpeed + s.twinkleOffset);
        fill(200, 220, 255, s.brightness * t);
        ellipse(s.x, s.y, s.size * t, s.size * t);
    }
}

function drawDustParticles() {
    noStroke();
    for (const d of dustParticles) {
        d.x += d.vx; d.y += d.vy;
        if (d.x < 0) d.x = width; if (d.x > width) d.x = 0;
        if (d.y < 0) d.y = height; if (d.y > height) d.y = 0;
        fill(d.color[0], d.color[1], d.color[2], d.alpha);
        ellipse(d.x, d.y, d.size, d.size);
    }
}

function drawEmptyState() {
    let pulse = 0.5 + sin(frameCount * 0.02) * 0.4;
    noStroke();
    fill(60, 120, 255, 3 * pulse);
    ellipse(width / 2, height / 2, 400, 400);
    fill(255, 255, 255, 45 * pulse);
    textSize(20);
    text('Waiting for ideas…', width / 2, height / 2);
    fill(255, 255, 255, 22 * pulse);
    textSize(13);
    text('Scan the QR code to contribute', width / 2, height / 2 + 32);
}

// ── Nebula Layer ─────────────────────────────────────────────────────
function drawDeepNebulaLayer() {
    noStroke();
    for (const n of neurons) {
        if (n.alpha < 30) continue;
        const col = n.color;
        const a = (n.alpha / 255);
        const intensity = weightToGlowIntensity(n.weight);
        const nebulaSize = weightToCoronaSize(n.weight);

        // Heavy nodes get massive ambient nebula
        fill(col[0], col[1], col[2], a * 2.5 * intensity);
        ellipse(n.x, n.y, nebulaSize * 2.5, nebulaSize * 2.5);
        fill(col[0], col[1], col[2], a * 5 * intensity);
        ellipse(n.x, n.y, nebulaSize * 1.3, nebulaSize * 1.3);
    }
}

// ── Fetch & Merge ────────────────────────────────────────────────────
async function fetchGraph() {
    try {
        const res = await fetch('/api/graph');
        const data = await res.json();
        mergeGraph(data);
    } catch (e) { }
}

function mergeGraph(newData) {
    graphData = newData;

    for (const node of newData.nodes) {
        if (!(node.id in neuronMap)) {
            const angle = random(TWO_PI);
            const dist = random(80, 350);
            const n = {
                id: node.id,
                x: width / 2 + cos(angle) * dist,
                y: height / 2 + sin(angle) * dist,
                vx: random(-0.2, 0.2), vy: random(-0.2, 0.2),
                weight: node.weight,
                targetWeight: node.weight,
                mentions: node.mentions || 1,
                connections: node.connections || 0,
                alpha: 0,
                birthFrame: frameCount,
                driftAngle: random(TWO_PI),
                color: getNeuronColor(node.id),
                pulsePhase: random(TWO_PI),
                dendrites: floor(random(3, 6))
            };
            neuronMap[node.id] = neurons.length;
            neurons.push(n);

            birthEffects.push({
                x: n.x, y: n.y, color: n.color, frame: frameCount,
                maxRadius: 100 + node.weight * 25, duration: 70
            });
        } else {
            const idx = neuronMap[node.id];
            neurons[idx].targetWeight = node.weight;
            neurons[idx].mentions = node.mentions || neurons[idx].mentions;
            neurons[idx].connections = node.connections || neurons[idx].connections;
        }
    }

    if (newData.nodes.length > prevNodeCount && prevNodeCount > 0) {
        for (const link of newData.links) {
            if (random() < 0.5) spawnPulse(link.source, link.target);
        }
    }
    prevNodeCount = newData.nodes.length;

    for (const n of neurons) {
        n.weight = lerp(n.weight, n.targetWeight, 0.06);
    }
}

// ── Synaptic Pulses ──────────────────────────────────────────────────
function spawnPulse(sourceId, targetId) {
    const si = neuronMap[sourceId], ti = neuronMap[targetId];
    if (si === undefined || ti === undefined) return;
    synapticPulses.push({
        source: si, target: ti, progress: 0,
        speed: random(0.008, 0.02),
        color: neurons[si].color,
        size: random(3, 7), trail: []
    });
}

function drawSynapticPulses() {
    noStroke();
    for (let i = synapticPulses.length - 1; i >= 0; i--) {
        const p = synapticPulses[i];
        p.progress += p.speed;

        if (p.progress > 1) {
            const target = neurons[p.target];
            if (target) target.alpha = min(255, target.alpha + 20);
            synapticPulses.splice(i, 1);
            continue;
        }

        const a = neurons[p.source], b = neurons[p.target];
        const t = p.progress;
        const mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.15;
        const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.15;
        const px = bezierPoint(a.x, mx, mx, b.x, t);
        const py = bezierPoint(a.y, my, my, b.y, t);

        p.trail.push({ x: px, y: py });
        if (p.trail.length > 14) p.trail.shift();

        for (let j = 0; j < p.trail.length; j++) {
            const ta = (j / p.trail.length) * 160;
            const ts = p.size * (j / p.trail.length);
            fill(p.color[0], p.color[1], p.color[2], ta);
            ellipse(p.trail[j].x, p.trail[j].y, ts, ts);
        }

        fill(255, 255, 255, 230);
        ellipse(px, py, p.size, p.size);
        fill(p.color[0], p.color[1], p.color[2], 90);
        ellipse(px, py, p.size * 3.5, p.size * 3.5);
    }

    // Random ambient firing
    if (frameCount % 70 === 0 && graphData.links.length > 0) {
        const link = graphData.links[floor(random(graphData.links.length))];
        spawnPulse(link.source, link.target);
    }
}

// ── Birth Bloom ──────────────────────────────────────────────────────
function drawBirthEffects() {
    noStroke();
    for (let i = birthEffects.length - 1; i >= 0; i--) {
        const b = birthEffects[i];
        const age = frameCount - b.frame;
        const t = age / b.duration;
        if (t > 1) { birthEffects.splice(i, 1); continue; }

        const easeOut = 1 - (1 - t) * (1 - t);
        const radius = easeOut * b.maxRadius;
        const alpha = (1 - t);

        stroke(b.color[0], b.color[1], b.color[2], alpha * 130);
        strokeWeight(2.5 * (1 - t));
        noFill();
        ellipse(b.x, b.y, radius * 2, radius * 2);

        noStroke();
        fill(b.color[0], b.color[1], b.color[2], alpha * 40);
        ellipse(b.x, b.y, radius * 1.2, radius * 1.2);

        fill(255, 255, 255, alpha * 100);
        for (let j = 0; j < 8; j++) {
            const sa = (j / 8) * TWO_PI + age * 0.06;
            const sd = radius * 0.6;
            ellipse(b.x + cos(sa) * sd, b.y + sin(sa) * sd, 2.5 * (1 - t), 2.5 * (1 - t));
        }
    }
}

// ── Physics ──────────────────────────────────────────────────────────
function applyPhysics() {
    const n = neurons.length;

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const a = neurons[i], b = neurons[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let force = Math.min(REPULSION / (dist * dist), 1.2);
            let fx = (dx / dist) * force, fy = (dy / dist) * force;
            a.vx += fx; a.vy += fy;
            b.vx -= fx; b.vy -= fy;
        }
    }

    for (const link of graphData.links) {
        const ai = neuronMap[link.source], bi = neuronMap[link.target];
        if (ai === undefined || bi === undefined) continue;
        const a = neurons[ai], b = neurons[bi];
        let dx = b.x - a.x, dy = b.y - a.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        let disp = dist - SPRING_LENGTH;
        let fx = (dx / dist) * disp * SPRING_K, fy = (dy / dist) * disp * SPRING_K;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
    }

    for (const p of neurons) {
        p.vx += (width / 2 - p.x) * CENTER_GRAVITY;
        p.vy += (height / 2 - p.y) * CENTER_GRAVITY;
        p.driftAngle += random(-0.01, 0.01);
        p.vx += cos(p.driftAngle) * DRIFT_FORCE;
        p.vy += sin(p.driftAngle) * DRIFT_FORCE;
        p.vx *= DAMPING; p.vy *= DAMPING;
        p.x += p.vx; p.y += p.vy;

        const m = 120;
        if (p.x < m) p.vx += 0.25; if (p.x > width - m) p.vx -= 0.25;
        if (p.y < m) p.vy += 0.25; if (p.y > height - m) p.vy -= 0.25;
        if (p.alpha < 255) p.alpha = min(255, p.alpha + 2.5);
    }
}

// ── Synaptic Links ───────────────────────────────────────────────────
function drawSynapticLinks() {
    for (const link of graphData.links) {
        const ai = neuronMap[link.source], bi = neuronMap[link.target];
        if (ai === undefined || bi === undefined) continue;
        const a = neurons[ai], b = neurons[bi];

        let alpha = min(a.alpha, b.alpha) / 255;
        let dist = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        let distFade = constrain(map(dist, 80, 500, 1, 0.1), 0.1, 1);

        // Thicker links for stronger co-occurrences
        let strength = (link.strength || 1);
        let thickMult = 0.6 + strength * 0.4;

        const mx = (a.x + b.x) / 2 + (a.y - b.y) * 0.15;
        const my = (a.y + b.y) / 2 + (b.x - a.x) * 0.15;

        const mr = (a.color[0] + b.color[0]) / 2;
        const mg = (a.color[1] + b.color[1]) / 2;
        const mb = (a.color[2] + b.color[2]) / 2;

        noFill();

        // Outer glow
        stroke(mr, mg, mb, alpha * distFade * 12 * thickMult);
        strokeWeight(6 * thickMult);
        bezier(a.x, a.y, mx, my, mx, my, b.x, b.y);

        // Mid glow
        stroke(mr, mg, mb, alpha * distFade * 30 * thickMult);
        strokeWeight(2.5 * thickMult);
        bezier(a.x, a.y, mx, my, mx, my, b.x, b.y);

        // Core dendrite
        stroke(mr, mg, mb, alpha * distFade * 55);
        strokeWeight(0.8 * thickMult);
        bezier(a.x, a.y, mx, my, mx, my, b.x, b.y);
    }
    noStroke();
}

// ── Neurons ──────────────────────────────────────────────────────────
function drawNeurons() {
    // Sort by weight so heavy nodes draw on top
    const sorted = [...neurons].sort((a, b) => a.weight - b.weight);

    for (const n of sorted) {
        const size = weightToSize(n.weight);
        const glowI = weightToGlowIntensity(n.weight);
        const layers = weightToGlowLayers(n.weight);
        const a = n.alpha / 255;
        const col = n.color;

        // Breathing — heavier nodes pulse more visibly
        const breathAmp = 0.08 + n.weight * 0.008;
        const breath = 1.0 + sin(frameCount * 0.04 + n.pulsePhase) * breathAmp;

        noStroke();

        // Corona glow layers — MORE and BRIGHTER for heavy nodes
        for (let i = layers; i >= 1; i--) {
            let gs = size * (1.8 + i * 0.9) * breath;
            let ga = (5 * glowI / (i * 0.6)) * a;
            fill(col[0], col[1], col[2], ga);
            ellipse(n.x, n.y, gs, gs);
        }

        // Inner radiant body — intensity scales with weight
        fill(col[0], col[1], col[2], (40 + n.weight * 5) * a);
        ellipse(n.x, n.y, size * 1.6 * breath, size * 1.6 * breath);

        // Soma (cell body) — proportionally larger for heavy nodes
        const somaRatio = 0.45 + n.weight * 0.008;
        fill(
            lerp(col[0], 255, 0.5),
            lerp(col[1], 255, 0.5),
            lerp(col[2], 255, 0.5),
            (180 + n.weight * 5) * a
        );
        ellipse(n.x, n.y, size * somaRatio, size * somaRatio);

        // Nucleus — bright white center
        fill(255, 255, 255, (220 + n.weight * 3) * a);
        ellipse(n.x, n.y, size * 0.15 + n.weight * 0.3, size * 0.15 + n.weight * 0.3);

        // Dendrite spikes — more for heavily connected nodes
        const dendCount = min(floor(3 + n.connections * 0.5), 12);
        if (dendCount > 0 && n.weight > 1) {
            stroke(col[0], col[1], col[2], (30 + n.weight * 3) * a);
            strokeWeight(0.8 + n.weight * 0.08);
            for (let d = 0; d < dendCount; d++) {
                const dAngle = (d / dendCount) * TWO_PI + frameCount * 0.002 + n.birthFrame;
                const dLen = size * (0.7 + 0.3 * sin(frameCount * 0.02 + d * 2.5)) * breath;
                const dx = n.x + cos(dAngle) * dLen;
                const dy = n.y + sin(dAngle) * dLen;
                line(n.x, n.y, dx, dy);

                noStroke();
                fill(col[0], col[1], col[2], (50 + n.weight * 4) * a);
                ellipse(dx, dy, 3 + n.weight * 0.3, 3 + n.weight * 0.3);
                stroke(col[0], col[1], col[2], (30 + n.weight * 3) * a);
                strokeWeight(0.8 + n.weight * 0.08);
            }
            noStroke();
        }

        // Cross flare on high-weight hubs
        if (n.weight > 4) {
            let flLen = size * 1.5 * breath;
            let flAlpha = min(30 + n.weight * 2, 60) * a;
            stroke(col[0], col[1], col[2], flAlpha);
            strokeWeight(1.5 + n.weight * 0.1);
            line(n.x - flLen, n.y, n.x + flLen, n.y);
            line(n.x, n.y - flLen, n.x, n.y + flLen);
            // Diagonal flares for very popular nodes
            if (n.weight > 8) {
                let dfl = flLen * 0.6;
                strokeWeight(1);
                line(n.x - dfl, n.y - dfl, n.x + dfl, n.y + dfl);
                line(n.x - dfl, n.y + dfl, n.x + dfl, n.y - dfl);
            }
            noStroke();
        }

        drawLabel(n, size, a);
    }
}

function drawLabel(n, size, a) {
    // Larger labels for heavier nodes
    let fontSize = 11 + Math.pow(n.weight, 0.7) * 3;
    fontSize = constrain(fontSize, 11, 30);
    textSize(fontSize);
    textStyle(NORMAL);

    const yOff = size * 0.55 + 18;

    // Shadow outline for projection legibility
    fill(2, 2, 8, a * 200);
    for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
            if (ox === 0 && oy === 0) continue;
            text(n.id, n.x + ox, n.y + yOff + oy);
        }
    }

    // Brighter label for heavier nodes
    let labelBright = min(200 + n.weight * 5, 255);
    fill(labelBright, labelBright + 10, 255, a * 240);
    text(n.id, n.x, n.y + yOff);
}

// ── Init ─────────────────────────────────────────────────────────────
window.addEventListener('load', () => fetchGraph());
