// Run: node tools/make-map.mjs assets/forest-road.svg
// Builds a forest road battle map as an SVG. Vector, so it stays sharp at any size.
// Same seed, same map.
import { writeFileSync } from "node:fs";

const W = 1600, H = 2400, CELL = 50;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const between = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];
const f = (n) => n.toFixed(1);

const roadX = (y) => W / 2 + 70 * Math.sin(y / 420) + 30 * Math.sin(y / 170 + 1);
const ROAD = 95; // half width

const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);

// Grass with a few lighter and darker patches
out.push(`<rect width="${W}" height="${H}" fill="#7d9c3c"/>`);
for (let i = 0; i < 40; i++) {
  const light = rand() < 0.5;
  out.push(`<ellipse cx="${f(between(0, W))}" cy="${f(between(0, H))}" rx="${f(between(80, 220))}" ry="${f(between(60, 160))}" fill="${light ? "#8fae47" : "#6e8d33"}" opacity="0.55"/>`);
}
// Grass strokes
let strokes = "";
for (let i = 0; i < 1400; i++) {
  const x = between(0, W), y = between(0, H);
  strokes += `M${f(x)} ${f(y)}l${f(between(-3, 3))} ${f(between(-9, -5))}`;
}
out.push(`<path d="${strokes}" stroke="#5f7d2c" stroke-width="1.6" stroke-linecap="round" fill="none" opacity="0.7"/>`);

// Dirt road with a dark edge
const left = [], right = [];
for (let y = -20; y <= H + 20; y += 20) {
  const c = roadX(y);
  left.push(`${f(c - ROAD + between(-6, 6))},${y}`);
  right.unshift(`${f(c + ROAD + between(-6, 6))},${y}`);
}
out.push(`<polygon points="${left.join(" ")} ${right.join(" ")}" fill="#d8bf86" stroke="#7a5d32" stroke-width="5" stroke-linejoin="round"/>`);
// Road cracks and pebbles
let cracks = "";
for (let i = 0; i < 70; i++) {
  const y = between(0, H), x = roadX(y) + between(-ROAD + 20, ROAD - 20);
  cracks += `M${f(x)} ${f(y)}q${f(between(-10, 10))} ${f(between(5, 12))} ${f(between(-14, 14))} ${f(between(14, 26))}`;
}
out.push(`<path d="${cracks}" stroke="#a88a55" stroke-width="2" fill="none"/>`);

// Shapes
function blob(cx, cy, r, bumps, wobble) {
  // A round shape with a bumpy edge, like a tree crown drawn in ink
  const pts = [];
  const phase = rand() * 6.3;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const rr = r * (1 + wobble * Math.abs(Math.sin(a * bumps / 2 + phase)));
    pts.push(`${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`);
  }
  return pts.join(" ");
}
function rock(cx, cy, r) {
  const pts = [];
  const n = 6 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + between(-0.2, 0.2);
    const rr = r * between(0.7, 1.1);
    pts.push(`${f(cx + rr * Math.cos(a))},${f(cy + rr * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="#7d8088" stroke="#2c2d33" stroke-width="3" stroke-linejoin="round"/>` +
    `<polygon points="${pts.slice(0, Math.ceil(n / 2)).join(" ")}" fill="#9a9da5"/>`;
}

// Pebbles on the road
for (let i = 0; i < 18; i++) {
  const y = between(0, H);
  out.push(rock(roadX(y) + between(-ROAD + 25, ROAD - 25), y, between(6, 12)));
}

// Fallen logs and rocks beside the road
const items = [];
for (let i = 0; i < 14; i++) {
  const y = between(60, H - 60), side = rand() < 0.5 ? -1 : 1;
  const x = roadX(y) + side * between(ROAD + 30, ROAD + 120);
  const len = between(70, 130), ang = between(-25, 25) + 90;
  items.push(`<g transform="translate(${f(x)} ${f(y)}) rotate(${f(ang)})"><rect x="${f(-len / 2)}" y="-11" width="${f(len)}" height="22" rx="10" fill="#6b4a2b" stroke="#2a1b10" stroke-width="3"/><path d="M${f(-len / 2 + 12)} -3h${f(len - 30)}M${f(-len / 2 + 20)} 5h${f(len - 45)}" stroke="#4a3220" stroke-width="2"/><ellipse cx="${f(len / 2 - 6)}" cy="0" rx="7" ry="10" fill="#c49a62" stroke="#2a1b10" stroke-width="2.5"/></g>`);
}
for (let i = 0; i < 40; i++) {
  const y = between(0, H), x = rand() < 0.5 ? between(0, roadX(y) - ROAD - 20) : between(roadX(y) + ROAD + 20, W);
  items.push(rock(x, y, between(10, 22)));
}
// Small bushes with white flowers
for (let i = 0; i < 45; i++) {
  const y = between(0, H), x = rand() < 0.5 ? between(0, roadX(y) - ROAD - 15) : between(roadX(y) + ROAD + 15, W);
  const r = between(14, 24);
  let s = `<polygon points="${blob(x, y, r, 7, 0.25)}" fill="#3f6b2a" stroke="#1d2e14" stroke-width="2.5"/>`;
  for (let k = 0; k < 3; k++) s += `<circle cx="${f(x + between(-r / 2, r / 2))}" cy="${f(y + between(-r / 2, r / 2))}" r="3.2" fill="#f4f1e6" stroke="#1d2e14" stroke-width="1"/>`;
  items.push(s);
}
out.push(...items);

// Trees: shadow, crown with an ink outline, a lighter top, and a few leaf marks.
// Kept off the road, with some space between them.
const greens = [["#4f7d2b", "#6a9a37"], ["#567f2d", "#79a640"], ["#3f6d27", "#5b8c33"], ["#6c7f2a", "#8ea13a"]];
const autumn = [["#a8742a", "#c99a3c"], ["#94652a", "#b98535"]];
const trees = [];
for (let tries = 0; tries < 4000 && trees.length < 115; tries++) {
  const r = between(55, 95);
  const y = between(-40, H + 40);
  const x = between(-40, W + 40);
  if (Math.abs(x - roadX(y)) < ROAD + r * 0.55) continue;
  if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.82)) continue;
  trees.push({ x, y, r });
}
trees.sort((a, b) => a.y - b.y);
for (const t of trees) {
  const [dark, light] = rand() < 0.12 ? pick(autumn) : pick(greens);
  out.push(`<polygon points="${blob(t.x + t.r * 0.18, t.y + t.r * 0.22, t.r * 1.02, 9, 0.12)}" fill="#1b2a10" opacity="0.35"/>`);
  out.push(`<polygon points="${blob(t.x, t.y, t.r, 9, 0.14)}" fill="${dark}" stroke="#1c2711" stroke-width="4" stroke-linejoin="round"/>`);
  out.push(`<polygon points="${blob(t.x - t.r * 0.12, t.y - t.r * 0.14, t.r * 0.62, 7, 0.16)}" fill="${light}" stroke="#2c3b1a" stroke-width="2" stroke-linejoin="round"/>`);
  let marks = "";
  for (let k = 0; k < 7; k++) {
    const a = between(0, 6.3), d = between(0.2, 0.8) * t.r;
    const x = t.x + d * Math.cos(a), y = t.y + d * Math.sin(a);
    marks += `M${f(x)} ${f(y)}q4 -6 8 0`;
  }
  out.push(`<path d="${marks}" stroke="#1c2711" stroke-width="2" fill="none" stroke-linecap="round"/>`);
}

// 5 ft grid over everything
let grid = "";
for (let x = 0; x <= W; x += CELL) grid += `M${x} 0V${H}`;
for (let y = 0; y <= H; y += CELL) grid += `M0 ${y}H${W}`;
out.push(`<path d="${grid}" stroke="#1d2a12" stroke-width="1.5" opacity="0.28" fill="none"/>`);

out.push("</svg>");
const svg = out.join("\n");
writeFileSync(process.argv[2], svg);
console.log("trees", trees.length, "bytes", svg.length);
