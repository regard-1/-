import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalDB } from './studio/local-db.mjs';
import { handle } from './dist/server/index.js';

const root = fileURLToPath(new URL('./', import.meta.url));
const client = resolve(root, 'dist/client');
const dataDir = process.env.STUDIO_DATA_DIR || resolve(root, '.studio-local');
const port = Number(process.env.STUDIO_PORT || 3000);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const assets = {
  async fetch(request) {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url).pathname); }
    catch { return new Response('', { status: 400 }); }
    const filePath = resolve(client, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filePath.startsWith(client + sep)) return new Response('', { status: 403 });
    try {
      return new Response(await readFile(filePath), {
        headers: { 'Content-Type': mime[extname(filePath)] || 'application/octet-stream' },
      });
    } catch {
      try {
        const indexPath = resolve(filePath, 'index.html');
        return new Response(await readFile(indexPath), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      } catch { return new Response('Not found', { status: 404 }); }
    }
  },
};

await mkdir(dataDir, { recursive: true });
let db;
if (process.env.DATABASE_URL) {
  const { PgDB } = await import('./studio/pg-db.mjs');
  db = new PgDB(process.env.DATABASE_URL);
  console.log('Using PostgreSQL database');
} else {
  db = new LocalDB(resolve(dataDir, 'studio.db'));
  console.log('Using local SQLite database');
}

const server = createServer(async (req, res) => {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `127.0.0.1:${port}`;
    const requestUrl = new URL(req.url, `${proto}://${host}`);
    const request = new Request(requestUrl, {
      method: req.method,
      headers: req.headers,
      ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}),
    });
    const env = {
      DB: db,
      ASSETS: assets,
      STUDIO_LLM_API_KEY: process.env.STUDIO_LLM_API_KEY,
      STUDIO_LLM_BASE_URL: process.env.STUDIO_LLM_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      BAILIAN_KB_API_KEY: process.env.BAILIAN_KB_API_KEY,
      BAILIAN_KB_BASE_URL: process.env.BAILIAN_KB_BASE_URL,
      BAILIAN_KB_WORKSPACE_ID: process.env.BAILIAN_KB_WORKSPACE_ID,
      BAILIAN_KB_AGENT_ID: process.env.BAILIAN_KB_AGENT_ID,
      BAILIAN_KB_TOP_K: process.env.BAILIAN_KB_TOP_K,
      WECOM_API_BASE: process.env.WECOM_API_BASE,
      WECOM_API_TOKEN: process.env.WECOM_API_TOKEN,
      WECOM_API_TIMEOUT_MS: process.env.WECOM_API_TIMEOUT_MS,
      IDP_CLIENT_ID: process.env.IDP_CLIENT_ID,
      IDP_CLIENT_SECRET: process.env.IDP_CLIENT_SECRET,
      IDP_REDIRECT_URI: process.env.IDP_REDIRECT_URI,
      IDP_EMAIL_DOMAIN: process.env.IDP_EMAIL_DOMAIN,
      IDP_ORG_ID: process.env.IDP_ORG_ID,
      SP_BASE_URL: process.env.SP_BASE_URL,
      SP_SSO_PATH: process.env.SP_SSO_PATH,
      SP_REDIRECT_PATH: process.env.SP_REDIRECT_PATH,
      SP_ALLOWED_ORIGIN: process.env.SP_ALLOWED_ORIGIN,
    };
    const response = await handle(request, env);
    const headers = Object.fromEntries(response.headers);
    res.writeHead(response.status, headers);
    if (response.body) for await (const part of response.body) res.write(part);
    res.end();
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Cache-Control': 'no-store' });
    res.end('Server error');
  }
});

await new Promise((ok, reject) => {
  server.once('error', reject);
  server.listen(port, '0.0.0.0', ok);
});

console.log(`Production server running on port ${port}`);
if (!process.env.DATABASE_URL) console.log(`Data directory: ${dataDir}`);

const stop = async () => { server.close(); db.close(); process.exit(0); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
