const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'website-dist');
const build = spawnSync(process.execPath, [path.join(__dirname, 'build-web.cjs')], { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status || 1);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'], ['.webmanifest', 'application/manifest+json'],
  ['.png', 'image/png'], ['.bin', 'application/octet-stream'],
]);

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(output, relative);
  if (path.relative(output, resolved).startsWith('..')) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mime.get(path.extname(resolved)) || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  });
});

server.listen(4173, '127.0.0.1', () => {
  console.log('Website ready at http://127.0.0.1:4173');
});
