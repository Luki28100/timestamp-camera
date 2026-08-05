// Generates every icon from one drawing, without any dependency:
//   public/                     PWA icons and favicons
//   android/.../mipmap-*/       launcher icons (legacy square, round, adaptive foreground)
// Shapes are rasterised at 4x and box-filtered down, which gives clean edges.
// Run with: npm run icons
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "public");
const RES_DIR = join(ROOT, "android", "app", "src", "main", "res");
const SS = 4; // supersampling factor

const BG = [0x0b, 0x0f, 0x14];
const BODY = [0xe2, 0xe8, 0xf0];
const ACCENT = [0xff, 0xd4, 0x00];

/* ---------- tiny PNG encoder ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- drawing ---------- */

// `scale` shrinks the artwork towards the centre. Adaptive foregrounds need this:
// launchers may crop everything outside the middle 66% of the canvas.
function createCanvas(size, scale = 1) {
  const buf = Buffer.alloc(size * size * 4);
  const map = (v) => 0.5 + (v - 0.5) * scale;
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = 255;
  };

  return {
    buf,
    fillAll(color) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, color);
    },
    /** keeps only what lies inside the inscribed circle */
    clipToCircle() {
      const c = size / 2;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x + 0.5 - c;
          const dy = y + 0.5 - c;
          if (dx * dx + dy * dy > c * c) buf[(y * size + x) * 4 + 3] = 0;
        }
      }
    },
    // all coordinates are relative (0..1)
    roundRect(x0, y0, x1, y1, r, color) {
      const ax = map(x0) * size;
      const ay = map(y0) * size;
      const bx = map(x1) * size;
      const by = map(y1) * size;
      const rr = r * scale * size;
      for (let y = Math.floor(ay); y < Math.ceil(by); y++) {
        for (let x = Math.floor(ax); x < Math.ceil(bx); x++) {
          const cx = Math.min(Math.max(x + 0.5, ax + rr), bx - rr);
          const cy = Math.min(Math.max(y + 0.5, ay + rr), by - rr);
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= rr * rr) put(x, y, color);
        }
      }
    },
    disc(cx, cy, r, color) {
      const px = map(cx) * size;
      const py = map(cy) * size;
      const pr = r * scale * size;
      for (let y = Math.floor(py - pr); y < Math.ceil(py + pr); y++) {
        for (let x = Math.floor(px - pr); x < Math.ceil(px + pr); x++) {
          const dx = x + 0.5 - px;
          const dy = y + 0.5 - py;
          if (dx * dx + dy * dy <= pr * pr) put(x, y, color);
        }
      }
    },
  };
}

function downsample(src, size, factor) {
  const w = size / factor;
  const out = Buffer.alloc(w * w * 4);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = ((y * factor + sy) * size + (x * factor + sx)) * 4;
          const alpha = src[i + 3] / 255;
          r += src[i] * alpha;
          g += src[i + 1] * alpha;
          b += src[i + 2] * alpha;
          a += src[i + 3];
        }
      }
      const n = factor * factor;
      const o = (y * w + x) * 4;
      const coverage = a / (n * 255);
      // un-premultiply so edges keep their colour instead of fading to black
      out[o] = coverage ? Math.round(r / n / coverage) : 0;
      out[o + 1] = coverage ? Math.round(g / n / coverage) : 0;
      out[o + 2] = coverage ? Math.round(b / n / coverage) : 0;
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/** shape: "square" (full bleed), "circle" (clipped), "none" (transparent behind) */
function renderIcon(targetSize, { shape = "square", scale = 1 } = {}) {
  const size = targetSize * SS;
  const c = createCanvas(size, scale);

  if (shape !== "none") c.fillAll(BG);

  // camera body with viewfinder bump
  c.roundRect(0.32, 0.2, 0.52, 0.3, 0.02, BODY);
  c.roundRect(0.14, 0.26, 0.86, 0.72, 0.07, BODY);
  // lens
  c.disc(0.5, 0.49, 0.175, BG);
  c.disc(0.5, 0.49, 0.14, ACCENT);
  c.disc(0.5, 0.49, 0.095, BG);
  // clock hands inside the lens
  c.roundRect(0.487, 0.4, 0.513, 0.5, 0.013, ACCENT);
  c.roundRect(0.5, 0.482, 0.575, 0.508, 0.013, ACCENT);
  // burnt-in timestamp bar
  c.roundRect(0.2, 0.78, 0.8, 0.86, 0.025, ACCENT);

  if (shape === "circle") c.clipToCircle();

  return downsample(c.buf, size, SS);
}

const write = (path, size, options) => {
  writeFileSync(path, encodePng(size, size, renderIcon(size, options)));
  console.log(`wrote ${path.replace(ROOT, ".")} (${size}x${size})`);
};

/* ---------- PWA ---------- */

mkdirSync(PUBLIC_DIR, { recursive: true });
for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
  ["favicon-32.png", 32],
]) {
  write(join(PUBLIC_DIR, name), size);
}
// Play Store listing icon, should the app ever be submitted somewhere
write(join(PUBLIC_DIR, "store-icon-512.png"), 512);

/* ---------- Android launcher ---------- */

// legacy sizes are 48dp, the adaptive foreground canvas is 108dp
const DENSITIES = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
];

for (const [density, legacy, foreground] of DENSITIES) {
  const dir = join(RES_DIR, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  write(join(dir, "ic_launcher.png"), legacy, { shape: "square", scale: 0.86 });
  write(join(dir, "ic_launcher_round.png"), legacy, { shape: "circle", scale: 0.72 });
  // 0.6 keeps the artwork inside the 66% safe zone of the adaptive canvas
  write(join(dir, "ic_launcher_foreground.png"), foreground, { shape: "none", scale: 0.6 });
}
