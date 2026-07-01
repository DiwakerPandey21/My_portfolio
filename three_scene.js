import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- State Variables ---
let scene, camera, renderer, controls;
let animationFrameId = null;
let starField, platform, gridHelper;
const interactiveObjects = [];
const appObjectMap = {}; // Maps appId -> 3D Object Reference

// Cyberpunk / Sci-Fi Theme Colors
const COLORS = {
  bg: 0x030308,
  platform: 0x0a0c14,
  neonCyan: 0x00f3ff,
  neonMagenta: 0xff007f,
  neonGreen: 0x39ff14,
  neonYellow: 0xffd700,
  darkGlass: 0x121726,
  metalFrame: 0x252a3a
};

// Isometric Orthographic Camera Configuration
const frustumSize = 14;
const defaultCameraPos = new THREE.Vector3(14, 11, 14);
const defaultTarget = new THREE.Vector3(0, -0.5, 0);
let isZoomed = false;
let currentZoomedApp = null;

// Helper to create glowing neon outline for any geometry
function createNeonOutline(geometry, color) {
  const edges = new THREE.EdgesGeometry(geometry);
  const lineMat = new THREE.LineBasicMaterial({
    color: color,
    linewidth: 2,
    transparent: true,
    opacity: 0.8
  });
  return new THREE.LineSegments(edges, lineMat);
}

// --- Initialize Scene ---
export function initThreeScene() {
  const canvas = document.getElementById('three-cv');
  if (!canvas) return;

  // 1. Scene & Renderer Setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.02);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // 2. Isometric Camera Setup
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    -frustumSize * aspect / 2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    1000
  );
  camera.position.copy(defaultCameraPos);
  camera.lookAt(defaultTarget);

  // 3. Orbit Controls (Rotation limiters to preserve isometric feel)
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.copy(defaultTarget);
  controls.minZoom = 0.7;
  controls.maxZoom = 2.5;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI / 2.1; // Restrict looking under the platform

  // 4. Lighting Configuration
  const ambientLight = new THREE.AmbientLight(0x0a1025, 0.8);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0x5a7dff, 0.8);
  dirLight.position.set(15, 30, 15);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  scene.add(dirLight);

  // High-intensity Glowing Neon lights
  const cyanLight = new THREE.PointLight(COLORS.neonCyan, 3, 10, 1.2);
  cyanLight.position.set(-2.5, 1.5, -2.5);
  scene.add(cyanLight);

  const magentaLight = new THREE.PointLight(COLORS.neonMagenta, 3, 10, 1.2);
  magentaLight.position.set(2.5, 1.5, 2.5);
  scene.add(magentaLight);

  const greenLight = new THREE.PointLight(COLORS.neonGreen, 2, 8, 1.2);
  greenLight.position.set(0, 1.8, 0);
  scene.add(greenLight);

  // 5. Build Platforms & Structures
  buildCommandDeck();

  // 6. Build High-Detail Console Workstations
  buildWorkstations();

  // 7. Add Floating Space Nebula Particles
  buildSpaceNebula();

  // 8. Event Listeners
  window.addEventListener('resize', onWindowResize);
  canvas.addEventListener('click', onCanvasClick);
  canvas.addEventListener('mousemove', onCanvasMouseMove);

  // 9. Start Loop
  animate();
}

// --- Clean Up ---
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

  scene.traverse((object) => {
    if (!object.isMesh && !object.isLineSegments && !object.isPoints) return;
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((mat) => mat.dispose());
      } else {
        object.material.dispose();
      }
    }
  });

  interactiveObjects.length = 0;
  Object.keys(appObjectMap).forEach(key => delete appObjectMap[key]);
  
  if (controls) controls.dispose();
}

// --- Animation Loop ---
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  const time = Date.now() * 0.001;

  // Platform rotation (only if user is not interacting and camera is not zoomed)
  if (platform && !isZoomed) {
    platform.rotation.y = Math.sin(time * 0.05) * 0.15; // Gentle sway
  }

  // Floating & Pulsing animations for holograms and elements
  scene.traverse((obj) => {
    // Gyroscope rings rotation
    if (obj.name === "gyroRing1") {
      obj.rotation.x = time * 0.5;
      obj.rotation.y = time * 0.2;
    }
    if (obj.name === "gyroRing2") {
      obj.rotation.y = -time * 0.4;
      obj.rotation.z = time * 0.3;
    }
    if (obj.name === "quantumCore") {
      obj.position.y = 1.0 + Math.sin(time * 2) * 0.08;
      obj.scale.setScalar(1 + Math.sin(time * 3) * 0.06);
    }
    // Float orbiting elements
    if (obj.userData && obj.userData.isOrbiting) {
      obj.position.y = obj.userData.baseY + Math.sin(time * 2.5 + obj.userData.orbitOffset) * 0.2;
      obj.rotation.y += 0.015;
      obj.rotation.z += 0.008;
    }
    // Pulsing hologram opacity
    if (obj.userData && obj.userData.isHologram) {
      obj.material.opacity = obj.userData.baseOpacity + Math.sin(time * 5 + obj.userData.phase) * 0.12;
    }
  });

  // Rotate background star field
  if (starField) {
    starField.rotation.y = time * 0.015;
  }

  controls.update();
  renderer.render(scene, camera);
}

// --- Platform Setup ---
function buildCommandDeck() {
  const platformGroup = new THREE.Group();

  // Floating octagonal metallic base deck
  const deckGeo = new THREE.CylinderGeometry(5.2, 5.5, 0.6, 8);
  const deckMat = new THREE.MeshStandardMaterial({
    color: COLORS.platform,
    roughness: 0.2,
    metalness: 0.9,
    flatShading: true
  });
  const deck = new THREE.Mesh(deckGeo, deckMat);
  deck.receiveShadow = true;
  platformGroup.add(deck);

  // Platform Glowing Neon cyan edge trim
  const deckOutline = createNeonOutline(deckGeo, COLORS.neonCyan);
  platformGroup.add(deckOutline);

  // Sub-base layer (dark support structure)
  const subBaseGeo = new THREE.CylinderGeometry(4.2, 4.8, 1.2, 8);
  const subBaseMat = new THREE.MeshStandardMaterial({ color: 0x080a10, metalness: 0.95 });
  const subBase = new THREE.Mesh(subBaseGeo, subBaseMat);
  subBase.position.y = -0.9;
  platformGroup.add(subBase);

  // Platform Cyber Grid Helper
  gridHelper = new THREE.GridHelper(9.5, 18, COLORS.neonCyan, COLORS.grid);
  gridHelper.position.y = 0.31;
  // Apply opacity to grid lines
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.25;
  platformGroup.add(gridHelper);

  // Under-deck glow ring
  const ringGeo = new THREE.RingGeometry(4.8, 5.0, 8);
  const ringMat = new THREE.MeshBasicMaterial({
    color: COLORS.neonCyan,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65
  });
  const glowRing = new THREE.Mesh(ringGeo, ringMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = -1.5;
  platformGroup.add(glowRing);

  platform = platformGroup;
  scene.add(platform);
}

// --- Construct Detailed Sci-Fi Workstations ---
function buildWorkstations() {
  const frameMat = new THREE.MeshStandardMaterial({ color: COLORS.metalFrame, metalness: 0.85, roughness: 0.3 });
  const consolePanelMat = new THREE.MeshStandardMaterial({ color: 0x141926, metalness: 0.9, roughness: 0.25 });

  // ==========================================
  // 1. PROJECTS DIORAMA: Curved Double Monitor Console
  // ==========================================
  const projectsGroup = new THREE.Group();
  projectsGroup.position.set(-2.2, 0.3, -2.2);

  // Ergonomic curved desk table
  const deskBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.0), consolePanelMat);
  deskBase.position.y = 0.35;
  deskBase.castShadow = true;
  deskBase.receiveShadow = true;
  projectsGroup.add(deskBase);

  const deskEdge = createNeonOutline(new THREE.BoxGeometry(2.2, 0.7, 1.0), COLORS.neonCyan);
  deskEdge.position.y = 0.35;
  projectsGroup.add(deskEdge);

  // Sleek desktop legs
  const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.8), frameMat);
  leg1.position.set(-1.0, 0.35, 0);
  projectsGroup.add(leg1);
  const leg2 = leg1.clone();
  leg2.position.x = 1.0;
  projectsGroup.add(leg2);

  // Double Monitors (Floating Hologram panels)
  const monitorGroup = new THREE.Group();
  monitorGroup.position.set(0, 1.05, 0.15);

  const monitorMat = new THREE.MeshBasicMaterial({
    color: COLORS.neonCyan,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });

  // Left screen
  const screen1 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), monitorMat);
  screen1.position.set(-0.45, 0, 0);
  screen1.rotation.y = Math.PI / 10;
  monitorGroup.add(screen1);
  monitorGroup.add(createNeonOutline(new THREE.BoxGeometry(0.85, 0.55, 0.02), COLORS.neonCyan));

  // Right screen
  const screen2 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), monitorMat);
  screen2.position.set(0.45, 0, 0);
  screen2.rotation.y = -Math.PI / 10;
  monitorGroup.add(screen2);

  // Glow grids on screens
  const screenGrid1 = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.85, 0.55, 4, 3)), new THREE.LineBasicMaterial({ color: COLORS.neonCyan, transparent: true, opacity: 0.3 }));
  screenGrid1.position.copy(screen1.position);
  screenGrid1.rotation.y = screen1.rotation.y;
  monitorGroup.add(screenGrid1);
  const screenGrid2 = screenGrid1.clone();
  screenGrid2.position.copy(screen2.position);
  screenGrid2.rotation.y = screen2.rotation.y;
  monitorGroup.add(screenGrid2);

  projectsGroup.add(monitorGroup);

  // Floating Hologram keyboard on desk
  const keyboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.02, 0.25),
    new THREE.MeshBasicMaterial({ color: COLORS.neonCyan, transparent: true, opacity: 0.6 })
  );
  keyboard.position.set(0, 0.72, -0.15);
  projectsGroup.add(keyboard);

  projectsGroup.userData = { appId: 'projects' };
  platform.add(projectsGroup);
  interactiveObjects.push(projectsGroup);
  appObjectMap['projects'] = projectsGroup;


  // ==========================================
  // 2. ABOUT ME & RESUME: Tech Whiteboard / Holographic Hub
  // ==========================================
  const aboutGroup = new THREE.Group();
  aboutGroup.position.set(-3.0, 0.3, 1.2);

  // Sleek stand
  const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.15, 1.4), frameMat);
  standBase.position.y = 0.08;
  aboutGroup.add(standBase);

  // Vertical holographic display frame
  const holoFrameGeo = new THREE.BoxGeometry(0.08, 2.0, 1.3);
  const holoFrame = new THREE.Mesh(holoFrameGeo, frameMat);
  holoFrame.position.y = 1.0;
  aboutGroup.add(holoFrame);
  aboutGroup.add(createNeonOutline(holoFrameGeo, COLORS.neonMagenta));

  // The glowing display surface
  const holoSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 1.8),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonMagenta,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    })
  );
  holoSurface.rotation.y = Math.PI / 2;
  holoSurface.position.set(0.05, 1.0, 0);
  holoSurface.userData = { isHologram: true, baseOpacity: 0.3, phase: 0 };
  aboutGroup.add(holoSurface);

  // Hologram details: code/profile graph wireframe lines
  const detailGeo = new THREE.BufferGeometry();
  const detailVertices = new Float32Array([
    // Profile box outline
    0.06, 1.4, -0.3,   0.06, 1.7, -0.3,
    0.06, 1.7, -0.3,   0.06, 1.7, 0.0,
    0.06, 1.7, 0.0,    0.06, 1.4, 0.0,
    0.06, 1.4, 0.0,    0.06, 1.4, -0.3,
    // Horizontal text lines
    0.06, 1.6, 0.1,    0.06, 1.6, 0.4,
    0.06, 1.5, 0.1,    0.06, 1.5, 0.35,
    0.06, 1.4, 0.1,    0.06, 1.4, 0.45,
    // Skill stats bar chart representation
    0.06, 0.8, -0.4,   0.06, 0.8, 0.3,
    0.06, 0.6, -0.4,   0.06, 0.6, 0.15,
    0.06, 0.4, -0.4,   0.06, 0.4, 0.4
  ]);
  detailGeo.setAttribute('position', new THREE.BufferAttribute(detailVertices, 3));
  const detailLines = new THREE.LineSegments(detailGeo, new THREE.LineBasicMaterial({ color: COLORS.neonMagenta }));
  aboutGroup.add(detailLines);

  aboutGroup.userData = { appId: 'about' };
  platform.add(aboutGroup);
  interactiveObjects.push(aboutGroup);
  appObjectMap['about'] = aboutGroup;
  appObjectMap['resume'] = aboutGroup;


  // ==========================================
  // 3. TERMINAL: Quantum AI Core Generator (Center core)
  // ==========================================
  const terminalGroup = new THREE.Group();
  terminalGroup.position.set(0, 0.3, 0);

  // Core base cylinder
  const coreBaseGeo = new THREE.CylinderGeometry(1.0, 1.1, 0.3, 8);
  const coreBase = new THREE.Mesh(coreBaseGeo, frameMat);
  coreBase.position.y = 0.15;
  terminalGroup.add(coreBase);
  terminalGroup.add(createNeonOutline(coreBaseGeo, COLORS.neonGreen));

  // Quantum floating core (sphere + rotating rings)
  const sphereGeo = new THREE.IcosahedronGeometry(0.35, 1);
  const sphereMat = new THREE.MeshBasicMaterial({
    color: COLORS.neonGreen,
    transparent: true,
    opacity: 0.8
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.position.y = 1.0;
  sphere.name = "quantumCore";
  terminalGroup.add(sphere);

  // Glowing rings representing magnetic confinement
  const ring1Mat = new THREE.LineBasicMaterial({ color: COLORS.neonGreen, transparent: true, opacity: 0.8 });
  const ringGeo1 = new THREE.BufferGeometry();
  const ringPoints1 = [];
  const radius = 0.65;
  for (let i = 0; i <= 32; i++) {
    const theta = (i / 32) * Math.PI * 2;
    ringPoints1.push(new THREE.Vector3(Math.cos(theta) * radius, 1.0, Math.sin(theta) * radius));
  }
  ringGeo1.setFromPoints(ringPoints1);

  const gyroRing1 = new THREE.Line(ringGeo1, ring1Mat);
  gyroRing1.name = "gyroRing1";
  terminalGroup.add(gyroRing1);

  const gyroRing2 = new THREE.Line(ringGeo1.clone().rotateX(Math.PI / 2), ring1Mat);
  gyroRing2.name = "gyroRing2";
  terminalGroup.add(gyroRing2);

  // Holographic vertical laser grids holding the core
  const laserGeo = new THREE.BufferGeometry();
  const laserVertices = new Float32Array([
    -0.8, 0.25, -0.8,   -0.8, 1.8, -0.8,
    0.8, 0.25, -0.8,    0.8, 1.8, -0.8,
    0.8, 0.25, 0.8,     0.8, 1.8, 0.8,
    -0.8, 0.25, 0.8,    -0.8, 1.8, 0.8
  ]);
  laserGeo.setAttribute('position', new THREE.BufferAttribute(laserVertices, 3));
  const lasers = new THREE.LineSegments(laserGeo, new THREE.LineBasicMaterial({ color: COLORS.neonGreen, transparent: true, opacity: 0.4 }));
  terminalGroup.add(lasers);

  terminalGroup.userData = { appId: 'term' };
  platform.add(terminalGroup);
  interactiveObjects.push(terminalGroup);
  appObjectMap['term'] = terminalGroup;


  // ==========================================
  // 4. SNAKE GAME: Retro Sci-Fi Arcade Cabinet
  // ==========================================
  const snakeGroup = new THREE.Group();
  snakeGroup.position.set(2.4, 0.3, 2.4);

  // Cabinet body (extrude look out of boxes)
  const cabBaseGeo = new THREE.BoxGeometry(0.9, 0.8, 0.9);
  const cabBase = new THREE.Mesh(cabBaseGeo, consolePanelMat);
  cabBase.position.y = 0.4;
  cabBase.castShadow = true;
  snakeGroup.add(cabBase);
  snakeGroup.add(createNeonOutline(cabBaseGeo, COLORS.neonCyan));

  const cabTopGeo = new THREE.BoxGeometry(0.85, 0.9, 0.85);
  const cabTop = new THREE.Mesh(cabTopGeo, consolePanelMat);
  cabTop.position.set(0, 1.1, 0);
  snakeGroup.add(cabTop);
  snakeGroup.add(createNeonOutline(cabTopGeo, COLORS.neonCyan));

  // Glowing Arcade Screen
  const arcScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.65, 0.55),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonCyan,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide
    })
  );
  // Positioned facing outward (angled slightly down)
  arcScreen.position.set(-0.435, 1.15, 0);
  arcScreen.rotation.y = -Math.PI / 2;
  arcScreen.userData = { isHologram: true, baseOpacity: 0.45, phase: Math.PI / 3 };
  snakeGroup.add(arcScreen);

  // Control deck shelf
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.75), frameMat);
  shelf.position.set(-0.5, 0.8, 0);
  snakeGroup.add(shelf);

  // Joystick controller geometries
  const stickMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12), frameMat);
  stick.position.set(-0.52, 0.88, -0.15);
  stick.rotation.z = Math.PI / 8;
  snakeGroup.add(stick);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.04), stickMat);
  ball.position.set(-0.54, 0.94, -0.15);
  snakeGroup.add(ball);

  // Action buttons
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02), stickMat);
  b1.position.set(-0.5, 0.85, 0.08);
  snakeGroup.add(b1);
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02), new THREE.MeshBasicMaterial({ color: COLORS.neonYellow }));
  b2.position.set(-0.5, 0.85, 0.2);
  snakeGroup.add(b2);

  snakeGroup.userData = { appId: 'snake' };
  platform.add(snakeGroup);
  interactiveObjects.push(snakeGroup);
  appObjectMap['snake'] = snakeGroup;


  // ==========================================
  // 5. ORBITING APP WIDGETS (Skills & GitHub)
  // ==========================================
  const widgets = [
    { appId: 'github', color: COLORS.neonCyan, x: -3.5, z: -3.5, phase: 0 },
    { appId: 'skills', color: COLORS.neonMagenta, x: 3.5, z: -3.5, phase: Math.PI }
  ];

  widgets.forEach((w) => {
    const wGroup = new THREE.Group();
    wGroup.position.set(w.x, 2.0, w.z);

    // Dynamic gemstone geometry
    const coreMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      new THREE.MeshStandardMaterial({
        color: w.color,
        emissive: w.color,
        emissiveIntensity: 0.5,
        roughness: 0.1,
        metalness: 0.9
      })
    );
    wGroup.add(coreMesh);
    wGroup.add(createNeonOutline(new THREE.OctahedronGeometry(0.42), w.color));

    // Outer orbital ring
    const orbitRingGeo = new THREE.BufferGeometry();
    const ringPoints = [];
    for (let i = 0; i <= 24; i++) {
      const theta = (i / 24) * Math.PI * 2;
      ringPoints.push(new THREE.Vector3(Math.cos(theta) * 0.7, 0, Math.sin(theta) * 0.7));
    }
    orbitRingGeo.setFromPoints(ringPoints);
    const orbitRing = new THREE.Line(orbitRingGeo, new THREE.LineBasicMaterial({ color: w.color, transparent: true, opacity: 0.6 }));
    wGroup.add(orbitRing);

    wGroup.userData = {
      appId: w.appId,
      isOrbiting: true,
      baseY: 2.0,
      orbitOffset: w.phase
    };

    platform.add(wGroup);
    interactiveObjects.push(wGroup);
    appObjectMap[w.appId] = wGroup;
  });
}

// --- Glowing Space Nebula Stars ---
function buildSpaceNebula() {
  const particleCount = 1800;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const colorPalette = [
    new THREE.Color(COLORS.neonCyan),
    new THREE.Color(COLORS.neonMagenta),
    new THREE.Color(0x8a2be2), // Purple
    new THREE.Color(0xffffff)   // White stars
  ];

  for (let i = 0; i < particleCount; i++) {
    // Generate particles in shell around deck
    const radius = 15 + Math.random() * 22;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta) - 2; // Shift slightly down
    positions[i * 3 + 2] = radius * Math.cos(phi);

    const particleColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
    colors[i * 3] = particleColor.r;
    colors[i * 3 + 1] = particleColor.g;
    colors[i * 3 + 2] = particleColor.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.14,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true
  });

  starField = new THREE.Points(geometry, material);
  scene.add(starField);
}

// --- Window resizing ---
function onWindowResize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -frustumSize * aspect / 2;
  camera.right = frustumSize * aspect / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Raycaster mouse interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onCanvasMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects, true);

  const canvas = document.getElementById('three-cv');
  if (intersects.length > 0) {
    canvas.style.cursor = 'pointer';
  } else {
    canvas.style.cursor = 'default';
  }
}

function onCanvasClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects, true);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    while (obj && !obj.userData.appId) {
      obj = obj.parent;
    }
    if (obj && obj.userData.appId) {
      const appId = obj.userData.appId;
      if (window.ow) {
        window.ow(appId);
      }
    }
  }
}

// --- GSAP Camera Zooms ---
function zoomToApp(targetPos) {
  isZoomed = true;
  controls.enabled = false;

  // Frame offset positioned isometrically close to the targeted object
  const offset = new THREE.Vector3().copy(defaultCameraPos).normalize().multiplyScalar(4.0);
  const targetCamPos = new THREE.Vector3().copy(targetPos).add(offset);
  targetCamPos.y += 0.4; // Align screen height

  if (window.gsap) {
    window.gsap.to(camera.position, {
      x: targetCamPos.x,
      y: targetCamPos.y,
      z: targetCamPos.z,
      duration: 1.2,
      ease: 'power3.out',
      onUpdate: () => {
        camera.updateProjectionMatrix();
      }
    });

    window.gsap.to(controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.2,
      ease: 'power3.out',
      onComplete: () => {
        controls.enabled = true;
      }
    });
  }
}

function zoomOut() {
  isZoomed = false;
  currentZoomedApp = null;
  controls.enabled = false;

  if (window.gsap) {
    window.gsap.to(camera.position, {
      x: defaultCameraPos.x,
      y: defaultCameraPos.y,
      z: defaultCameraPos.z,
      duration: 1.0,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.updateProjectionMatrix();
      }
    });

    window.gsap.to(controls.target, {
      x: defaultTarget.x,
      y: defaultTarget.y,
      z: defaultTarget.z,
      duration: 1.0,
      ease: 'power3.inOut',
      onComplete: () => {
        controls.enabled = true;
      }
    });
  }
}

// --- Global bindings for index.html ---
window.onWindowOpened = function(appId) {
  if (!window.is3DMode) return;
  const targetObj = appObjectMap[appId];
  if (targetObj) {
    currentZoomedApp = appId;
    const targetPos = new THREE.Vector3();
    targetObj.getWorldPosition(targetPos);
    zoomToApp(targetPos);
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
