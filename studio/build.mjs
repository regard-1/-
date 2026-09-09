import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { sites } from '@openai/sites-vite-plugin';
import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await mkdir(resolve(root, 'dist/client/script-studio'), { recursive: true });
await viteBuild({ root, configFile: false, publicDir: false, plugins: [sites()],
  build: { ssr: 'studio/server/worker.mjs', outDir: 'dist/server', emptyOutDir: false,
    rollupOptions: { output: { format: 'es', entryFileNames: 'index.js' } } },
});
await build({ entryPoints: [resolve(root, 'studio/public/app.mjs')], outfile: resolve(root, 'dist/client/script-studio/app.js'), bundle: true, format: 'esm', target: 'es2022', minify: true, sourcemap: false });
for (const file of ['index.html', 'style.css']) await cp(resolve(root, 'studio/public', file), resolve(root, 'dist/client/script-studio', file));
// The host keeps its existing shell. The embedded tool has its own document and native API requests.
await cp(resolve(root, 'index.html'), resolve(root, 'dist/client/index.html'));
await cp(resolve(root, 'assets'), resolve(root, 'dist/client/assets'), { recursive: true });
console.log('Studio Worker, client and schema migrations built. No accounts, customer inputs or secrets included.');
