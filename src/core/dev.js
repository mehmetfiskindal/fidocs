/**
 * Dev mode: file watcher + built-in HTTP server with live reload.
 * Zero dependencies (node:http + fs.watch + polling SSE).
 */

import http from 'node:http';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Watch a directory tree, invoking onChange on any file change.
 * @param {string} dir
 * @param {() => void} onChange
 * @returns {() => void} close function
 */
export function watchFiles(dir, onChange) {
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(onChange, 60);
  };
  const watcher = watch(dir, { recursive: true }, (_evt, file) => {
    if (file && /\.(md|mdx)$/.test(file)) schedule();
  });
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
export function startDevServer({ root, rebuild, port = 4321 }) {
  const clients = new Set();

  const trigger = async () => {
    try {
      await rebuild();
      for (const res of clients) res.write('event: reload\ndata: ok\n\n');
    } catch (err) {
      console.error('[fidocs] build error:', err.message);
    }
  };

  const close = watchFiles(path.join(root, 'docs'), trigger);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === '/__fidocs/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
      res.write('event: connected\ndata: ok\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    const outDir = path.join(root, (await import('./config.js').then((m) => m.loadConfig(root))).output);
    let target = path.normalize(path.join(outDir, decodeURIComponent(url.pathname)));
    if (!target.startsWith(path.resolve(outDir))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (url.pathname.endsWith('/')) target = path.join(target, 'index.html');
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

  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`[fidocs] dev server at http://localhost:${port}`);
      resolve({
        close: () => {
          close();
          server.close();
          for (const res of clients) res.end();
        },
      });
    });
  });
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
  return 'application/octet-stream';
}
