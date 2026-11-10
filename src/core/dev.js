/**
 * Dev mode: file watcher + built-in HTTP server with live reload.
 * Zero dependencies (node:http + fs.watch + polling SSE).
 */

import http from 'node:http';
import { watch, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadConfig } from './config.js';

/**
 * Watch a directory tree, invoking onChange on any markdown change.
 * Missing directories are tolerated (the watcher becomes a no-op).
 * @param {string} dir
 * @param {() => void} onChange
 * @returns {() => void} close function
 */
export function watchFiles(dir, onChange) {
  if (!existsSync(dir)) return () => {};

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 60);
  };
  const onEvent = (_evt, file) => {
    if (file && /\.(md|mdx)$/.test(file)) schedule();
  };
  let watcher;
  try {
    watcher = watch(dir, { recursive: true }, onEvent);
  } catch {
    // Recursive fs.watch is unavailable on some Node/Linux combinations.
    watcher = watch(dir, onEvent);
  }
  watcher.on('error', () => {});
  return () => {
    clearTimeout(timer);
    watcher.close();
  };
}

/**
 * Start a dev server that serves built HTML and reloads on doc changes.
 * @param {object} opts
 * @param {string} opts.root
 * @param {() => Promise<{ written: string[] }>} opts.rebuild
 * @param {number} [opts.port]
 */
export async function startDevServer({ root, rebuild, port = 4321 }) {
  const config = await loadConfig(root);
  const inputDir = path.resolve(root, config.input);
  const outDir = path.resolve(root, config.output);
  const clients = new Set();

  const trigger = async () => {
    try {
      await rebuild();
      for (const res of clients) res.write('event: reload\ndata: ok\n\n');
    } catch (err) {
      console.error('[fidocs] build error:', err.message);
    }
  };

  // Watch config.input; if it does not exist yet, fall back to the project
  // root so creating the docs directory still triggers a rebuild.
  const close = watchFiles(existsSync(inputDir) ? inputDir : path.resolve(root), trigger);

  const server = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad request');
      return;
    }

    if (pathname === '/__fidocs/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('event: connected\ndata: ok\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    let target = path.normalize(path.join(outDir, pathname));
    const rel = path.relative(outDir, target);
    if (isOutside(rel)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if (pathname.endsWith('/')) target = path.join(target, 'index.html');
    else if (!path.extname(target)) target += '.html';

    try {
      let body = await readFile(target, 'utf8');
      if (target.endsWith('.html')) {
        body = injectReload(body);
      }
      res.writeHead(200, { 'Content-Type': guessType(target) });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  return new Promise((resolve, reject) => {
    const onError = (err) => {
      close();
      reject(err);
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      const address = server.address();
      const actualPort = address && typeof address === 'object' ? address.port : port;
      console.log(`[fidocs] dev server at http://localhost:${actualPort}`);
      resolve({
        port: actualPort,
        close: () => {
          close();
          server.close();
          for (const res of clients) res.end();
        },
      });
    });
  });
}

function isOutside(rel) {
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

function injectReload(html) {
  const script = `<script>
  (() => { const es = new EventSource('/__fidocs/events'); es.addEventListener('reload', () => location.reload()); })();
</script></body>`;
  return html.includes('</body>') ? html.replace('</body>', script) : html + script;
}

function guessType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8';
  if (file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
