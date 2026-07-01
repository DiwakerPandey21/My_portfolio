import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
let scene, camera, renderer, controls;
let animationFrameId = null;
let starField, starField2, platform, gridHelper;
const interactiveObjects = [];
const appObjectMap = {};
const dynamicTextures = [];

// Meteor system
const meteoroids = [];
const METEOR_COUNT = 12;

// Cursor trail particle system
let cursorTrailParticles = null;
const TRAIL_COUNT = 80;
const trailPositions = [];
const trailAlphas = [];
let mouseWorld = new THREE.Vector3();
let mouseNDC = new THREE.Vector2();

// ═══════════════════════════════════════════════════════
// COLORS
// ═══════════════════════════════════════════════════════
const COLORS = {
  bg: 0x020206,
  platform: 0x0a0c14,
  neonCyan: 0x00f3ff,
  neonMagenta: 0xff007f,
  neonGreen: 0x39ff14,
  neonYellow: 0xffd700,
  neonOrange: 0xff6b35,
  darkGlass: 0x121726,
  metalFrame: 0x252a3a,
  metalDark: 0x181d2a,
  warmWhite: 0xffe8d6
};

// ═══════════════════════════════════════════════════════
// CAMERA CONFIG
// ═══════════════════════════════════════════════════════
const frustumSize = 14;
const defaultCameraPos = new THREE.Vector3(14, 11, 14);
const defaultTarget = new THREE.Vector3(0, -0.5, 0);
let isZoomed = false;
let currentZoomedApp = null;

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function createNeonOutline(geometry, color) {
  const edges = new THREE.EdgesGeometry(geometry);
  const lineMat = new THREE.LineBasicMaterial({
    color: color,
    linewidth: 2,
    transparent: true,
    opacity: 0.85
  });
  return new THREE.LineSegments(edges, lineMat);
}

function getCSSColor(color) {
  if (typeof color === 'number') {
    return '#' + color.toString(16).padStart(6, '0');
  }
  return color;
}

// Helper to build a neon ring (circle) of line segments
function createNeonRing(radius, segments, color, opacity) {
  const geo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  geo.setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({
    color, transparent: true, opacity: opacity || 0.7
  }));
}

// ═══════════════════════════════════════════════════════
// TEXT TEXTURES
// ═══════════════════════════════════════════════════════
function createHUDLabelTexture(text, color) {
  const cssColor = getCSSColor(color);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 128);

  // Semi-transparent dark background for readability
  ctx.fillStyle = 'rgba(2,2,6,0.5)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 8);
  ctx.fill();

  // Bracket border
  ctx.strokeStyle = cssColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 488, 104);

  // Corner brackets
  ctx.fillStyle = cssColor;
  const len = 22;
  ctx.fillRect(12, 12, len, 5);
  ctx.fillRect(12, 12, 5, len);
  ctx.fillRect(500 - len, 12, len, 5);
  ctx.fillRect(495, 12, 5, len);
  ctx.fillRect(12, 111, len, 5);
  ctx.fillRect(12, 116 - len, 5, len);
  ctx.fillRect(500 - len, 111, len, 5);
  ctx.fillRect(495, 116 - len, 5, len);

  // Glow text
  ctx.shadowColor = cssColor;
  ctx.shadowBlur = 16;
  ctx.fillStyle = cssColor;
  ctx.font = 'bold 36px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);
  // Double render for extra glow
  ctx.fillText(text, 256, 64);

  return new THREE.CanvasTexture(canvas);
}

function createFloatingLabel(text, color, pos) {
  const texture = createHUDLabelTexture(text, color);
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.92,
    depthTest: true
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.copy(pos);
  sprite.scale.set(2.6, 0.65, 1.0);
  sprite.userData = {
    isFloating: true,
    baseY: pos.y,
    bobOffset: Math.random() * Math.PI * 2
  };
  scene.add(sprite);
  return sprite;
}

function createDynamicScreenTexture(appId, lines, color) {
  const cssColor = getCSSColor(color);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);

  dynamicTextures.push({
    appId, canvas, ctx, texture, lines,
    color: cssColor,
    scanY: 0,
    cursorTick: 0
  });
  return texture;
}

function updateDynamicScreens() {
  dynamicTextures.forEach((screen) => {
    const ctx = screen.ctx;
    const w = screen.canvas.width;
    const h = screen.canvas.height;

    ctx.fillStyle = '#060810';
    ctx.fillRect(0, 0, w, h);

    // Subtle background grid
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Border
    ctx.strokeStyle = screen.color;
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Text lines
    ctx.shadowColor = screen.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = screen.color;
    ctx.font = '28px monospace';
    ctx.textAlign = 'left';
    screen.lines.forEach((line, i) => {
      ctx.fillText(line, 35, 60 + i * 48);
    });

    // Blinking cursor
    screen.cursorTick++;
    if (screen.cursorTick % 30 < 15) {
      const lastY = 60 + (screen.lines.length - 1) * 48;
      const tw = ctx.measureText(screen.lines[screen.lines.length - 1]).width;
      ctx.fillRect(38 + tw, lastY - 24, 15, 26);
    }

    // Scan line
    screen.scanY = (screen.scanY + 2.5) % h;
    ctx.strokeStyle = screen.color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.22;
    ctx.beginPath(); ctx.moveTo(10, screen.scanY); ctx.lineTo(w - 10, screen.scanY); ctx.stroke();
    ctx.globalAlpha = 1.0;
    ctx.shadowBlur = 0;

    screen.texture.needsUpdate = true;
  });
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
export function initThreeScene() {
  const canvas = document.getElementById('three-cv');
  if (!canvas) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.015);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2,  frustumSize * aspect / 2,
    frustumSize / 2,           -frustumSize / 2,
    0.1, 1000
  );
  camera.position.copy(defaultCameraPos);
  camera.lookAt(defaultTarget);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.copy(defaultTarget);
  controls.minZoom = 0.75;
  controls.maxZoom = 2.5;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2.1;

  // ── Lighting ──
  scene.add(new THREE.AmbientLight(0x0c1530, 0.9));

  const dirLight = new THREE.DirectionalLight(0x6085ff, 0.9);
  dirLight.position.set(15, 30, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);

  // Accent rim light (warm from below-back)
  const rimLight = new THREE.DirectionalLight(0xff6b35, 0.25);
  rimLight.position.set(-10, -5, -10);
  scene.add(rimLight);

  // Neon point lights
  const lights = [
    [COLORS.neonCyan, 4, 12, -2.5, 2.0, -2.5],
    [COLORS.neonMagenta, 4, 12, 2.5, 2.0, 2.5],
    [COLORS.neonGreen, 3, 10, 0, 2.5, 0],
    [COLORS.neonOrange, 1.5, 8, 3.5, 1.5, -3.5]
  ];
  lights.forEach(([col, int, dist, x, y, z]) => {
    const pl = new THREE.PointLight(col, int, dist, 1.2);
    pl.position.set(x, y, z);
    scene.add(pl);
  });

  // ── Build ──
  buildCommandDeck();
  buildWorkstations();
  buildStationDetails();
  buildMultiLayerStarfield();
  buildMeteoroids();
  buildCursorTrail();

  // ── Events ──
  window.addEventListener('resize', onWindowResize);
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasMouseMove);

  animate();
}

// ═══════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════
export function stopThreeScene() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  window.removeEventListener('resize', onWindowResize);
  const canvas = document.getElementById('three-cv');
  if (canvas) {
    canvas.removeEventListener('click', onCanvasClick);
    canvas.removeEventListener('mousemove', onCanvasMouseMove);
  }

  scene.traverse((o) => {
    if (!o.isMesh && !o.isLineSegments && !o.isPoints && !o.isSprite) return;
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    }
  });

  interactiveObjects.length = 0;
  dynamicTextures.length = 0;
  meteoroids.length = 0;
  Object.keys(appObjectMap).forEach(k => delete appObjectMap[k]);
  if (controls) controls.dispose();
}

// ═══════════════════════════════════════════════════════
// ANIMATION LOOP
// ═══════════════════════════════════════════════════════
function animate() {
  animationFrameId = requestAnimationFrame(animate);
  const time = Date.now() * 0.001;

  updateDynamicScreens();
  updateMeteoroids(time);
  updateCursorTrail();

  // Gentle platform sway
  if (platform && !isZoomed) {
    platform.rotation.y = Math.sin(time * 0.04) * 0.1;
  }

  scene.traverse((obj) => {
    if (obj.name === 'gyroRing1') {
      obj.rotation.x = time * 0.6;
      obj.rotation.y = time * 0.25;
    }
    if (obj.name === 'gyroRing2') {
      obj.rotation.y = -time * 0.5;
      obj.rotation.z = time * 0.35;
    }
    if (obj.name === 'gyroRing3') {
      obj.rotation.z = time * 0.4;
      obj.rotation.x = -time * 0.3;
    }
    if (obj.name === 'quantumCore') {
      obj.position.y = 1.0 + Math.sin(time * 2.2) * 0.06;
      obj.scale.setScalar(1 + Math.sin(time * 3.2) * 0.05);
    }
    if (obj.userData?.isOrbiting) {
      obj.position.y = obj.userData.baseY + Math.sin(time * 2.5 + obj.userData.orbitOffset) * 0.2;
      obj.rotation.y += 0.015;
      obj.rotation.z += 0.008;
    }
    if (obj.userData?.isFloating) {
      obj.position.y = obj.userData.baseY + Math.sin(time * 3.0 + obj.userData.bobOffset) * 0.08;
    }
    // Antenna pulse
    if (obj.name === 'antennaBulb') {
      obj.material.opacity = 0.6 + Math.sin(time * 5) * 0.35;
    }
    // Halo ring rotation
    if (obj.name === 'haloRing') {
      obj.rotation.y = time * 0.3;
    }
    // Energy conduit pulse
    if (obj.userData?.isConduit) {
      obj.material.opacity = 0.3 + Math.sin(time * 4 + obj.userData.conduitPhase) * 0.2;
    }
  });

  // Starfield rotation
  if (starField) starField.rotation.y = time * 0.008;
  if (starField2) starField2.rotation.y = -time * 0.005;

  // Twinkling: modify star sizes over time
  if (starField) {
    const sizes = starField.geometry.attributes.size;
    if (sizes) {
      for (let i = 0; i < sizes.count; i++) {
        sizes.array[i] = sizes.array[i + sizes.count] !== undefined
          ? 0.1 + Math.sin(time * 2 + i * 0.7) * 0.06
          : 0.1 + Math.sin(time * 2 + i * 0.7) * 0.06;
      }
      sizes.needsUpdate = true;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

// ═══════════════════════════════════════════════════════
// MULTI-LAYER STARFIELD (twinkling)
// ═══════════════════════════════════════════════════════
function buildMultiLayerStarfield() {
  // Layer 1: Dense distant small stars
  const count1 = 2500;
  const geo1 = new THREE.BufferGeometry();
  const pos1 = new Float32Array(count1 * 3);
  const col1 = new Float32Array(count1 * 3);
  const siz1 = new Float32Array(count1);

  const palette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xccd6ff),  // Blue-white
    new THREE.Color(0xffe8c4),  // Warm yellow-white
    new THREE.Color(COLORS.neonCyan),
    new THREE.Color(0x8a6fff)   // Purple
  ];

  for (let i = 0; i < count1; i++) {
    const r = 20 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos1[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos1[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 2;
    pos1[i * 3 + 2] = r * Math.cos(phi);

    const c = palette[Math.floor(Math.random() * palette.length)];
    col1[i * 3]     = c.r;
    col1[i * 3 + 1] = c.g;
    col1[i * 3 + 2] = c.b;
    siz1[i] = 0.06 + Math.random() * 0.1;
  }

  geo1.setAttribute('position', new THREE.BufferAttribute(pos1, 3));
  geo1.setAttribute('color', new THREE.BufferAttribute(col1, 3));
  geo1.setAttribute('size', new THREE.BufferAttribute(siz1, 1));

  starField = new THREE.Points(geo1, new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true
  }));
  scene.add(starField);

  // Layer 2: Sparse large bright stars (closer)
  const count2 = 300;
  const geo2 = new THREE.BufferGeometry();
  const pos2 = new Float32Array(count2 * 3);
  const col2 = new Float32Array(count2 * 3);

  for (let i = 0; i < count2; i++) {
    const r = 12 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pos2[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos2[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) - 1;
    pos2[i * 3 + 2] = r * Math.cos(phi);

    const c = palette[Math.floor(Math.random() * palette.length)];
    col2[i * 3]     = c.r;
    col2[i * 3 + 1] = c.g;
    col2[i * 3 + 2] = c.b;
  }

  geo2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
  geo2.setAttribute('color', new THREE.BufferAttribute(col2, 3));

  starField2 = new THREE.Points(geo2, new THREE.PointsMaterial({
    size: 0.28,
    vertexColors: true,
    transparent: true,
    opacity: 0.65,
    sizeAttenuation: true
  }));
  scene.add(starField2);
}

// ═══════════════════════════════════════════════════════
// METEOROIDS WITH GLOWING TAILS
// ═══════════════════════════════════════════════════════
function buildMeteoroids() {
  const meteorColors = [0xff6b35, 0xff007f, 0xffd700, 0x00f3ff, 0x8a6fff];

  for (let i = 0; i < METEOR_COUNT; i++) {
    const color = meteorColors[Math.floor(Math.random() * meteorColors.length)];
    const group = new THREE.Group();

    // Head: small glowing sphere
    const headGeo = new THREE.SphereGeometry(0.08 + Math.random() * 0.12, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.9
    });
    const head = new THREE.Mesh(headGeo, headMat);
    group.add(head);

    // Tail: line of fading points behind the head
    const tailLen = 12 + Math.floor(Math.random() * 10);
    const tailGeo = new THREE.BufferGeometry();
    const tailPos = new Float32Array(tailLen * 3);
    const tailAlpha = new Float32Array(tailLen);
    for (let j = 0; j < tailLen; j++) {
      tailPos[j * 3] = -j * 0.3;
      tailPos[j * 3 + 1] = 0;
      tailPos[j * 3 + 2] = 0;
      tailAlpha[j] = 1.0 - j / tailLen;
    }
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));

    const tailMat = new THREE.PointsMaterial({
      color: color,
      size: 0.12,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true
    });
    const tail = new THREE.Points(tailGeo, tailMat);
    group.add(tail);

    // Random spawn position & velocity
    const spawnRadius = 18 + Math.random() * 15;
    const angle = Math.random() * Math.PI * 2;
    group.position.set(
      Math.cos(angle) * spawnRadius,
      -5 + Math.random() * 15,
      Math.sin(angle) * spawnRadius
    );

    const speed = 0.03 + Math.random() * 0.06;
    const dir = new THREE.Vector3(
      -Math.cos(angle) + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.3,
      -Math.sin(angle) + (Math.random() - 0.5) * 0.5
    ).normalize();

    // Align tail direction
    group.lookAt(group.position.clone().add(dir));

    meteoroids.push({
      group,
      speed,
      dir,
      spawnRadius,
      tailGeo,
      tailLen
    });

    scene.add(group);
  }
}

function updateMeteoroids(time) {
  meteoroids.forEach((m) => {
    m.group.position.addScaledVector(m.dir, m.speed);

    // Reset when too far
    const dist = m.group.position.length();
    if (dist > m.spawnRadius * 1.5 || dist < 2) {
      const angle = Math.random() * Math.PI * 2;
      m.group.position.set(
        Math.cos(angle) * m.spawnRadius,
        -5 + Math.random() * 15,
        Math.sin(angle) * m.spawnRadius
      );
      m.dir.set(
        -Math.cos(angle) + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.3,
        -Math.sin(angle) + (Math.random() - 0.5) * 0.5
      ).normalize();
      m.group.lookAt(m.group.position.clone().add(m.dir));
    }
  });
}

// ═══════════════════════════════════════════════════════
// CURSOR TRAIL PARTICLES
// ═══════════════════════════════════════════════════════
function buildCursorTrail() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAIL_COUNT * 3);
  const alphas = new Float32Array(TRAIL_COUNT);

  // Initialize off-screen
  for (let i = 0; i < TRAIL_COUNT; i++) {
    positions[i * 3] = 0;
    positions[i * 3 + 1] = -100;
    positions[i * 3 + 2] = 0;
    alphas[i] = 0;
    trailPositions.push(new THREE.Vector3(0, -100, 0));
    trailAlphas.push(0);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: COLORS.neonCyan,
    size: 0.15,
    transparent: true,
    opacity: 0.7,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  cursorTrailParticles = new THREE.Points(geo, mat);
  scene.add(cursorTrailParticles);
}

function updateCursorTrail() {
  if (!cursorTrailParticles) return;

  // Shift positions down
  for (let i = TRAIL_COUNT - 1; i > 0; i--) {
    trailPositions[i].copy(trailPositions[i - 1]);
    trailAlphas[i] = trailAlphas[i - 1] * 0.92; // Fade
  }

  // Newest position = mouse world pos projected onto a plane
  trailPositions[0].copy(mouseWorld);
  trailAlphas[0] = 0.9;

  // Write to geometry
  const posArr = cursorTrailParticles.geometry.attributes.position.array;
  for (let i = 0; i < TRAIL_COUNT; i++) {
    posArr[i * 3]     = trailPositions[i].x;
    posArr[i * 3 + 1] = trailPositions[i].y;
    posArr[i * 3 + 2] = trailPositions[i].z;
  }
  cursorTrailParticles.geometry.attributes.position.needsUpdate = true;

  // Overall opacity driven by most recent alpha
  cursorTrailParticles.material.opacity = trailAlphas[0];
}

// ═══════════════════════════════════════════════════════
// COMMAND DECK (PLATFORM)
// ═══════════════════════════════════════════════════════
function buildCommandDeck() {
  const platformGroup = new THREE.Group();

  // Main deck
  const deckGeo = new THREE.CylinderGeometry(5.2, 5.5, 0.6, 8);
  const deckMat = new THREE.MeshStandardMaterial({
    color: COLORS.platform,
    roughness: 0.15,
    metalness: 0.92,
    flatShading: true
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.receiveShadow = true;
  platformGroup.add(deck);
  platformGroup.add(createNeonOutline(deckGeo, COLORS.neonCyan));

  // Sub-base
  const subGeo = new THREE.CylinderGeometry(4.2, 4.8, 1.2, 8);
  const subBase = new THREE.Mesh(subGeo, new THREE.MeshStandardMaterial({ color: 0x080a10, metalness: 0.95 }));
  subBase.position.y = -0.9;
  platformGroup.add(subBase);
  platformGroup.add(createNeonOutline(subGeo, new THREE.Color(COLORS.neonCyan).multiplyScalar(0.3)));

  // Deep core pillar (below sub-base)
  const pillarGeo = new THREE.CylinderGeometry(1.5, 2.0, 3.0, 8);
  const pillar = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: 0x060810, metalness: 0.95, roughness: 0.3 }));
  pillar.position.y = -3.0;
  platformGroup.add(pillar);
  platformGroup.add(createNeonOutline(pillarGeo, COLORS.neonCyan));

  // Grid helper
  gridHelper = new THREE.GridHelper(9.5, 18, COLORS.neonCyan, 0x0a1030);
  gridHelper.position.y = 0.31;
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.2;
  platformGroup.add(gridHelper);

  // Under-deck glow ring
  const ringGeo = new THREE.RingGeometry(4.8, 5.0, 8);
  const glowRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
    color: COLORS.neonCyan, side: THREE.DoubleSide, transparent: true, opacity: 0.55
  }));
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = -1.5;
  platformGroup.add(glowRing);

  // Second glow ring (orange, lower)
  const ring2Geo = new THREE.RingGeometry(1.8, 2.1, 8);
  const glowRing2 = new THREE.Mesh(ring2Geo, new THREE.MeshBasicMaterial({
    color: COLORS.neonOrange, side: THREE.DoubleSide, transparent: true, opacity: 0.4
  }));
  glowRing2.rotation.x = Math.PI / 2;
  glowRing2.position.y = -4.5;
  platformGroup.add(glowRing2);

  // Surface panel details: angled trim strips on the deck
  const trimMat = new THREE.MeshStandardMaterial({ color: COLORS.metalDark, metalness: 0.9, roughness: 0.2 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.62, 2.2),
      trimMat
    );
    strip.position.set(Math.cos(angle) * 3.2, 0, Math.sin(angle) * 3.2);
    strip.rotation.y = angle;
    platformGroup.add(strip);
  }

  platform = platformGroup;
  scene.add(platform);
}

// ═══════════════════════════════════════════════════════
// STATION DETAIL STRUCTURES
// ═══════════════════════════════════════════════════════
function buildStationDetails() {
  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.metalFrame, metalness: 0.85, roughness: 0.3 });

  // ── 1. Communication Antenna Towers (4 corners) ──
  const antennaPositions = [
    { x: 4.2, z: 0, color: COLORS.neonCyan },
    { x: -4.2, z: 0, color: COLORS.neonMagenta },
    { x: 0, z: 4.2, color: COLORS.neonGreen },
    { x: 0, z: -4.2, color: COLORS.neonOrange }
  ];

  antennaPositions.forEach((ap) => {
    const antGroup = new THREE.Group();
    antGroup.position.set(ap.x, 0.3, ap.z);

    // Pole
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 2.5, 6),
      frameMat
    );
    pole.position.y = 1.25;
    antGroup.add(pole);

    // Cross arms
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.03, 0.03),
      frameMat
    );
    arm.position.y = 2.2;
    antGroup.add(arm);

    const arm2 = arm.clone();
    arm2.rotation.y = Math.PI / 2;
    arm2.position.y = 1.8;
    antGroup.add(arm2);

    // Pulsing tip bulb
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: ap.color, transparent: true, opacity: 0.8 })
    );
    bulb.position.y = 2.55;
    bulb.name = 'antennaBulb';
    antGroup.add(bulb);

    // Dish
    const dishGeo = new THREE.ConeGeometry(0.25, 0.15, 8, 1, true);
    const dish = new THREE.Mesh(dishGeo, new THREE.MeshStandardMaterial({
      color: COLORS.metalFrame, metalness: 0.9, roughness: 0.2, side: THREE.DoubleSide
    }));
    dish.position.y = 2.0;
    dish.rotation.x = Math.PI;
    antGroup.add(dish);

    platform.add(antGroup);
  });

  // ── 2. Holographic Halo Ring (floating above platform) ──
  const haloRing = createNeonRing(6.5, 48, COLORS.neonCyan, 0.35);
  haloRing.position.y = 3.5;
  haloRing.name = 'haloRing';
  platform.add(haloRing);

  const haloRing2 = createNeonRing(6.8, 48, COLORS.neonMagenta, 0.2);
  haloRing2.position.y = 3.3;
  haloRing2.rotation.x = Math.PI / 12;
  platform.add(haloRing2);

  // ── 3. Energy Conduit Pipes (under-deck) ──
  const conduitMat = new THREE.MeshBasicMaterial({
    color: COLORS.neonGreen,
    transparent: true,
    opacity: 0.4
  });

  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 8;
    const conduit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 4.5, 6),
      conduitMat.clone()
    );
    conduit.position.set(
      Math.cos(angle) * 2.5,
      -1.5,
      Math.sin(angle) * 2.5
    );
    conduit.rotation.x = Math.PI / 6;
    conduit.rotation.z = angle;
    conduit.userData = { isConduit: true, conduitPhase: i * 1.5 };
    platform.add(conduit);
  }

  // ── 4. Docking Arm Extensions (2 sides) ──
  const dockArmMat = new THREE.MeshStandardMaterial({ color: COLORS.metalDark, metalness: 0.9, roughness: 0.15 });
  [{ x: 5.0, z: 2.0, rot: 0.3 }, { x: -5.0, z: -2.0, rot: -0.3 }].forEach((d) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(d.x, -0.3, d.z);

    // Main beam
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.12, 0.12), dockArmMat);
    beam.rotation.y = d.rot;
    armGroup.add(beam);
    armGroup.add(createNeonOutline(new THREE.BoxGeometry(2.0, 0.12, 0.12), COLORS.neonCyan));

    // Clamp at end
    const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), dockArmMat);
    clamp.position.set(d.x > 0 ? 1.1 : -1.1, 0, 0);
    armGroup.add(clamp);
    armGroup.add(createNeonOutline(new THREE.BoxGeometry(0.3, 0.4, 0.3), COLORS.neonOrange));

    // Nav light
    const navLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.05),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    navLight.position.set(d.x > 0 ? 1.3 : -1.3, 0.25, 0);
    navLight.name = 'antennaBulb'; // reuse pulse animation
    armGroup.add(navLight);

    platform.add(armGroup);
  });

  // ── 5. Vertical Data Cables (connecting deck to halo) ──
  const cableMat = new THREE.LineBasicMaterial({ color: COLORS.neonCyan, transparent: true, opacity: 0.2 });
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const r = 4.5;
    const geo = new THREE.BufferGeometry();
    const pts = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12;
      pts.push(new THREE.Vector3(
        Math.cos(angle) * r * (1 - t * 0.3),
        0.3 + t * 3.2,
        Math.sin(angle) * r * (1 - t * 0.3)
      ));
    }
    geo.setFromPoints(pts);
    platform.add(new THREE.Line(geo, cableMat));
  }

  // ── 6. Floating Satellite Debris / Small Objects ──
  const debrisMat = new THREE.MeshStandardMaterial({
    color: 0x555577,
    metalness: 0.8,
    roughness: 0.4
  });

  for (let i = 0; i < 8; i++) {
    const r = 8 + Math.random() * 6;
    const angle = Math.random() * Math.PI * 2;
    const y = -3 + Math.random() * 8;
    const size = 0.08 + Math.random() * 0.15;

    const geoType = Math.random() > 0.5
      ? new THREE.TetrahedronGeometry(size)
      : new THREE.OctahedronGeometry(size);

    const debris = new THREE.Mesh(geoType, debrisMat);
    debris.position.set(Math.cos(angle) * r, y, Math.sin(angle) * r);
    debris.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    debris.userData = {
      isOrbiting: true,
      baseY: y,
      orbitOffset: Math.random() * Math.PI * 2
    };
    scene.add(debris);
  }
}

// ═══════════════════════════════════════════════════════
// WORKSTATIONS
// ═══════════════════════════════════════════════════════
function buildWorkstations() {
  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.metalFrame, metalness: 0.85, roughness: 0.3 });
  const consolePanelMat = new THREE.MeshStandardMaterial({ color: 0x141926, metalness: 0.9, roughness: 0.25 });

  // ══════════════════════════════════════
  // 1. PROJECTS: Double Monitor Console
  // ══════════════════════════════════════
  const projectsGroup = new THREE.Group();
  projectsGroup.position.set(-2.2, 0.3, -2.2);

  const deskBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.0), consolePanelMat);
  deskBase.position.y = 0.35;
  deskBase.castShadow = true;
  deskBase.receiveShadow = true;
  projectsGroup.add(deskBase);
  projectsGroup.add((() => { const o = createNeonOutline(new THREE.BoxGeometry(2.2, 0.7, 1.0), COLORS.neonCyan); o.position.y = 0.35; return o; })());

  // Legs
  [[-1.0, 0], [1.0, 0]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), frameMat);
    leg.position.set(x, 0.35, z);
    projectsGroup.add(leg);
  });

  // Monitors
  const monitorGroup = new THREE.Group();
  monitorGroup.position.set(0, 1.05, 0.15);

  const projLines = ['SYS: WORKSTATION_A', 'SELECT_PROJECT...', '1. CivicPulse (Civic)', '2. GymMaster (Gym)', '3. SuppSync (Health)'];
  const projTex = createDynamicScreenTexture('projects', projLines, COLORS.neonCyan);
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), new THREE.MeshBasicMaterial({ map: projTex, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  s1.position.set(-0.45, 0, 0);
  s1.rotation.y = Math.PI / 10;
  monitorGroup.add(s1);
  const sf1 = createNeonOutline(new THREE.BoxGeometry(0.85, 0.55, 0.02), COLORS.neonCyan);
  sf1.position.copy(s1.position);
  sf1.rotation.y = s1.rotation.y;
  monitorGroup.add(sf1);

  const dataLines = ['DIAGNOSTICS: STABLE', 'LOAD: 12.4% / MERN', 'DB_CONN: CONNECTED', 'API_GATEWAY: ACTIVE', 'SSL: EXPIRES IN 365d'];
  const dataTex = createDynamicScreenTexture('projects_diag', dataLines, COLORS.neonCyan);
  const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), new THREE.MeshBasicMaterial({ map: dataTex, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  s2.position.set(0.45, 0, 0);
  s2.rotation.y = -Math.PI / 10;
  monitorGroup.add(s2);
  const sf2 = createNeonOutline(new THREE.BoxGeometry(0.85, 0.55, 0.02), COLORS.neonCyan);
  sf2.position.copy(s2.position);
  sf2.rotation.y = s2.rotation.y;
  monitorGroup.add(sf2);

  projectsGroup.add(monitorGroup);

  // Keyboard
  projectsGroup.add((() => {
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.02, 0.25), new THREE.MeshBasicMaterial({ color: COLORS.neonCyan, transparent: true, opacity: 0.5 }));
    kb.position.set(0, 0.72, -0.15);
    return kb;
  })());

  // Cable from desk to floor
  const cableGeo = new THREE.BufferGeometry();
  cableGeo.setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, -0.35, 0.5)]);
  projectsGroup.add(new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: COLORS.neonCyan, transparent: true, opacity: 0.3 })));

  projectsGroup.userData = { appId: 'projects' };
  platform.add(projectsGroup);
  interactiveObjects.push(projectsGroup);
  appObjectMap['projects'] = projectsGroup;
  createFloatingLabel('PROJECTS', COLORS.neonCyan, new THREE.Vector3(-2.2, 2.1, -2.2));

  // ══════════════════════════════════════
  // 2. ABOUT / RESUME: Holographic Board
  // ══════════════════════════════════════
  const aboutGroup = new THREE.Group();
  aboutGroup.position.set(-3.0, 0.3, 1.2);

  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 1.4), frameMat);
  standBase.position.y = 0.08;
  aboutGroup.add(standBase);

  const holoFrame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.0, 1.3), frameMat);
  holoFrame.position.y = 1.0;
  aboutGroup.add(holoFrame);
  aboutGroup.add(createNeonOutline(new THREE.BoxGeometry(0.08, 2.0, 1.3), COLORS.neonMagenta));

  const profileLines = ['SYS: PROFILE_INFO', 'NAME: Diwaker Pandey', 'ROLE: CSE Dev / LPU', 'CGPA: 7.24 / B.Tech', 'SKILL: MERN + NextJS', 'LOC: Bihar, India', 'STATUS: OPEN TO WORK'];
  const profTex = createDynamicScreenTexture('about', profileLines, COLORS.neonMagenta);
  const holoSurf = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.8),
    new THREE.MeshBasicMaterial({ map: profTex, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
  );
  holoSurf.rotation.y = Math.PI / 2;
  holoSurf.position.set(0.05, 1.0, 0);
  aboutGroup.add(holoSurf);

  aboutGroup.userData = { appId: 'about' };
  platform.add(aboutGroup);
  interactiveObjects.push(aboutGroup);
  appObjectMap['about'] = aboutGroup;
  appObjectMap['resume'] = aboutGroup;
  createFloatingLabel('ABOUT DIWAKER', COLORS.neonMagenta, new THREE.Vector3(-3.0, 2.7, 1.2));

  // ══════════════════════════════════════
  // 3. TERMINAL: Quantum Core
  // ══════════════════════════════════════
  const termGroup = new THREE.Group();
  termGroup.position.set(0, 0.3, 0);

  const coreBase = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.3, 8), frameMat);
  coreBase.position.y = 0.15;
  termGroup.add(coreBase);
  termGroup.add(createNeonOutline(new THREE.CylinderGeometry(1.0, 1.1, 0.3, 8), COLORS.neonGreen));

  // Inner stepped pedestal
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.6, 0.15, 8),
    new THREE.MeshStandardMaterial({ color: 0x0f1520, metalness: 0.95 })
  );
  pedestal.position.y = 0.38;
  termGroup.add(pedestal);

  // Quantum core sphere
  const sphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.35, 1),
    new THREE.MeshBasicMaterial({ color: COLORS.neonGreen, transparent: true, opacity: 0.8 })
  );
  sphere.position.y = 1.0;
  sphere.name = 'quantumCore';
  termGroup.add(sphere);

  // Inner glow sphere
  const innerGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
  );
  innerGlow.position.y = 1.0;
  termGroup.add(innerGlow);

  // 3 gyro rings
  const ringLineMat = new THREE.LineBasicMaterial({ color: COLORS.neonGreen, transparent: true, opacity: 0.85 });
  const makeRingGeo = (r) => {
    const g = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 1.0, Math.sin(a) * r));
    }
    g.setFromPoints(pts);
    return g;
  };

  const r1 = new THREE.Line(makeRingGeo(0.65), ringLineMat);
  r1.name = 'gyroRing1';
  termGroup.add(r1);
  const r2 = new THREE.Line(makeRingGeo(0.65).rotateX(Math.PI / 2), ringLineMat);
  r2.name = 'gyroRing2';
  termGroup.add(r2);
  const r3 = new THREE.Line(makeRingGeo(0.55).rotateZ(Math.PI / 3), new THREE.LineBasicMaterial({ color: COLORS.neonCyan, transparent: true, opacity: 0.5 }));
  r3.name = 'gyroRing3';
  termGroup.add(r3);

  // Containment laser pillars
  const laserVerts = new Float32Array([
    -0.8, 0.25, -0.8, -0.8, 1.8, -0.8,
    0.8, 0.25, -0.8,  0.8, 1.8, -0.8,
    0.8, 0.25, 0.8,   0.8, 1.8, 0.8,
    -0.8, 0.25, 0.8,  -0.8, 1.8, 0.8
  ]);
  const laserGeo = new THREE.BufferGeometry();
  laserGeo.setAttribute('position', new THREE.BufferAttribute(laserVerts, 3));
  termGroup.add(new THREE.LineSegments(laserGeo, new THREE.LineBasicMaterial({ color: COLORS.neonGreen, transparent: true, opacity: 0.4 })));

  termGroup.userData = { appId: 'term' };
  platform.add(termGroup);
  interactiveObjects.push(termGroup);
  appObjectMap['term'] = termGroup;
  createFloatingLabel('TERMINAL', COLORS.neonGreen, new THREE.Vector3(0, 2.3, 0));

  // ══════════════════════════════════════
  // 4. SNAKE: Arcade Cabinet
  // ══════════════════════════════════════
  const snakeGroup = new THREE.Group();
  snakeGroup.position.set(2.4, 0.3, 2.4);

  const cabBase = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), consolePanelMat);
  cabBase.position.y = 0.45;
  cabBase.castShadow = true;
  snakeGroup.add(cabBase);
  snakeGroup.add(createNeonOutline(new THREE.BoxGeometry(0.9, 0.8, 0.9), COLORS.neonCyan));

  const cabTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.9, 0.85), consolePanelMat);
  cabTop.position.set(0, 1.1, 0);
  snakeGroup.add(cabTop);
  snakeGroup.add(createNeonOutline(new THREE.BoxGeometry(0.85, 0.9, 0.85), COLORS.neonCyan));

  // Marquee sign on top
  const marqueeGeo = new THREE.BoxGeometry(0.75, 0.2, 0.04);
  const marqueeMat = new THREE.MeshBasicMaterial({ color: COLORS.neonYellow, transparent: true, opacity: 0.7 });
  const marquee = new THREE.Mesh(marqueeGeo, marqueeMat);
  marquee.position.set(0, 1.65, -0.43);
  snakeGroup.add(marquee);
  snakeGroup.add(createNeonOutline(marqueeGeo, COLORS.neonYellow));

  const arcadeLines = ['SNAKE_OS v4.0', 'HI-SCORE: 995', 'PLAYING: ACTIVE', ' ', '[INSERT COIN]'];
  const arcTex = createDynamicScreenTexture('snake', arcadeLines, COLORS.neonCyan);
  const arcScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 0.55),
    new THREE.MeshBasicMaterial({ map: arcTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  arcScreen.position.set(-0.435, 1.15, 0);
  arcScreen.rotation.y = -Math.PI / 2;
  snakeGroup.add(arcScreen);

  // Controls
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.75), frameMat);
  shelf.position.set(-0.5, 0.8, 0);
  snakeGroup.add(shelf);

  const stickMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12), frameMat);
  stick.position.set(-0.52, 0.88, -0.15);
  stick.rotation.z = Math.PI / 8;
  snakeGroup.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04), stickMat);
  ball.position.set(-0.54, 0.94, -0.15);
  snakeGroup.add(ball);

  [{ z: 0.08, c: 0xff0000 }, { z: 0.2, c: COLORS.neonYellow }].forEach(({ z, c }) => {
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: c }));
    btn.position.set(-0.5, 0.85, z);
    snakeGroup.add(btn);
  });

  snakeGroup.userData = { appId: 'snake' };
  platform.add(snakeGroup);
  interactiveObjects.push(snakeGroup);
  appObjectMap['snake'] = snakeGroup;
  createFloatingLabel('SNAKE GAME', COLORS.neonCyan, new THREE.Vector3(2.4, 2.3, 2.4));

  // ══════════════════════════════════════
  // 5. ORBITING WIDGETS
  // ══════════════════════════════════════
  const widgets = [
    { appId: 'github', label: 'GITHUB STATS', color: COLORS.neonCyan, x: -3.5, z: -3.5, phase: 0 },
    { appId: 'skills', label: 'MY SKILLS', color: COLORS.neonMagenta, x: 3.5, z: -3.5, phase: Math.PI }
  ];

  widgets.forEach((w) => {
    const wGroup = new THREE.Group();
    wGroup.position.set(w.x, 2.0, w.z);

    const coreMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      new THREE.MeshStandardMaterial({ color: w.color, emissive: w.color, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.9 })
    );
    wGroup.add(coreMesh);
    wGroup.add(createNeonOutline(new THREE.OctahedronGeometry(0.42), w.color));

    // Orbit ring
    const oRing = createNeonRing(0.7, 24, w.color, 0.6);
    wGroup.add(oRing);

    // Second tilted ring
    const oRing2 = createNeonRing(0.55, 20, w.color, 0.35);
    oRing2.rotation.x = Math.PI / 4;
    wGroup.add(oRing2);

    wGroup.userData = { appId: w.appId, isOrbiting: true, baseY: 2.0, orbitOffset: w.phase };
    platform.add(wGroup);
    interactiveObjects.push(wGroup);
    appObjectMap[w.appId] = wGroup;
    createFloatingLabel(w.label, w.color, new THREE.Vector3(w.x, 2.8, w.z));
  });
}

// ═══════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════
function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -frustumSize * aspect / 2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onCanvasMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mouseNDC.set(mouse.x, mouse.y);

  raycaster.setFromCamera(mouse, camera);

  // Project mouse onto a horizontal plane at y=1.5 for trail effect
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.5);
  raycaster.ray.intersectPlane(plane, mouseWorld);
  if (!mouseWorld) mouseWorld = new THREE.Vector3();

  const intersects = raycaster.intersectObjects(interactiveObjects, true);
  const cv = document.getElementById('three-cv');
  cv.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
}

function onCanvasClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects, true);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData.appId) obj = obj.parent;
    if (obj?.userData.appId && window.ow) {
      window.ow(obj.userData.appId);
    }
  }
}

// ═══════════════════════════════════════════════════════
// GSAP CAMERA ZOOMS
// ═══════════════════════════════════════════════════════
function zoomToApp(targetPos) {
  isZoomed = true;
  controls.enabled = false;
  const offset = new THREE.Vector3().copy(defaultCameraPos).normalize().multiplyScalar(4.0);
  const camPos = new THREE.Vector3().copy(targetPos).add(offset);
  camPos.y += 0.4;

  if (window.gsap) {
    window.gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.2, ease: 'power3.out', onUpdate: () => camera.updateProjectionMatrix() });
    window.gsap.to(controls.target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 1.2, ease: 'power3.out', onComplete: () => { controls.enabled = true; } });
  }
}

function zoomOut() {
  isZoomed = false;
  currentZoomedApp = null;
  controls.enabled = false;

  if (window.gsap) {
    window.gsap.to(camera.position, { x: defaultCameraPos.x, y: defaultCameraPos.y, z: defaultCameraPos.z, duration: 1.0, ease: 'power3.inOut', onUpdate: () => camera.updateProjectionMatrix() });
    window.gsap.to(controls.target, { x: defaultTarget.x, y: defaultTarget.y, z: defaultTarget.z, duration: 1.0, ease: 'power3.inOut', onComplete: () => { controls.enabled = true; } });
  }
}

// ═══════════════════════════════════════════════════════
// GLOBAL BINDINGS
// ═══════════════════════════════════════════════════════
window.onWindowOpened = function(appId) {
  if (!window.is3DMode) return;
  const obj = appObjectMap[appId];
  if (obj) {
    currentZoomedApp = appId;
    const pos = new THREE.Vector3();
    obj.getWorldPosition(pos);
    zoomToApp(pos);
  }
};

window.onWindowClosed = function(appId) {
  if (!window.is3DMode) return;
  if (currentZoomedApp === appId || !Object.keys(window.openW || {}).length) {
    zoomOut();
  }
};

window.initThreeScene = initThreeScene;
window.stopThreeScene = stopThreeScene;
