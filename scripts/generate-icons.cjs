"use strict";

// Deterministic dependency-free PNG renderer for Linkerter release icons.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.resolve(__dirname, "..");
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function clamp(value) { return Math.max(0, Math.min(1, value)); }
function mix(a, b, amount) { return a + (b - a) * amount; }

function roundedBox(x, y, cx, cy, halfWidth, halfHeight, radius, angle = 0) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  const rx = dx * cosine - dy * sine;
  const ry = dx * sine + dy * cosine;
  const qx = Math.abs(rx) - halfWidth + radius;
  const qy = Math.abs(ry) - halfHeight + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function paint(pixel, color, alpha) {
  const amount = clamp(alpha);
  pixel[0] = mix(pixel[0], color[0], amount);
  pixel[1] = mix(pixel[1], color[1], amount);
  pixel[2] = mix(pixel[2], color[2], amount);
  pixel[3] = mix(pixel[3], 255, amount);
}

function render(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const antialias = 1.25 / size;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const px = (x + 0.5) / size;
      const py = (y + 0.5) / size;
      const pixel = [0, 0, 0, 0];
      const backgroundDistance = roundedBox(px, py, 0.5, 0.5, 0.48, 0.48, 0.19);
      const backgroundAlpha = clamp(0.5 - backgroundDistance / antialias);
      const background = [mix(20, 8, py), mix(52, 31, py), mix(77, 49, py)];
      paint(pixel, background, backgroundAlpha);

      // Two interlocking rounded links remain legible at toolbar size.
      const first = Math.abs(roundedBox(px, py, 0.39, 0.60, 0.27, 0.15, 0.12, Math.PI / 4)) - 0.045;
      paint(pixel, [239, 248, 251], clamp(0.5 - first / antialias));
      const second = Math.abs(roundedBox(px, py, 0.61, 0.40, 0.27, 0.15, 0.12, Math.PI / 4)) - 0.045;
      paint(pixel, [42, 205, 181], clamp(0.5 - second / antialias));

      // A small center bridge visually connects the links without extra detail.
      const bridge = roundedBox(px, py, 0.50, 0.50, 0.13, 0.038, 0.035, Math.PI / 4);
      paint(pixel, [239, 248, 251], clamp(0.5 - bridge / antialias));
      const offset = row + 1 + x * 4;
      for (let channel = 0; channel < 4; channel += 1) raw[offset + channel] = Math.round(pixel[channel]);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

for (const size of [16, 48, 128]) {
  const destination = path.join(root, "icons", `icon-${size}.png`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const data = render(size);
  if (!fs.existsSync(destination) || !fs.readFileSync(destination).equals(data)) fs.writeFileSync(destination, data);
  console.log(`Generated icons/icon-${size}.png (${data.length} bytes)`);
}
