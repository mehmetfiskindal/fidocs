import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../src/cli/index.js';

test('build accepts an absolute project path', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-cli-abs-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'fidocs.config.js'),
    "export default { format: 'html' };\n");
  await writeFile(path.join(root, 'docs', 'index.md'), '# Home\n');

  assert.equal(await main(['build', root]), 0);
  assert.ok(existsSync(path.join(root, 'dist', 'index.html')));
});

test('rejects an invalid --format without touching output', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-cli-format-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'fidocs.config.js'), 'export default {};\n');
  await writeFile(path.join(root, 'docs', 'index.md'), '# Home\n');
  await writeFile(path.join(root, 'dist', 'keep.txt'), 'keep');

  assert.equal(await main(['build', '--format', 'nope', root]), 1);
  assert.ok(existsSync(path.join(root, 'dist', 'keep.txt')));
});

test('rejects an invalid port', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-cli-port-'));
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'fidocs.config.js'), 'export default {};\n');
  await writeFile(path.join(root, 'docs', 'index.md'), '# Home\n');

  assert.equal(await main(['dev', '--port', 'abc', root]), 1);
});
