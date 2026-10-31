import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

export function preview(port = 4173) {
  const root = resolve(import.meta.dirname, '../dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const clean = pathname.replace(/^\/preview\//, '/');
    const file = resolve(root, `.${decodeURIComponent(clean)}`, clean.endsWith('/') ? 'index.html' : '');
    if (!file.startsWith(root + sep)) return res.writeHead(403).end();
    try {
      res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(await readFile(file));
    } catch { res.writeHead(404).end('Not found'); }
  });
  server.listen(port, '0.0.0.0');
  return server;
}
if (process.argv[1] === import.meta.filename) {
  const server = preview(Number(process.argv[2]) || 4173);
  server.on('listening', () => console.log(`Wheel Rhythm: http://localhost:${server.address().port}/preview/`));
}
