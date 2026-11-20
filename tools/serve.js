// Local preview server. Serves the project folder and wraps index.html the same way the Pages build does.
// Usage: node tools/serve.js [folder] [port]   (defaults: project folder, 4318)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { wrap } = require('./build-pages.js');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const port = +process.argv[3] || 4318;
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript' };

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    const body = p === '/index.html' ? wrap(buf.toString('utf8')) : buf;
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(port, '127.0.0.1', () => console.log(`Serving ${root} on http://localhost:${port}`));
