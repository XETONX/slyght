// Push-reliability fix 2026-05-26 — gzip round-trip + size proof (pure node).
//
// No page: validates that the client-compress -> worker-decompress path uses
// sound, symmetric primitives, and that a representative ~136KB blob compresses
// under the 64KB keepalive cap. This is the algorithmic backstop for the
// worker change (which Playwright's intercepted-worker smoke can't exercise).
// Run: npm run smoke

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Client side: exactly what PUSH.pushFullState does (CompressionStream).
async function gzip(input) {
  const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'));
  return Buffer.from(await new Response(stream).arrayBuffer());
}
// Worker side: exactly what slyght-worker/src/index.js does (DecompressionStream).
async function gunzip(buf) {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(stream).text();
}

test.describe('push gzip round-trip + size', () => {
  test('client CompressionStream -> worker DecompressionStream preserves {S,BILLS}', async () => {
    const sample = JSON.stringify({
      S: { bal: 1240.5, txns: [{ ts: 1, amt: 5, note: 'coffee '.repeat(50) }], planIntents: [], savingsBuckets: [] },
      BILLS: [{ name: 'Rent', amt: 1800, day: 1 }],
    });
    const gz = await gzip(sample);
    expect(gz[0]).toBe(0x1f);                       // gzip magic byte 1
    expect(gz[1]).toBe(0x8b);                       // gzip magic byte 2
    expect(gz.length).toBeLessThan(sample.length);  // actually compressed
    const back = await gunzip(gz);                  // worker's decompress path
    expect(JSON.parse(back)).toEqual(JSON.parse(sample));  // byte-equivalent round-trip
  });

  test('representative ~136KB blob compresses under the 64KB keepalive cap', async () => {
    const oracle = path.resolve(__dirname, '../state-dump/live-2026-05-23.json');
    test.skip(!fs.existsSync(oracle), 'oracle blob not present');
    const raw = fs.readFileSync(oracle);
    expect(raw.length).toBeGreaterThan(100000);     // representative large blob
    const gz = await gzip(raw);
    expect(gz.length).toBeLessThan(65536);          // fits the keepalive cap
  });
});
