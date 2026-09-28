// Generates the PWA / Apple touch icons from an SVG. Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const OPACITY = [0.35, 1, 0.6, 1, 0.8, 0.35, 1, 1, 0.6, 1, 1, 0.45, 1, 0.8, 1, 1];

function svg(size, { rounded, inset }) {
  const pad = size * inset;
  const inner = size - pad * 2;
  const gap = inner * 0.06;
  const cell = (inner - gap * 3) / 4;
  const rects = OPACITY.map((o, i) => {
    const col = Math.floor(i / 4);
    const row = i % 4;
    const x = pad + col * (cell + gap);
    const y = pad + row * (cell + gap);
    return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="${cell * 0.22}" fill="#10b981" fill-opacity="${o}"/>`;
  }).join("");
  const r = rounded ? size * 0.22 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="#0b0b0c"/>${rects}</svg>`;
}

mkdirSync("public/icons", { recursive: true });
const jobs = [
  ["public/icons/icon-192.png", 192, { rounded: true, inset: 0.2 }],
  ["public/icons/icon-512.png", 512, { rounded: true, inset: 0.2 }],
  ["public/icons/maskable-512.png", 512, { rounded: false, inset: 0.27 }],
  ["public/icons/badge-96.png", 96, { rounded: false, inset: 0.12 }],
  ["public/apple-touch-icon.png", 180, { rounded: false, inset: 0.2 }],
  ["src/app/icon.png", 64, { rounded: true, inset: 0.16 }],
];
for (const [file, size, opts] of jobs) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(file);
  console.log("wrote", file);
}
