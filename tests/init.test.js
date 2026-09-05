import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { runInit, runCreate } from '../src/cli/init.js';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('runInit scaffolds a runnable docs project', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-init-'));
  await runInit(root);

  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const { version } = JSON.parse(await readFile(path.join(REPO, 'create-fidocs', 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.dev, 'fidocs dev');
  assert.equal(pkg.scripts.build, 'fidocs build');
  assert.equal(pkg.dependencies.fidocs, `^${version}`);

  const config = await readFile(path.join(root, 'fidocs.config.js'), 'utf8');
  assert.match(config, /export default/);
  assert.match(config, /input:\s*'docs'/);

  const index = await readFile(path.join(root, 'docs', 'index.md'), 'utf8');
  assert.match(index, /Welcome to Fidocs/);

  const ignore = await readFile(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /node_modules/);
  assert.match(ignore, /dist/);
});

test('runInit does not overwrite existing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fidocs-init-keep-'));
  await writeFile(path.join(root, 'package.json'), '{"name":"keep"}\n');
  await writeFile(path.join(root, 'fidocs.config.js'), 'export default { title: "Keep" };\n');
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', 'index.md'), '# Keep\n');
  await writeFile(path.join(root, '.gitignore'), 'custom\n');

  await runInit(root);

  assert.equal(await readFile(path.join(root, 'package.json'), 'utf8'), '{"name":"keep"}\n');
  assert.match(await readFile(path.join(root, 'fidocs.config.js'), 'utf8'), /Keep/);
  assert.equal(await readFile(path.join(root, 'docs', 'index.md'), 'utf8'), '# Keep\n');
  assert.equal(await readFile(path.join(root, '.gitignore'), 'utf8'), 'custom\n');
});

test('runCreate uses the first positional arg as the project directory', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'fidocs-create-'));
  const cwd = process.cwd();
  process.chdir(parent);
  try {
    const code = await runCreate(['site']);
    assert.equal(code, 0);
    assert.ok(existsSync(path.join(parent, 'site', 'fidocs.config.js')));
    const pkg = JSON.parse(await readFile(path.join(parent, 'site', 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'site');
  } finally {
    process.chdir(cwd);
  }
});

test('runCreate asks for a project name and scaffolds that folder', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'fidocs-create-ask-'));
  const cwd = process.cwd();
  process.chdir(parent);
  const input = Readable.from(['docs-site\n']);
  const output = new Writable({ write(_c, _e, cb) { cb(); } });
  try {
    const code = await runCreate([], { input, output });
    assert.equal(code, 0);
    assert.ok(existsSync(path.join(parent, 'docs-site', 'fidocs.config.js')));
    const pkg = JSON.parse(await readFile(path.join(parent, 'docs-site', 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'docs-site');
  } finally {
    process.chdir(cwd);
  }
});
