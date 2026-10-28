// Local test server: serves the static pages and the /api functions the same
// way Vercel does. Usage: copy .env.example to .env, fill it in, then
// `npm install && npm run dev` and open http://localhost:3000/app.html
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const routes = {
  '/api/scan': () => import('./api/scan.js'),
  '/api/brief': () => import('./api/brief.js'),
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (routes[url.pathname]) {
      const { default: handler } = await routes[url.pathname]();
      return await handler(req, res);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(root, rel);
    if (!file.startsWith(root) || rel.startsWith('api/') || rel.startsWith('.env')) throw Object.assign(new Error(), { code: 'ENOENT' });
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') { res.writeHead(404); return res.end('Not found'); }
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Erreur serveur' }));
  }
}).listen(port, () => console.log(`Pousse → http://localhost:${port}/app.html`));
