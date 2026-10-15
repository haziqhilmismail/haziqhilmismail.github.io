// 3D dice and a pencil on a see-through layer over the page.
// Three.js draws them, cannon-es moves them. The face that ends up on top is the result.
import * as THREE from "three";
import * as CANNON from "cannon-es";

const PX = 50;           // CSS pixels per world unit
const LIFT = 1.8;        // height of a die while you hold it
const DIE_COLOR = 0x9b1c2e;
const INK_COLOR = "#f4d77e";

const canvas = document.getElementById("table");
const announce = document.getElementById("roll-result");

// ---------- Dice shapes ----------

const PHI = (1 + Math.sqrt(5)) / 2;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Face = all vertices that lie furthest along the face normal, in counter-clockwise order.
function facesFromNormals(verts, normals) {
  return normals.map((n) => {
    n = n.clone().normalize();
    const dots = verts.map((v) => v.dot(n));
    const max = Math.max(...dots);
    const ids = dots.flatMap((d, i) => (d > max - 1e-3 ? [i] : []));
    const centre = ids.reduce((sum, i) => sum.add(verts[i]), v3(0, 0, 0)).divideScalar(ids.length);
    const u = verts[ids[0]].clone().sub(centre).normalize();
    const w = v3(0, 0, 0).crossVectors(n, u);
    const angle = (i) => {
      const d = verts[i].clone().sub(centre);
      return Math.atan2(d.dot(w), d.dot(u));
    };
    return ids.sort((a, b) => angle(a) - angle(b));
  });
}

function cubeCorners() {
  const out = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push(v3(x, y, z));
  return out;
}

function icosahedronVerts() {
  const out = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) out.push(v3(0, a, b), v3(a, b, 0), v3(b, 0, a));
  return out;
}

function dodecahedronVerts() {
  const out = cubeCorners();
  // Dual of icosahedronVerts(): its corners point at the icosahedron's face centres
  for (const a of [-1 / PHI, 1 / PHI]) for (const b of [-PHI, PHI]) out.push(v3(0, b, a), v3(a, 0, b), v3(b, a, 0));
  return out;
}

function d10Shape() {
  // Pentagonal trapezohedron. h is set so that each kite face is flat.
  const a = 0.105;
  const h = (a * (1 + Math.cos(Math.PI / 5))) / (1 - Math.cos(Math.PI / 5));
  const verts = [v3(0, h, 0), v3(0, -h, 0)];
  for (let i = 0; i < 10; i++) {
    const t = (i * Math.PI) / 5;
    verts.push(v3(Math.cos(t), i % 2 ? -a : a, Math.sin(t)));
  }
  const ring = (i) => 2 + (i % 10);
  const faces = [];
  for (let k = 0; k < 5; k++) faces.push([0, ring(2 * k), ring(2 * k + 1), ring(2 * k + 2)]);
  for (let k = 0; k < 5; k++) faces.push([1, ring(2 * k + 1), ring(2 * k + 2), ring(2 * k + 3)]);
  return { verts, faces };
}

const SHAPES = {
  d4: () => {
    const verts = [v3(1, 1, 1), v3(-1, -1, 1), v3(-1, 1, -1), v3(1, -1, -1)];
    return { verts, faces: facesFromNormals(verts, verts.map((v) => v.clone().negate())) };
  },
  d6: () => {
    const verts = cubeCorners();
    const normals = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
    return { verts, faces: facesFromNormals(verts, normals) };
  },
  d8: () => {
    const verts = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
    return { verts, faces: facesFromNormals(verts, cubeCorners()) };
  },
  d10: d10Shape,
  d12: () => {
    const verts = dodecahedronVerts();
    return { verts, faces: facesFromNormals(verts, icosahedronVerts()) };
  },
  d20: () => {
    const verts = icosahedronVerts();
    return { verts, faces: facesFromNormals(verts, dodecahedronVerts()) };
  },
};

const DICE = [
  { name: "d4", shape: "d4", sides: 4, radius: 0.95 },
  { name: "d6", shape: "d6", sides: 6, radius: 0.92 },
  { name: "d8", shape: "d8", sides: 8, radius: 0.82 },
  { name: "d10", shape: "d10", sides: 10, radius: 0.82 },
  { name: "d%", shape: "d10", sides: 10, radius: 0.82, percent: true },
  { name: "d12", shape: "d12", sides: 12, radius: 0.82 },
  { name: "d20", shape: "d20", sides: 20, radius: 0.85 },
];

function faceText(spec, value) {
  return spec.percent ? String((value - 1) * 10).padStart(2, "0") : String(value);
}

// Opposite faces add up to sides + 1, as on real dice.
function faceValues(spec, normals) {
  if (spec.shape === "d10") return [1, 3, 5, 7, 9, 10, 8, 6, 4, 2];
  const values = new Array(normals.length);
  let next = 1;
  normals.forEach((n, i) => {
    if (values[i]) return;
    values[i] = next;
    const j = normals.findIndex((m, k) => !values[k] && m.dot(n) < -0.99);
    if (j >= 0) values[j] = spec.sides + 1 - next;
    next++;
  });
  return values;
}

const textures = new Map();
function numberTexture(text) {
  if (textures.has(text)) return textures.get(text);
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = INK_COLOR;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 ${text.length > 1 ? 60 : 78}px "Alegreya Sans", sans-serif`;
  g.fillText(text, 64, 66);
  if (text === "6" || text === "9") g.fillRect(48, 106, 32, 7);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textures.set(text, texture);
  return texture;
}

function addLabel(group, text, position, normal, up, size) {
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: numberTexture(text), transparent: true, roughness: 0.35, metalness: 0.4,
      polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false,
    }),
  );
  label.position.copy(position).addScaledVector(normal, 0.004);
  label.up.copy(up);
  label.lookAt(position.clone().add(normal));
  group.add(label);
}

function buildDie(spec) {
  const raw = SHAPES[spec.shape]();
  const scale = spec.radius / Math.max(...raw.verts.map((v) => v.length()));
  const verts = raw.verts.map((v) => v.clone().multiplyScalar(scale));

  // Make every face counter-clockwise from outside, which cannon-es needs.
  const faces = raw.faces.map((f) => {
    const centre = f.reduce((s, i) => s.add(verts[i]), v3(0, 0, 0)).divideScalar(f.length);
    const n = v3(0, 0, 0).crossVectors(verts[f[1]].clone().sub(verts[f[0]]), verts[f[2]].clone().sub(verts[f[0]]));
    return n.dot(centre) < 0 ? [...f].reverse() : f;
  });
  const info = faces.map((f) => {
    const centre = f.reduce((s, i) => s.add(verts[i]), v3(0, 0, 0)).divideScalar(f.length);
    const normal = v3(0, 0, 0).crossVectors(verts[f[1]].clone().sub(verts[f[0]]), verts[f[2]].clone().sub(verts[f[0]])).normalize();
    const reach = Math.min(...f.map((i) => verts[i].distanceTo(centre)));
    return { centre, normal, reach };
  });

  // Flat-shaded mesh: one normal per face
  const positions = [];
  const normals = [];
  faces.forEach((f, k) => {
    for (let i = 1; i < f.length - 1; i++) {
      for (const id of [f[0], f[i], f[i + 1]]) {
        positions.push(verts[id].x, verts[id].y, verts[id].z);
        normals.push(info[k].normal.x, info[k].normal.y, info[k].normal.z);
      }
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  const material = new THREE.MeshStandardMaterial({ color: DIE_COLOR, roughness: 0.32, metalness: 0.05, emissive: 0xffb300, emissiveIntensity: 0 });
  const group = new THREE.Group();
  const body = new THREE.Mesh(geometry, material);
  body.castShadow = true;
  group.add(body);

  let values;
  if (spec.shape === "d4") {
    // Each corner carries one number. The corner that points up is the result.
    values = verts.map((_, i) => i + 1);
    faces.forEach((f, k) => {
      const { centre, normal, reach } = info[k];
      for (const id of f) {
        const toCorner = verts[id].clone().sub(centre);
        const pos = centre.clone().addScaledVector(toCorner, 0.52);
        addLabel(group, String(values[id]), pos, normal, toCorner.normalize(), reach * 0.8);
      }
    });
  } else {
    values = faceValues(spec, info.map((i) => i.normal));
    faces.forEach((f, k) => {
      const { centre, normal, reach } = info[k];
      // Numbers on a d10 point to its tip; on other dice to the first corner
      const up = verts[f[0]].clone().sub(centre).normalize();
      const size = spec.shape === "d10" ? reach * 1.55 : f.length === 3 ? reach * 1.6 : reach * 1.45;
      addLabel(group, faceText(spec, values[k]), centre, normal, up, size);
    });
  }

  const shape = new CANNON.ConvexPolyhedron({
    vertices: verts.map((v) => new CANNON.Vec3(v.x, v.y, v.z)),
    faces,
  });
  return { group, material, shape, values, verts, normals: info.map((i) => i.normal) };
}

function buildPencil() {
  const group = new THREE.Group();
  const part = (geometry, color, x, options = {}) => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...options }));
    mesh.rotation.z = -Math.PI / 2; // Three.js builds these along y; lay them along x
    mesh.position.x = x;
    mesh.castShadow = true;
    group.add(mesh);
  };
  const r = 0.13;
  part(new THREE.CylinderGeometry(r * 0.95, r * 0.95, 0.3, 16), 0xe58e9b, -1.65);
  part(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.26, 16), 0xb7b8b2, -1.37, { metalness: 0.7, roughness: 0.3 });
  part(new THREE.CylinderGeometry(r, r, 2.6, 6), 0xe9b22c, 0);
  part(new THREE.ConeGeometry(r, 0.45, 6), 0xe7c79b, 1.525);
  part(new THREE.ConeGeometry(0.035, 0.12, 12), 0x2e2e2e, 1.69);
  const shape = new CANNON.Cylinder(r, r, 3.6, 6);
  return { group, shape };
}

// ---------- Scene ----------

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
} catch {
  canvas.remove();
  throw new Error("WebGL is not available, so the dice are off.");
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

// World x/z = page x/y. The camera looks straight down at the part of the page in the window.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0, 40, 0);
camera.up.set(0, 0, -1); // screen "up" is world -z, so screen x/y map to world x/z
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4a2a, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 4;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.38 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -60, 0), allowSleep: true });
const tableMaterial = new CANNON.Material("table");
const diceMaterial = new CANNON.Material("dice");
world.addContactMaterial(new CANNON.ContactMaterial(tableMaterial, diceMaterial, { friction: 0.35, restitution: 0.35 }));
// Grippy and not bouncy between dice, so a stack stays up
world.addContactMaterial(new CANNON.ContactMaterial(diceMaterial, diceMaterial, { friction: 0.6, restitution: 0.1 }));

function staticPlane(rotate) {
  const body = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: tableMaterial });
  rotate(body.quaternion);
  world.addBody(body);
  return body;
}
staticPlane((q) => q.setFromEuler(-Math.PI / 2, 0, 0)); // floor
const walls = {
  left: staticPlane((q) => q.setFromEuler(0, Math.PI / 2, 0)),
  right: staticPlane((q) => q.setFromEuler(0, -Math.PI / 2, 0)),
  top: staticPlane(() => {}),
  bottom: staticPlane((q) => q.setFromEuler(0, Math.PI, 0)),
};

// w, h: the window. page: the whole page height. All in world units.
let view = { w: 1, h: 1, page: 1 };
let cameraScroll = -1;

// Move the camera (and the sun's shadow box) to the part of the page in the window
function followScroll() {
  if (window.scrollY === cameraScroll) return;
  cameraScroll = window.scrollY;
  const z = (cameraScroll + window.innerHeight / 2) / PX;
  camera.position.z = z;
  sun.position.set(-8, 24, z - 10);
  sun.target.position.set(0, 0, z);
  dirty = true;
}

function resize() {
  const w = window.innerWidth / PX;
  const h = window.innerHeight / PX;
  const page = document.documentElement.scrollHeight / PX;
  view = { w, h, page };
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  Object.assign(camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
  camera.updateProjectionMatrix();
  const s = sun.shadow.camera;
  Object.assign(s, { left: -w / 2 - 6, right: w / 2 + 6, top: h / 2 + 6, bottom: -h / 2 - 6, near: 1, far: 80 });
  s.updateProjectionMatrix();
  // The walls are the edges of the page, not of the window
  walls.left.position.set(-w / 2, 0, 0);
  walls.right.position.set(w / 2, 0, 0);
  walls.top.position.set(0, 0, 0);
  walls.bottom.position.set(0, 0, page);
  for (const toy of toys) {
    const p = toy.body.position;
    const m = toy.die ? 0.9 : 1.9;
    const x = Math.max(-w / 2 + m, Math.min(w / 2 - m, p.x));
    const z = Math.max(m, Math.min(page - m, p.z));
    if (x !== p.x || z !== p.z) { p.set(x, Math.max(p.y, 1), z); toy.body.wakeUp(); }
  }
  cameraScroll = -1;
  followScroll();
  dirty = true;
}

// Window position (clientX/clientY) to a point on the page in world units
const screenToWorld = (x, y) => ({ x: x / PX - view.w / 2, z: (y + window.scrollY) / PX });

// ---------- Toys ----------

const toys = [];
let dirty = true;

function addToy(toy, body) {
  body.sleepSpeedLimit = 0.25;
  body.sleepTimeLimit = 0.35;
  body.linearDamping = 0.15;
  body.angularDamping = 0.15;
  toy.body = body;
  toy.group.traverse((o) => (o.userData.toy = toy));
  scene.add(toy.group);
  world.addBody(body);
  toys.push(toy);
}

// A die has stopped when it stays almost still for a moment
function checkStopped(toy, dt) {
  const b = toy.body;
  const still = b.velocity.length() < 0.2 && b.angularVelocity.length() < 0.4;
  toy.stillFor = still ? (toy.stillFor || 0) + dt : 0;
  if (toy.stillFor > 0.3) finishRoll(toy);
}

function randomQuaternion(body) {
  body.quaternion.setFromEuler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3);
}

function createToys() {
  DICE.forEach((spec) => {
    const die = buildDie(spec);
    const body = new CANNON.Body({ mass: 1, material: diceMaterial, shape: die.shape });
    addToy({ ...die, die: spec }, body);
  });
  const pencil = buildPencil();
  const body = new CANNON.Body({ mass: 0.6, material: diceMaterial });
  body.addShape(pencil.shape, new CANNON.Vec3(), new CANNON.Quaternion().setFromEuler(0, 0, Math.PI / 2));
  addToy({ ...pencil, die: null }, body);
}

// Start in the side margins on wide screens, at the bottom of the page on narrow ones.
// x and y here are page pixels.
function placeToys() {
  const sheet = document.querySelector(".sheet").getBoundingClientRect();
  const W = window.innerWidth;
  const top = sheet.top + window.scrollY;
  const pageH = document.documentElement.scrollHeight;
  const dice = toys.filter((t) => t.die);
  const pencil = toys.find((t) => !t.die);
  const put = (toy, x, y, yaw = 0) => {
    toy.body.position.set(x / PX - view.w / 2, toy.die ? 1.2 : 0.4, y / PX);
    if (toy.die) randomQuaternion(toy.body);
    else toy.body.quaternion.setFromEuler(0, yaw, 0);
    toy.body.velocity.setZero();
    toy.body.angularVelocity.setZero();
    toy.body.wakeUp();
  };
  const left = sheet.left;
  const right = W - sheet.right;
  if (left >= 100) {
    dice.forEach((toy, i) => {
      const onLeft = i < 4;
      const row = onLeft ? i : i - 4;
      const x = onLeft ? left / 2 : W - right / 2;
      put(toy, x + (row % 2 ? 14 : -14), top + 70 + row * 105);
    });
    put(pencil, W - right / 2, top + 520, Math.PI / 2.4);
  } else {
    const step = Math.min(64, (W - 40) / 7);
    dice.forEach((toy, i) => put(toy, W / 2 + (i - 3) * step, pageH - 50));
    put(pencil, W / 2, pageH - 110, 0.15);
  }
}

// ---------- Rolling ----------

const upLocal = new CANNON.Vec3();
function topValue(toy) {
  toy.body.quaternion.conjugate().vmult(new CANNON.Vec3(0, 1, 0), upLocal);
  const up = v3(upLocal.x, upLocal.y, upLocal.z);
  const list = toy.die.shape === "d4" ? toy.verts : toy.normals;
  let best = 0;
  list.forEach((v, i) => { if (v.dot(up) > list[best].dot(up)) best = i; });
  return toy.values[best];
}

// When the last die of a throw stops, read out every die from that throw
function finishRoll(toy) {
  toy.rolling = false;
  toy.stillFor = 0;
  toy.result = topValue(toy);
  const crit = toy.die.name === "d20" && toy.result === 20;
  if (crit) toy.glow = 1;
  const dice = toys.filter((t) => t.die);
  if (dice.some((t) => t.rolling)) return;
  const thrown = dice.filter((t) => t.inThrow);
  announce.textContent = thrown
    .map((t) => `${t.die.name}: ${faceText(t.die, t.result)}${t.die.name === "d20" && t.result === 20 ? ", natural 20" : ""}`)
    .join(". ");
  thrown.forEach((t) => (t.inThrow = false));
}

function throwToy(toy, vx, vz) {
  const body = toy.body;
  const speed = Math.hypot(vx, vz);
  const cap = 42;
  if (speed > cap) { vx *= cap / speed; vz *= cap / speed; }
  body.velocity.set(vx, 3 + Math.random() * 4, vz);
  // Spin in the direction of travel, so the die rolls instead of sliding
  const spin = toy.die ? 1.4 : 0.6;
  body.angularVelocity.set(
    vz * spin + (Math.random() - 0.5) * 12,
    (Math.random() - 0.5) * 10,
    -vx * spin + (Math.random() - 0.5) * 12,
  );
  body.wakeUp();
  if (toy.die) { toy.rolling = true; toy.inThrow = true; toy.glow = 0; }
}

function rollInPlace(toy) {
  const body = toy.body;
  body.velocity.set((Math.random() - 0.5) * 6, 14 + Math.random() * 4, (Math.random() - 0.5) * 6);
  body.angularVelocity.set((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 40);
  body.wakeUp();
  if (toy.die) { toy.rolling = true; toy.inThrow = true; toy.glow = 0; }
}

// ---------- Pointer: pick up, drag and throw ----------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pickables = () => toys.map((t) => t.group);

function toyAt(clientX, clientY) {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(pickables(), true)[0];
  return hit ? hit.object.userData.toy : null;
}

let drag = null;

function startDrag(e) {
  const toy = toyAt(e.clientX, e.clientY);
  if (!toy) return;
  e.preventDefault();
  const p = screenToWorld(e.clientX, e.clientY);
  drag = {
    toy, clientX: e.clientX, clientY: e.clientY, startX: e.clientX, startY: e.clientY, moved: false,
    samples: [{ ...p, t: performance.now() }],
    turn: toy.body.quaternion.clone(), // a held toy keeps the rotation it had when you picked it up
  };
  toy.body.wakeUp();
  if (toy.die) toy.rolling = false;
  document.documentElement.style.cursor = "grabbing";
}

function moveDrag(e) {
  if (!drag) {
    if (e.pointerType === "mouse") document.documentElement.style.cursor = toyAt(e.clientX, e.clientY) ? "grab" : "";
    return;
  }
  const p = screenToWorld(e.clientX, e.clientY);
  drag.clientX = e.clientX;
  drag.clientY = e.clientY;
  drag.samples.push({ ...p, t: performance.now() });
  if (drag.samples.length > 8) drag.samples.shift();
  if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) drag.moved = true;
}

function endDrag() {
  if (!drag) return;
  const { toy, samples, moved } = drag;
  drag = null;
  document.documentElement.style.cursor = "";
  if (!moved) {
    if (toy.die) rollInPlace(toy);
    else toy.body.wakeUp();
    return;
  }
  const now = performance.now();
  const recent = samples.filter((s) => now - s.t < 120);
  const first = recent[0] || samples[samples.length - 1];
  const last = samples[samples.length - 1];
  const dt = Math.max((last.t - first.t) / 1000, 1 / 60);
  const vx = (last.x - first.x) / dt;
  const vz = (last.z - first.z) / dt;
  if (Math.hypot(vx, vz) > 8) {
    throwToy(toy, vx, vz);
    return;
  }
  // A slow release puts the toy down where it is, with no spin, so you can stack dice
  toy.body.velocity.setZero();
  toy.body.angularVelocity.setZero();
  toy.body.wakeUp();
  if (toy.die) { toy.rolling = true; toy.inThrow = true; toy.glow = 0; }
}

// Hold a toy just above whatever is under it, so you can drop it onto a stack
const reachOf = (toy) => (toy.die ? toy.die.radius : 1.8);
const heightOf = (toy) => (toy.die ? toy.die.radius : 0.15);
function holdHeight(toy, x, z) {
  let top = 0;
  for (const other of toys) {
    if (other === toy) continue;
    const p = other.body.position;
    if (Math.hypot(p.x - x, p.z - z) < reachOf(toy) + reachOf(other) * 0.9) top = Math.max(top, p.y + heightOf(other));
  }
  return Math.max(LIFT, top + heightOf(toy) + 0.25);
}

window.addEventListener("pointerdown", startDrag);
window.addEventListener("pointermove", moveDrag);
window.addEventListener("pointerup", endDrag);
window.addEventListener("pointercancel", endDrag);
// On touch screens, stop the page from scrolling when a finger lands on a die
window.addEventListener("touchstart", (e) => {
  const t = e.touches[0];
  if (t && toyAt(t.clientX, t.clientY)) e.preventDefault();
}, { passive: false });

document.getElementById("roll-all").addEventListener("click", () => {
  toys.filter((t) => t.die).forEach(rollInPlace);
});

// ---------- Main loop ----------

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  followScroll();

  if (drag) {
    // Recompute from the window position each frame, so a held die stays under the pointer while the page scrolls
    const target = screenToWorld(drag.clientX, drag.clientY);
    const b = drag.toy.body;
    const step = Math.max(dt, 1 / 240);
    const lift = holdHeight(drag.toy, target.x, target.z);
    const y = b.position.y + (lift - b.position.y) * Math.min(1, step * 14);
    b.velocity.set((target.x - b.position.x) / step, (y - b.position.y) / step, (target.z - b.position.z) / step);
    b.position.set(target.x, y, target.z);
    b.quaternion.copy(drag.turn);
    b.angularVelocity.setZero();
    b.wakeUp();
  }

  world.step(1 / 120, dt, 10);
  if (drag) {
    // Contacts during the step must not turn the held toy
    drag.toy.body.quaternion.copy(drag.turn);
    drag.toy.body.angularVelocity.setZero();
  }

  let awake = !!drag || dirty;
  for (const toy of toys) {
    toy.group.position.copy(toy.body.position);
    toy.group.quaternion.copy(toy.body.quaternion);
    if (toy.body.sleepState !== CANNON.Body.SLEEPING) awake = true;
    if (toy.rolling && (!drag || drag.toy !== toy)) checkStopped(toy, dt);
    if (toy.glow > 0) {
      toy.glow = Math.max(0, toy.glow - dt * 0.5);
      toy.material.emissiveIntensity = Math.sin(toy.glow * Math.PI) * 0.9;
      awake = true;
    }
  }
  if (awake) renderer.render(scene, camera);
  dirty = false;
  requestAnimationFrame(frame);
}

await document.fonts.load('800 60px "Alegreya Sans"');
createToys();
resize();
placeToys();
window.addEventListener("resize", resize);
new ResizeObserver(resize).observe(document.body); // the page gets taller when fonts load
requestAnimationFrame(frame);
