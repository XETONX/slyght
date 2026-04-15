const { createCanvas } = require('canvas');
const fs = require('fs');

function makeIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Pure black background
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);

  const sw = size * 0.15;
  const pad = size * 0.22;
  const w = size - pad * 2;
  const cx = size / 2;
  const cy = size / 2;
  const r = w / 2;
  const halfH = w / 4;

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = sw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Top arc — curves right (left half of S)
  ctx.beginPath();
  ctx.arc(cx, cy - halfH, r - sw / 2, Math.PI, 0, false);
  ctx.stroke();

  // Bottom arc — curves left (right half of S)
  ctx.beginPath();
  ctx.arc(cx, cy + halfH, r - sw / 2, 0, Math.PI, false);
  ctx.stroke();

  // Connect top arc left end to bottom arc left end through centre
  ctx.beginPath();
  ctx.moveTo(cx - (r - sw / 2), cy - halfH);
  ctx.lineTo(cx - (r - sw / 2) + sw * 0.5, cy);
  ctx.lineTo(cx - (r - sw / 2), cy + halfH);
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

try {
  fs.writeFileSync('icon-192.png', makeIcon(192));
  fs.writeFileSync('icon-512.png', makeIcon(512));
  console.log('Icons generated successfully');
} catch (e) {
  console.error('Failed:', e.message);
  console.log('Run: npm install canvas --save-dev');
}
