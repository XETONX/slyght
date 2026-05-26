// Tiny static file server for visual regression tests.
// Strips a leading "/slyght/" prefix so absolute paths in index.html
// (the service-worker registration uses "/slyght/sw.js" because the
// production deploy lives at xetonx.github.io/slyght) resolve under
// localhost without rewriting the app.

const http = require('http');
const fs = require('fs');
const path = require('path');

const port = parseInt(process.argv[2] || '4567', 10);
const root = path.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/slyght/')) p = p.slice(7);
  if (p === '/' || p === '') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found: ' + p); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
// Bind to 127.0.0.1 (localhost-only), NEVER 0.0.0.0. Without an explicit host
// Node listens on all interfaces, exposing this static file server (which serves
// the whole repo) to anything on the local network. Hard-coding the loopback
// address closes that — same rule the mission-control server is built to.
}).listen(port, '127.0.0.1', () => console.log('serving ' + root + ' on http://127.0.0.1:' + port + ' (localhost-only)'));
