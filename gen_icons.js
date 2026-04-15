const fs = require('fs');

function generatePNG(size) {
  // Pure Node PNG generator — no dependencies
  const bg = 0x00; // black
  const fg = 0xFF; // white

  const pixels = new Uint8Array(size * size * 4);

  // Fill black background
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = pixels[i+1] = pixels[i+2] = bg;
    pixels[i+3] = 255;
  }

  // Draw S using thick strokes
  const cx = size / 2;
  const cy = size / 2;
  const sw = Math.round(size * 0.13); // stroke width
  const r = Math.round(size * 0.22);  // radius of each arc
  const gap = Math.round(size * 0.08); // gap between arcs

  function setPixel(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    pixels[idx] = pixels[idx+1] = pixels[idx+2] = fg;
    pixels[idx+3] = 255;
  }

  function fillCircle(cx, cy, r) {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x*x + y*y <= r*r) setPixel(cx+x, cy+y);
      }
    }
  }

  function drawArc(acx, acy, radius, startAngle, endAngle, steps) {
    for (let i = 0; i <= steps; i++) {
      const angle = startAngle + (endAngle - startAngle) * i / steps;
      const x = acx + radius * Math.cos(angle);
      const y = acy + radius * Math.sin(angle);
      fillCircle(x, y, sw / 2);
    }
  }

  // Top arc — right facing (upper half of S)
  const topCY = cy - gap - r * 0.3;
  drawArc(cx, topCY, r, Math.PI * 0.1, Math.PI * 1.1, 60);

  // Bottom arc — left facing (lower half of S)
  const botCY = cy + gap + r * 0.3;
  drawArc(cx, botCY, r, Math.PI * 1.1, Math.PI * 2.1, 60);

  // Encode as PNG
  return encodePNG(size, size, pixels);
}

function encodePNG(width, height, pixels) {
  function crc32(buf) {
    let crc = -1;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
  }

  function chunk(type, data) {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.concat([t, data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(crcBuf));
    return Buffer.concat([len, t, data, c]);
  }

  const zlib = require('zlib');
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(width * 4 + 1);
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      row[x * 4 + 1] = pixels[src];
      row[x * 4 + 2] = pixels[src+1];
      row[x * 4 + 3] = pixels[src+2];
      row[x * 4 + 4] = pixels[src+3];
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, {level: 6});

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.writeFileSync('icon-192.png', generatePNG(192));
fs.writeFileSync('icon-512.png', generatePNG(512));
console.log('Icons generated — no dependencies needed');
