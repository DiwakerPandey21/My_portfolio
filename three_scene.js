import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- State Variables ---
let scene, camera, renderer, controls;
let animationFrameId = null;
let starField, platform, gridHelper;
const interactiveObjects = [];
const appObjectMap = {}; // Maps appId -> 3D Object Reference

// Theme Colors (Futuristic Cyberpunk)
const COLORS = {
  bg: 0x05050a,
  platform: 0x0d0e15,
  grid: 0x1f2438,
  neonCyan: 0x00f3ff,
  neonMagenta: 0xff007f,
  neonGreen: 0x39ff14,
  hologramBlue: 0x00bcff,
  white: 0xffffff
};

// Isometric Orthographic Frustum Setup
const frustumSize = 18;
const defaultCameraPos = new THREE.Vector3(14, 11, 14);
const defaultTarget = new THREE.Vector3(0, -0.5, 0);
let isZoomed = false;
let currentZoomedApp = null;

// --- Initialize Three.js ---
export function initThreeScene() {
  const canvas = document.getElementById('three-cv');
  if (!canvas) return;

  // 1. Scene & Renderer
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.FogExp2(COLORS.bg, 0.015);

  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

  // 3. Orbit Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.copy(defaultTarget);
  controls.minZoom = 0.5;
  controls.maxZoom = 3;
  controls.enablePan = false; // Restrict panning to keep command center centered

  // 4. Lights Setup
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  // Soft directional light (moonlight/ambient space glow)
  const dirLight = new THREE.DirectionalLight(0x7a8eff, 0.6);
  dirLight.position.set(20, 40, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 1024;
  dirLight.shadow.mapSize.height = 1024;
  dirLight.shadow.bias = -0.001;
  scene.add(dirLight);

  // Neon glowing console lights (PointLights)
  const cyanLight = new THREE.PointLight(COLORS.neonCyan, 2.5, 12, 1.5);
  cyanLight.position.set(-2, 1, -2);
  scene.add(cyanLight);

  const magentaLight = new THREE.PointLight(COLORS.neonMagenta, 2.5, 12, 1.5);
  magentaLight.position.set(2, 1, 2);
  scene.add(magentaLight);

  const greenLight = new THREE.PointLight(COLORS.neonGreen, 1.5, 8, 1.5);
  greenLight.position.set(0, 1.5, 0);
  scene.add(greenLight);

  // 5. Build Platform (Floating Command Deck)
  buildCommandDeck();

  // 6. Build Interactive Sci-Fi Console Items
  buildConsoleItems();

  // 7. Add Floating Space Particles
  buildSpaceParticles();

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

  // Dispose geometries, materials, textures
  scene.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    if (Array.isArray(object.material)) {
      object.material.forEach((mat) => mat.dispose());
    } else {
      object.material.dispose();
    }
  });

  interactiveObjects.length = 0;
  Object.keys(appObjectMap).forEach(key => delete appObjectMap[key]);
  
  if (controls) controls.dispose();
}

// --- Render Loop ---
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  // Slow idle rotation of the platform (only if not zoomed)
  if (platform && !isZoomed && !controls.state == -1) {
    platform.rotation.y += 0.0006;
  }

  // Slowly rotate and float orbiting elements
  const time = Date.now() * 0.001;
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.isOrbiting) {
      obj.position.y = obj.userData.baseY + Math.sin(time * 2 + obj.userData.orbitOffset) * 0.25;
      obj.rotation.y += 0.01;
      obj.rotation.x += 0.005;
    }
    // Pulsing anim for neon console lights or cores
    if (obj.name === "databaseCore") {
      obj.scale.y = 1 + Math.sin(time * 4) * 0.05;
    }
  });

  // Slowly move starfield particles
  if (starField) {
    starField.rotation.y += 0.0003;
    starField.rotation.x += 0.0001;
  }

  controls.update();
  renderer.render(scene, camera);
}

// --- Construct Platform ---
function buildCommandDeck() {
  // Floating base block
  const platformGeo = new THREE.CylinderGeometry(6, 6.5, 0.8, 8);
  const platformMat = new THREE.MeshStandardMaterial({
    color: COLORS.platform,
    roughness: 0.25,
    metalness: 0.95,
    flatShading: true
  });
  platform = new THREE.Mesh(platformGeo, platformMat);
  platform.position.y = -0.8;
  platform.receiveShadow = true;
  scene.add(platform);

  // Platform Glowing Border Grid
  gridHelper = new THREE.GridHelper(11.5, 22, COLORS.grid, COLORS.grid);
  gridHelper.position.y = -0.38;
  scene.add(gridHelper);

  // Under-deck glow ring
  const ringGeo = new THREE.RingGeometry(6, 6.2, 8);
  const ringMat = new THREE.MeshBasicMaterial({
    color: COLORS.neonCyan,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6
  });
  const glowRing = new THREE.Mesh(ringGeo, ringMat);
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = -1.2;
  scene.add(glowRing);
}

// --- Construct 3D Console Items ---
function buildConsoleItems() {
  const cubeMat = new THREE.MeshStandardMaterial({ color: 0x181a24, metalness: 0.8, roughness: 0.2 });

  // 1. Projects Desk (Hologram Monitor)
  const deskGroup = new THREE.Group();
  deskGroup.position.set(-2.5, 0, -2.5);

  const deskTable = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.8, 1.2), cubeMat);
  deskTable.position.y = 0.4;
  deskTable.castShadow = true;
  deskTable.receiveShadow = true;
  deskGroup.add(deskTable);

  // Hologram Screen (Cyan transparent plane)
  const screenGeo = new THREE.PlaneGeometry(1.6, 0.9);
  const screenMat = new THREE.MeshBasicMaterial({
    color: COLORS.neonCyan,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.4,
    wireframe: true
  });
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(0, 1.3, 0);
  screen.rotation.y = Math.PI / 6; // Angled screen
  deskGroup.add(screen);

  // Glow line decoration on desk table
  const linesGeo = new THREE.BoxGeometry(2.55, 0.05, 1.25);
  const linesMat = new THREE.MeshBasicMaterial({ color: COLORS.neonCyan });
  const glowLine = new THREE.Mesh(linesGeo, linesMat);
  glowLine.position.y = 0.75;
  deskGroup.add(glowLine);

  deskGroup.userData = { appId: 'projects' };
  scene.add(deskGroup);
  interactiveObjects.push(deskGroup);
  appObjectMap['projects'] = deskGroup;

  // 2. Whiteboard / About Me (Hologram Frame)
  const boardGroup = new THREE.Group();
  boardGroup.position.set(-3.5, 0, 1.5);

  const boardBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 1.6), cubeMat);
  boardBase.position.y = 0.1;
  boardGroup.add(boardBase);

  // Glowing vertical board
  const boardPlane = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 2.2, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0x101525,
      metalness: 0.9,
      roughness: 0.1,
      emissive: COLORS.neonMagenta,
      emissiveIntensity: 0.15
    })
  );
  boardPlane.position.y = 1.2;
  boardGroup.add(boardPlane);

  // Glowing marker board overlay
  const boardFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.2, 2.0),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonMagenta,
      transparent: true,
      opacity: 0.35,
      wireframe: true,
      side: THREE.DoubleSide
    })
  );
  boardFace.rotation.y = Math.PI / 2;
  boardFace.position.set(0.06, 1.2, 0);
  boardGroup.add(boardFace);

  boardGroup.userData = { appId: 'about' };
  scene.add(boardGroup);
  interactiveObjects.push(boardGroup);
  appObjectMap['about'] = boardGroup;
  appObjectMap['resume'] = boardGroup; // Share about whiteboard click for Resume as well

  // 3. Database Server Rack / AI Core (Terminal)
  const coreGroup = new THREE.Group();
  coreGroup.position.set(2.5, 0, -2.5);

  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.0, 1.2), cubeMat);
  rack.position.y = 1.0;
  rack.castShadow = true;
  coreGroup.add(rack);

  // Glowing inner core segments
  const coreSegments = [];
  for (let i = 0; i < 4; i++) {
    const segment = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.25, 8),
      new THREE.MeshBasicMaterial({ color: COLORS.neonGreen, transparent: true, opacity: 0.85 })
    );
    segment.position.set(0, 0.4 + i * 0.4, 0);
    segment.name = "databaseCore";
    coreGroup.add(segment);
    coreSegments.push(segment);
  }

  coreGroup.userData = { appId: 'term' };
  scene.add(coreGroup);
  interactiveObjects.push(coreGroup);
  appObjectMap['term'] = coreGroup;

  // 4. Arcade Machine (Snake Game)
  const arcadeGroup = new THREE.Group();
  arcadeGroup.position.set(2.0, 0, 2.0);

  const cabinetBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), cubeMat);
  cabinetBase.position.y = 0.45;
  arcadeGroup.add(cabinetBase);

  // Angled screen segment
  const cabinetTop = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 1.0), cubeMat);
  cabinetTop.position.set(0, 1.3, 0);
  arcadeGroup.add(cabinetTop);

  // Glowing Arcade screen
  const arcadeScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.7),
    new THREE.MeshBasicMaterial({
      color: COLORS.neonCyan,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    })
  );
  arcadeScreen.position.set(-0.51, 1.4, 0);
  arcadeScreen.rotation.y = -Math.PI / 2;
  arcadeGroup.add(arcadeScreen);

  // Joystick table
  const joystickTable = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.8), cubeMat);
  joystickTable.position.set(-0.6, 0.9, 0);
  arcadeGroup.add(joystickTable);

  // Tiny controls
  const btn1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
  btn1.position.set(-0.62, 0.96, -0.15);
  arcadeGroup.add(btn1);
  const btn2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8), new THREE.MeshBasicMaterial({ color: COLORS.neonGreen }));
  btn2.position.set(-0.62, 0.96, 0.15);
  arcadeGroup.add(btn2);

  arcadeGroup.userData = { appId: 'snake' };
  scene.add(arcadeGroup);
  interactiveObjects.push(arcadeGroup);
  appObjectMap['snake'] = arcadeGroup;

  // 5. Orbiting Widgets (GitHub & Skills)
  const widgetList = [
    { appId: 'github', color: COLORS.neonCyan, offset: 0, x: -4, z: -4 },
    { appId: 'skills', color: COLORS.neonMagenta, offset: Math.PI, x: 4, z: 4 }
  ];

  widgetList.forEach((w) => {
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.4),
      new THREE.MeshStandardMaterial({
        color: w.color,
        emissive: w.color,
        emissiveIntensity: 0.4,
        roughness: 0.1,
        metalness: 0.9
      })
    );
    mesh.position.set(w.x, 2.0, w.z);
    mesh.castShadow = true;
    mesh.userData = {
      appId: w.appId,
      isOrbiting: true,
      baseY: 2.0,
      orbitOffset: w.offset
    };
    scene.add(mesh);
    interactiveObjects.push(mesh);
    appObjectMap[w.appId] = mesh;
  });
}

// --- Floating Starfield Background ---
function buildSpaceParticles() {
  const particleCount = 1200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const colorOptions = [
    new THREE.Color(COLORS.neonCyan),
    new THREE.Color(COLORS.neonMagenta),
    new THREE.Color(0xffffff),
    new THREE.Color(0x3e405a)
  ];

  for (let i = 0; i < particleCount; i++) {
    // Generate particles in a spherical shell around center
    const radius = 18 + Math.random() * 20;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = radius * Math.cos(phi);

    // Give them cool cosmic colors
    const randColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];
    colors[i * 3] = randColor.r;
    colors[i * 3 + 1] = randColor.g;
    colors[i * 3 + 2] = randColor.b;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.75,
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

// --- Mouse Hover Pointer Change ---
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

// --- Raycasting click handler ---
function onCanvasClick(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(interactiveObjects, true);

  if (intersects.length > 0) {
    let obj = intersects[0].object;
    // Walk up group hierarchy to find matching appId
    while (obj && !obj.userData.appId) {
      obj = obj.parent;
    }
    if (obj && obj.userData.appId) {
      const appId = obj.userData.appId;
      // Open the corresponding 2D app window
      if (window.ow) {
        window.ow(appId);
      }
    }
  }
}

// --- Zoom Camera on App Open/Close ---
function zoomToApp(targetPos) {
  isZoomed = true;
  controls.enabled = false; // Disable controls while animating

  // Calculate target camera position (close in at same isometric angle)
  const offset = new THREE.Vector3().copy(defaultCameraPos).normalize().multiplyScalar(4.5);
  const targetCamPos = new THREE.Vector3().copy(targetPos).add(offset);
  targetCamPos.y += 0.8; // Align height

  // Animate camera and controls target using GSAP
  if (window.gsap) {
    window.gsap.to(camera.position, {
      x: targetCamPos.x,
      y: targetCamPos.y,
      z: targetCamPos.z,
      duration: 1.0,
      ease: 'power2.out',
      onUpdate: () => {
        camera.updateProjectionMatrix();
      }
    });

    window.gsap.to(controls.target, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: 1.0,
      ease: 'power2.out',
      onComplete: () => {
        controls.enabled = true; // Enable damping rotation in close focus
      }
    });
  }
}

function zoomOut() {
  isZoomed = false;
  currentZoomedApp = null;
  controls.enabled = false;

  // Restore camera position and lookTarget using GSAP
  if (window.gsap) {
    window.gsap.to(camera.position, {
      x: defaultCameraPos.x,
      y: defaultCameraPos.y,
      z: defaultCameraPos.z,
      duration: 0.9,
      ease: 'power2.inOut',
      onUpdate: () => {
        camera.updateProjectionMatrix();
      }
    });

    window.gsap.to(controls.target, {
      x: defaultTarget.x,
      y: defaultTarget.y,
      z: defaultTarget.z,
      duration: 0.9,
      ease: 'power2.inOut',
      onComplete: () => {
        controls.enabled = true;
      }
    });
  }
}

// --- Globals hooks accessed from index.html ---
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
  // Only zoom out if the closed window is the one currently focused by the camera
  if (currentZoomedApp === appId || !Object.keys(window.openW || {}).length) {
    zoomOut();
  }
};

// Auto-register bindings on module load
window.initThreeScene = initThreeScene;
window.stopThreeScene = stopThreeScene;

// Auto-start 3D Mode immediately after boot sequence completes for instant WOW!
// We can hook this into the page loader or just let the user toggle. We will let it be toggled or auto-init.
