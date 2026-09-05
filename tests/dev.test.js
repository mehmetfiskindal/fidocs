import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { startDevServer } from '../src/core/dev.js';

async function freePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

test('dev server serves / as index.html and extensionless paths as .html', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-dev-'));
  await writeFile(path.join(root, 'fidocs.config.js'),
    "export default { output: 'dist' };\n");
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'index.html'),
    '<html><body>home-page</body></html>\n');
  await writeFile(path.join(root, 'dist', 'guide.html'),
    '<html><body>guide-page</body></html>\n');

  const port = await freePort();
  const server = await startDevServer({
    root,
    rebuild: async () => ({ written: [] }),
    port,
  });

  try {
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /home-page/);

    const pretty = await fetch(`http://127.0.0.1:${port}/guide`);
    assert.equal(pretty.status, 200);
    assert.match(await pretty.text(), /guide-page/);
  } finally {
    server.close();
  }
});

test('live reload handshake is not a default SSE message event', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-sse-'));
  await writeFile(path.join(root, 'fidocs.config.js'),
    "export default { output: 'dist' };\n");
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'index.html'),
    '<html><body>home</body></html>\n');

  const port = await freePort();
  const server = await startDevServer({
    root,
    rebuild: async () => ({ written: [] }),
    port,
  });

  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    assert.match(html, /EventSource\('\/__fidocs\/events'\)/);
    assert.doesNotMatch(html, /addEventListener\('message'/);
    assert.match(html, /addEventListener\('reload'/);

    const handshake = await readFirstSseEvent(port);
    assert.match(handshake, /event:\s*connected/);
    assert.doesNotMatch(handshake, /^data:/);
  } finally {
    server.close();
  }
});

function readFirstSseEvent(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/__fidocs/events`, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        if (buf.includes('\n\n')) {
          req.destroy();
          resolve(buf);
        }
      });
    });
    req.on('error', reject);
    setTimeout(() => {
      req.destroy();
      reject(new Error('SSE handshake timed out'));
    }, 2000);
  });
}
