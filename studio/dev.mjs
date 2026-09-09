import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { LocalDB } from './local-db.mjs';
import { handle } from './server/worker.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const client = resolve(root, 'dist/client');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
export const assets = { async fetch(request) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('', { status: 400 }); }
  const path = resolve(client, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(client + sep)) return new Response('', { status: 403 });
  try { return new Response(await readFile(path), { headers: { 'Content-Type': mime[extname(path)] || 'application/octet-stream' } }); }
  catch { return new Response('Not found', { status: 404 }); }
} };

export async function startServer({ db, env = {}, dependencies = {}, port = 0 } = {}) {
  const runtime = { ...env, DB: db, ASSETS: assets };
  const server = createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    if (req.headers.host !== host) { res.writeHead(403); res.end(); return; }
    try {
      const request = new Request(`http://${host}${req.url}`, { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}) });
      const response = await handle(request, runtime, dependencies);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) for await (const part of response.body) res.write(part);
      res.end();
    } catch { res.writeHead(500, { 'Cache-Control': 'no-store' }); res.end('Local service error'); }
  });
  await new Promise((ok, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', ok); });
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => server.close(resolve)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.loadEnvFile(resolve(root, '.env')); } catch {}
  await mkdir(resolve(root, '.studio-local'), { recursive: true });
  const db = new LocalDB(resolve(root, '.studio-local/studio.db'));
  const runtime = await startServer({ db, port: Number(process.env.STUDIO_PORT || 0), env: {
    STUDIO_LOCAL_SETUP: '1', STUDIO_LLM_API_KEY: process.env.STUDIO_LLM_API_KEY,
    STUDIO_LLM_BASE_URL: process.env.STUDIO_LLM_BASE_URL,
  } });
  console.log(`Local: ${runtime.url}/script-studio`);
  console.log('Local-only preview. Create your own administrator; real generation requires server environment credentials.');
  const stop = async () => { await runtime.close(); db.close(); process.exit(0); };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
