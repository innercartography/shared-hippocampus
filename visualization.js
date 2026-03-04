// visualization.js — 3D Neural Galaxy
// Three.js point cloud with shaders, morph, energy pulses, orbit controls
// + floating keyword labels + bright connections

// ── Theme colors ─────────────────────────────────────────────────────
const THEMES = {
    purple: { accent: [0.40, 0.49, 0.92], glow: '#667eea', css: '#667eea' },
    pink: { accent: [0.96, 0.34, 0.42], glow: '#f5576c', css: '#f5576c' },
    blue: { accent: [0.31, 0.67, 1.00], glow: '#4facfe', css: '#4facfe' },
};
let currentTheme = 'purple';

// ── State ────────────────────────────────────────────────────────────
let graphData = { nodes: [], links: [] };
let frozen = false;
let morphed = false;
let morphProgress = 0;
let lastFetch = 0;
const FETCH_INTERVAL = 3000;

// ── Three.js globals ─────────────────────────────────────────────────
let scene, camera, renderer, controls;
let nodeGeometry, nodeMaterial, nodePoints;
let lineGeometry, lineMaterial, lineSegments;
let clock = new THREE.Clock();

// Per-node data
let positions = [];
let spherePositions = [];
let velocities = [];
let weights = [];
let nodeIds = [];
let nodeMap = {};

// Label system
let labelContainer;
let labelElements = [];

// Pulse system
let pulses = [];

// ── Vertex Shader ────────────────────────────────────────────────────
const vertexShader = `
  attribute float size;
  attribute float brightness;
  varying float vBrightness;
  void main() {
    vBrightness = brightness;
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (250.0 / -mvPos.z);
    gl_Position = projectionMatrix * mvPos;
  }
`;

// ── Fragment Shader ──────────────────────────────────────────────────
const fragmentShader = `
  uniform vec3 uColor;
  varying float vBrightness;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    if (d > 0.5) discard;
    
    float glow = 1.0 - smoothstep(0.0, 0.5, d);
    glow = pow(glow, 1.3);
    
    vec3 hotCore = mix(uColor, vec3(1.0), pow(glow, 2.5));
    float alpha = glow * vBrightness;
    
    gl_FragColor = vec4(hotCore, alpha);
  }
`;

// ── Init ─────────────────────────────────────────────────────────────
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050508);
    scene.fog = new THREE.FogExp2(0x050508, 0.0006);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 5000);
    camera.position.set(0, 0, 350);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.insertBefore(renderer.domElement, document.body.firstChild);

    // Create label overlay container
    labelContainer = document.createElement('div');
    labelContainer.id = 'label-container';
    labelContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;overflow:hidden;';
    document.body.appendChild(labelContainer);

    // Orbit controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 0.5;
    controls.minDistance = 50;
    controls.maxDistance = 800;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.3;

    // Node points
    nodeGeometry = new THREE.BufferGeometry();
    const tc = THEMES[currentTheme].accent;
    nodeMaterial = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(tc[0], tc[1], tc[2]) } },
        vertexShader,
        fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    nodePoints = new THREE.Points(nodeGeometry, nodeMaterial);
    scene.add(nodePoints);

    // Connection lines — BRIGHTER
    lineGeometry = new THREE.BufferGeometry();
    lineMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color(tc[0] * 0.7, tc[1] * 0.7, tc[2] * 0.7),
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lineSegments);

    createStarfield();

    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('click', onCanvasClick);

    document.getElementById('density').addEventListener('input', (e) => {
        document.getElementById('density-val').textContent = e.target.value + '%';
    });

    fetchGraph();
    animate();
}

// ── Starfield ────────────────────────────────────────────────────────
function createStarfield() {
    const starCount = 2000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const bright = new Float32Array(starCount);

    for (let i = 0; i < starCount; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 2000;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 2000;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 2000;
        sizes[i] = Math.random() * 1.5 + 0.3;
        bright[i] = Math.random() * 0.4 + 0.1;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('brightness', new THREE.BufferAttribute(bright, 1));

    const starMat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(0.6, 0.7, 1.0) } },
        vertexShader, fragmentShader,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    scene.add(new THREE.Points(geo, starMat));
}

// ── Fetch ────────────────────────────────────────────────────────────
async function fetchGraph() {
    try {
        const [graphRes, statsRes] = await Promise.all([
            fetch('/api/graph'), fetch('/api/stats')
        ]);
        const data = await graphRes.json();
        const stats = await statsRes.json();
        mergeGraph(data);
        document.getElementById('idea-count').textContent = stats.count;
    } catch (e) { }
}

function mergeGraph(newData) {
    graphData = newData;
    let changed = false;

    for (const node of newData.nodes) {
        if (!(node.id in nodeMap)) {
            const idx = nodeIds.length;
            nodeMap[node.id] = idx;
            nodeIds.push(node.id);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 80 + Math.random() * 120;
            positions.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );

            const sr = 140;
            spherePositions.push(
                sr * Math.sin(phi) * Math.cos(theta),
                sr * Math.sin(phi) * Math.sin(theta),
                sr * Math.cos(phi)
            );

            velocities.push(
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1,
                (Math.random() - 0.5) * 0.1
            );
            weights.push(node.weight || 1);

            // Create label element
            createLabel(node.id, idx);
            changed = true;
        } else {
            const idx = nodeMap[node.id];
            weights[idx] = node.weight || 1;
        }
    }

    if (changed) rebuildBuffers();
    updateStats();
}

// ── Label System ─────────────────────────────────────────────────────
function createLabel(text, idx) {
    const el = document.createElement('div');
    el.className = 'node-label';
    el.textContent = text;
    el.style.cssText = `
    position: absolute;
    color: rgba(255,255,255,0.85);
    font-family: 'Inter', sans-serif;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    text-shadow: 0 0 8px rgba(102,126,234,0.6), 0 0 20px rgba(102,126,234,0.3), 0 1px 3px rgba(0,0,0,0.9);
    white-space: nowrap;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: opacity 0.3s;
  `;
    labelContainer.appendChild(el);
    labelElements[idx] = el;
}

function updateLabels() {
    const posAttr = nodeGeometry.getAttribute('position');
    if (!posAttr) return;

    const halfW = window.innerWidth / 2;
    const halfH = window.innerHeight / 2;
    const vec = new THREE.Vector3();

    for (let i = 0; i < nodeIds.length; i++) {
        const el = labelElements[i];
        if (!el) continue;

        vec.set(posAttr.array[i * 3], posAttr.array[i * 3 + 1], posAttr.array[i * 3 + 2]);
        vec.project(camera);

        // Check if behind camera
        if (vec.z > 1) {
            el.style.opacity = '0';
            continue;
        }

        const x = (vec.x * halfW) + halfW;
        const y = -(vec.y * halfH) + halfH;

        // Distance-based opacity and size
        const camDist = camera.position.distanceTo(
            new THREE.Vector3(posAttr.array[i * 3], posAttr.array[i * 3 + 1], posAttr.array[i * 3 + 2])
        );
        const opacity = Math.max(0, Math.min(1, 1.2 - camDist / 500));
        const w = weights[i];
        const fontSize = Math.min(11 + w * 1.5, 22);

        el.style.left = x + 'px';
        el.style.top = (y + 14 + w * 0.8) + 'px';
        el.style.opacity = opacity;
        el.style.fontSize = fontSize + 'px';

        // Brighter labels for heavier nodes
        if (w > 3) {
            el.style.color = 'rgba(255,255,255,0.95)';
            el.style.fontWeight = '600';
        }
    }
}

// ── Buffers ──────────────────────────────────────────────────────────
function rebuildBuffers() {
    const n = nodeIds.length;
    const posArr = new Float32Array(n * 3);
    const sizeArr = new Float32Array(n);
    const brightArr = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        const w = weights[i];
        posArr[i * 3] = lerp(positions[i * 3], spherePositions[i * 3], morphProgress);
        posArr[i * 3 + 1] = lerp(positions[i * 3 + 1], spherePositions[i * 3 + 1], morphProgress);
        posArr[i * 3 + 2] = lerp(positions[i * 3 + 2], spherePositions[i * 3 + 2], morphProgress);

        // Bigger and brighter nodes for higher weight
        sizeArr[i] = 4 + Math.pow(w, 1.3) * 3;
        brightArr[i] = 0.6 + Math.min(w * 0.15, 0.9);
    }

    nodeGeometry.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    nodeGeometry.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));
    nodeGeometry.setAttribute('brightness', new THREE.BufferAttribute(brightArr, 1));
    rebuildLines();
}

function rebuildLines() {
    const linePositions = [];
    const density = parseInt(document.getElementById('density').value) / 100;

    for (const link of graphData.links) {
        if (Math.random() > density) continue;
        const ai = nodeMap[link.source];
        const bi = nodeMap[link.target];
        if (ai === undefined || bi === undefined) continue;

        const posAttr = nodeGeometry.getAttribute('position');
        if (!posAttr) continue;

        linePositions.push(
            posAttr.array[ai * 3], posAttr.array[ai * 3 + 1], posAttr.array[ai * 3 + 2],
            posAttr.array[bi * 3], posAttr.array[bi * 3 + 1], posAttr.array[bi * 3 + 2]
        );
    }

    lineGeometry.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(linePositions), 3));
}

function updateStats() {
    document.getElementById('node-count').textContent = nodeIds.length;
    document.getElementById('link-count').textContent = graphData.links.length;
}

// ── Animation Loop ───────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (time - lastFetch > FETCH_INTERVAL / 1000) {
        lastFetch = time;
        fetchGraph();
    }

    if (!frozen && nodeIds.length > 0) {
        const morphTarget = morphed ? 1 : 0;
        morphProgress += (morphTarget - morphProgress) * 0.03;

        const n = nodeIds.length;
        const posAttr = nodeGeometry.getAttribute('position');
        const sizeAttr = nodeGeometry.getAttribute('size');
        const brightAttr = nodeGeometry.getAttribute('brightness');
        if (posAttr) {
            for (let i = 0; i < n; i++) {
                velocities[i * 3] += (Math.random() - 0.5) * 0.015;
                velocities[i * 3 + 1] += (Math.random() - 0.5) * 0.015;
                velocities[i * 3 + 2] += (Math.random() - 0.5) * 0.015;

                velocities[i * 3] *= 0.98;
                velocities[i * 3 + 1] *= 0.98;
                velocities[i * 3 + 2] *= 0.98;

                positions[i * 3] += velocities[i * 3];
                positions[i * 3 + 1] += velocities[i * 3 + 1];
                positions[i * 3 + 2] += velocities[i * 3 + 2];

                positions[i * 3] += -positions[i * 3] * 0.0003;
                positions[i * 3 + 1] += -positions[i * 3 + 1] * 0.0003;
                positions[i * 3 + 2] += -positions[i * 3 + 2] * 0.0003;

                posAttr.array[i * 3] = lerp(positions[i * 3], spherePositions[i * 3], morphProgress);
                posAttr.array[i * 3 + 1] = lerp(positions[i * 3 + 1], spherePositions[i * 3 + 1], morphProgress);
                posAttr.array[i * 3 + 2] = lerp(positions[i * 3 + 2], spherePositions[i * 3 + 2], morphProgress);

                const w = weights[i];
                const breath = 1.0 + Math.sin(time * 1.5 + i * 0.7) * 0.15;
                sizeAttr.array[i] = (4 + Math.pow(w, 1.3) * 3) * breath;
                brightAttr.array[i] = 0.6 + Math.min(w * 0.15, 0.9);
            }
            posAttr.needsUpdate = true;
            sizeAttr.needsUpdate = true;
            brightAttr.needsUpdate = true;
            rebuildLines();
        }
    }

    animatePulses(delta);

    // Update floating labels every 2 frames for performance
    if (Math.floor(time * 30) % 2 === 0) updateLabels();

    controls.update();
    renderer.render(scene, camera);
}

// ── Energy Pulses ────────────────────────────────────────────────────
function onCanvasClick(event) {
    if (nodeIds.length === 0 || graphData.links.length === 0) return;

    const randomLinks = graphData.links.filter(() => Math.random() < 0.4);
    const tc = THEMES[currentTheme].accent;

    for (const link of randomLinks) {
        const ai = nodeMap[link.source];
        const bi = nodeMap[link.target];
        if (ai === undefined || bi === undefined) continue;

        const posAttr = nodeGeometry.getAttribute('position');
        if (!posAttr) continue;

        pulses.push({
            start: new THREE.Vector3(posAttr.array[ai * 3], posAttr.array[ai * 3 + 1], posAttr.array[ai * 3 + 2]),
            end: new THREE.Vector3(posAttr.array[bi * 3], posAttr.array[bi * 3 + 1], posAttr.array[bi * 3 + 2]),
            progress: 0,
            speed: 0.5 + Math.random() * 0.8,
            color: new THREE.Color(tc[0], tc[1], tc[2]),
            mesh: null
        });
    }

    for (const p of pulses) {
        if (p.mesh) continue;
        const geo = new THREE.SphereGeometry(2, 8, 8);
        const mat = new THREE.MeshBasicMaterial({
            color: p.color, transparent: true, opacity: 1,
            blending: THREE.AdditiveBlending,
        });
        p.mesh = new THREE.Mesh(geo, mat);
        scene.add(p.mesh);

        const glowGeo = new THREE.SphereGeometry(5, 8, 8);
        const glowMat = new THREE.MeshBasicMaterial({
            color: p.color, transparent: true, opacity: 0.4,
            blending: THREE.AdditiveBlending,
        });
        p.glow = new THREE.Mesh(glowGeo, glowMat);
        scene.add(p.glow);
    }
}

function animatePulses(delta) {
    for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.progress += delta * p.speed;

        if (p.progress >= 1) {
            if (p.mesh) scene.remove(p.mesh);
            if (p.glow) scene.remove(p.glow);
            pulses.splice(i, 1);
            continue;
        }

        const pos = new THREE.Vector3().lerpVectors(p.start, p.end, p.progress);
        if (p.mesh) p.mesh.position.copy(pos);
        if (p.glow) {
            p.glow.position.copy(pos);
            p.glow.material.opacity = 0.4 * (1 - p.progress);
        }
    }

    // Ambient random pulses
    if (Math.random() < 0.008 && graphData.links.length > 0) {
        const link = graphData.links[Math.floor(Math.random() * graphData.links.length)];
        const tc = THEMES[currentTheme].accent;
        const ai = nodeMap[link.source];
        const bi = nodeMap[link.target];
        if (ai !== undefined && bi !== undefined) {
            const posAttr = nodeGeometry.getAttribute('position');
            if (posAttr) {
                pulses.push({
                    start: new THREE.Vector3(posAttr.array[ai * 3], posAttr.array[ai * 3 + 1], posAttr.array[ai * 3 + 2]),
                    end: new THREE.Vector3(posAttr.array[bi * 3], posAttr.array[bi * 3 + 1], posAttr.array[bi * 3 + 2]),
                    progress: 0, speed: 0.3 + Math.random() * 0.5,
                    color: new THREE.Color(tc[0], tc[1], tc[2]),
                    mesh: null
                });
                // Create mesh for this pulse
                const p = pulses[pulses.length - 1];
                const geo = new THREE.SphereGeometry(1.5, 6, 6);
                const mat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
                p.mesh = new THREE.Mesh(geo, mat);
                scene.add(p.mesh);
                const glowGeo = new THREE.SphereGeometry(4, 6, 6);
                const glowMat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
                p.glow = new THREE.Mesh(glowGeo, glowMat);
                scene.add(p.glow);
            }
        }
    }
}

// ── Controls ─────────────────────────────────────────────────────────
function toggleMorph() {
    morphed = !morphed;
    document.getElementById('btn-morph').classList.toggle('active', morphed);
}

function toggleFreeze() {
    frozen = !frozen;
    controls.autoRotate = !frozen;
    document.getElementById('btn-freeze').classList.toggle('active', frozen);
}

function resetView() {
    camera.position.set(0, 0, 350);
    camera.lookAt(0, 0, 0);
    controls.reset();
    morphed = false;
    frozen = false;
    morphProgress = 0;
    document.getElementById('btn-morph').classList.remove('active');
    document.getElementById('btn-freeze').classList.remove('active');
}

function setTheme(name) {
    currentTheme = name;
    const tc = THEMES[name].accent;
    nodeMaterial.uniforms.uColor.value.setRGB(tc[0], tc[1], tc[2]);
    lineMaterial.color.setRGB(tc[0] * 0.7, tc[1] * 0.7, tc[2] * 0.7);
    document.documentElement.style.setProperty('--neon-accent', THEMES[name].css);
    document.documentElement.style.setProperty('--neon-glow', THEMES[name].css + '66');
    document.querySelectorAll('.theme-dot').forEach(d => d.classList.remove('active'));
    document.querySelector(`.theme-dot.${name}`).classList.add('active');

    // Update label glow color
    const glowColor = THEMES[name].css;
    labelElements.forEach(el => {
        if (el) el.style.textShadow = `0 0 8px ${glowColor}99, 0 0 20px ${glowColor}4D, 0 1px 3px rgba(0,0,0,0.9)`;
    });
}

// ── Resize ───────────────────────────────────────────────────────────
function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ── Util ─────────────────────────────────────────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Start ────────────────────────────────────────────────────────────
init();
