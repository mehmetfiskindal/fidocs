import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from '../src/core/engine.js';

async function makeProject() {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-e2e-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'fidocs.config.js'),
    "export default { format: 'both', title: 'E2E' };\n");
  await writeFile(path.join(root, 'docs', 'index.md'),
    '---\ntitle: Home\norder: 1\n---\n\n# Home\n\nHello **world**.\n');
  await writeFile(path.join(root, 'docs', 'guide.mdx'),
    "---\ntitle: Guide\norder: 2\n---\n\nimport Demo from './components/Demo.jsx'\n\n<Demo x={1} />\n");
  await mkdir(path.join(root, 'docs', 'components'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'components', 'Demo.jsx'),
    'export default function Demo() { return null }\n');
  return root;
}

test('end-to-end build emits html and gea', async () => {
  const root = await makeProject();
  const { pages, written } = await build(root);

  assert.equal(pages.length, 2);
  assert.equal(pages[0].slug, 'index');

  const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /<h1 id="home">Home<\/h1>/);
  assert.match(html, /<strong>world<\/strong>/);
  assert.match(html, /<title>Home — E2E<\/title>/);

  const guideHtml = await readFile(path.join(root, 'dist', 'guide.html'), 'utf8');
  assert.match(guideHtml, /data-component="Demo"/);

  const jsx = await readFile(path.join(root, 'dist', 'gea-app', 'Guide.jsx'), 'utf8');
  assert.match(jsx, /import Demo from '\.\/components\/Demo\.jsx'/);
  assert.match(jsx, /<Demo x=\{1\} \/>/);

  assert.ok(written.some((f) => f.endsWith('components/Demo.jsx')), 'local component copied');
});

test('respects format: html only', async () => {
  const root = await makeProject();
  await writeFile(path.join(root, 'fidocs.config.js'), "export default { format: 'html' };\n");
  const { written } = await build(root);
  assert.ok(written.every((f) => f.endsWith('.html')));
});

test('honors FIDOCS_FORMAT env override', async () => {
  const root = await makeProject();
  process.env.FIDOCS_FORMAT = 'gea';
  const { written } = await build(root);
  delete process.env.FIDOCS_FORMAT;
  assert.ok(written.some((f) => f.endsWith('App.jsx')));
  assert.ok(!written.some((f) => f.endsWith('.html') && !f.includes('gea-app')));
});

test('emits a landing index.html when no index.md exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-noindex-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'fidocs.config.js'),
    "export default { format: 'both', title: 'NoIndex' };\n");
  await writeFile(path.join(root, 'docs', 'guide.md'),
    '---\ntitle: Guide\n---\n\n# Guide\n');

  const { written } = await build(root);
  const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(html, /Guide/);
  assert.match(html, /guide\.html/);
  assert.ok(written.some((f) => f.endsWith('index.html')));

  const routes = await readFile(path.join(root, 'dist', 'gea-app', 'routes.js'), 'utf8');
  assert.match(routes, /path: '\/'/);
});
