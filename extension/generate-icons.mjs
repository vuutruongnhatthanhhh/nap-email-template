// Generates simple placeholder square icons (no external deps — hand-rolled
// PNG encoder using Node's built-in zlib). Replace public/icons/*.png with
// real artwork whenever you like; this just keeps `npm install` to zero
// extra packages for something this small.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BRAND = [37, 99, 235]; // #2563EB (blue, envelope-ish)
const SIZES = [16, 48, 128];

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const [r, g, b] = BRAND;
  const pad = Math.max(1, Math.round(size * 0.18));
  const radius = Math.round(size * 0.22);

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const inset = x < pad || x >= size - pad || y < pad || y >= size - pad;
      // rounded-corner mask for the outer edge
      const corner =
        (x < radius && y < radius && Math.hypot(radius - x, radius - y) > radius) ||
        (x >= size - radius && y < radius && Math.hypot(x - (size - radius), radius - y) > radius) ||
        (x < radius && y >= size - radius && Math.hypot(radius - x, y - (size - radius)) > radius) ||
        (x >= size - radius && y >= size - radius && Math.hypot(x - (size - radius), y - (size - radius)) > radius);

      const i = rowStart + 1 + x * 4;
      if (corner) {
        raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 0;
      } else if (inset) {
        raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; raw[i + 3] = 255;
      } else {
        raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(__dirname, "public", "icons");
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const png = makePng(size);
  writeFileSync(join(outDir, `icon${size}.png`), png);
  console.log(`wrote public/icons/icon${size}.png`);
}
