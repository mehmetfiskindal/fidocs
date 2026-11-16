import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseMarkdown } from '../src/parsers/markdown.js';
import { renderToc } from '../src/generators/html.js';
import { build } from '../src/core/engine.js';

// --- renderToc ---------------------------------------------------------------

test('renderToc lists h2 and nests h3 under the previous h2', () => {
  const ast = parseMarkdown('# Title\n\n## Install\n\n### npm\n\n### yarn\n\n## Usage');
  assert.equal(
    renderToc(ast),
    '<aside class="page-toc"><h2>On this page</h2><ul>' +
      '<li><a href="#install">Install</a><ul>' +
        '<li><a href="#npm">npm</a></li><li><a href="#yarn">yarn</a></li>' +
      '</ul></li>' +
      '<li><a href="#usage">Usage</a></li>' +
    '</ul></aside>',
  );
});

test('renderToc uses plain heading text and escapes it', () => {
  const ast = parseMarkdown('## The `<Foo>` **API**\n\n## Second');
  const toc = renderToc(ast);
  assert.ok(toc.includes('<a href="#the-foo-api">The &lt;Foo&gt; API</a>'), toc);
});

test('renderToc returns empty string for fewer than two entries', () => {
  assert.equal(renderToc(parseMarkdown('# Only title\n\n## One')), '');
  assert.equal(renderToc(parseMarkdown('# Only title')), '');
});

test('renderToc keeps an h3 that comes before any h2 at the top level', () => {
  const toc = renderToc(parseMarkdown('### Early\n\n## Later'));
  assert.ok(toc.includes('<ul><li><a href="#early">Early</a></li><li><a href="#later">Later</a></li></ul>'), toc);
});

// --- Built pages ---------------------------------------------------------------

async function makeProject(pageExtra = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-toc-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'fidocs.config.js'), "export default { format: 'html', title: 'T' };\n");
  await writeFile(path.join(root, 'docs', 'index.md'), '---\ntitle: Home\norder: 1\n---\n\n# Home\n');
  await writeFile(path.join(root, 'docs', 'guide.md'),
    `---\ntitle: Guide\norder: 2\n${pageExtra}---\n\n# Guide\n\n## Alpha\n\n## Beta\n`);
  return root;
}

test('built page includes the on-page TOC', async () => {
  const root = await makeProject();
  await build(root);
  const html = await readFile(path.join(root, 'dist', 'guide.html'), 'utf8');
  assert.match(html, /<aside class="page-toc">/);
  assert.match(html, /<a href="#alpha">Alpha<\/a>/);
});

test('frontmatter toc: false hides the TOC', async () => {
  const root = await makeProject('toc: false\n');
  await build(root);
  const html = await readFile(path.join(root, 'dist', 'guide.html'), 'utf8');
  assert.doesNotMatch(html, /page-toc"/);
});

test('sidebar marks the current page as active', async () => {
  const root = await makeProject();
  await build(root);
  const guide = await readFile(path.join(root, 'dist', 'guide.html'), 'utf8');
  assert.match(guide, /<a href="\/guide\.html" class="active" aria-current="page">Guide<\/a>/);
  assert.match(guide, /<a href="\/">Home<\/a>/);
});

test('built page supports dark mode with a toggle', async () => {
  const root = await makeProject();
  await build(root);
  const html = await readFile(path.join(root, 'dist', 'guide.html'), 'utf8');
  assert.match(html, /@media \(prefers-color-scheme: ?dark\)/);
  assert.match(html, /\[data-theme="?dark"?\]/);
  assert.match(html, /<button[^>]*class="theme-toggle"/);
  assert.match(html, /localStorage/);
});
