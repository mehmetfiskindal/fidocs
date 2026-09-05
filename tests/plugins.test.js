import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHookRunner } from '../src/plugins/hooks.js';
import { loadPlugins } from '../src/plugins/loader.js';

test('runs transform hooks in sequence', async () => {
  const plugins = [
    { name: 'a', hooks: { beforeGenerate: (v) => v + 1 } },
    { name: 'b', hooks: { beforeGenerate: (v) => v * 2 } },
  ];
  const runner = createHookRunner(plugins);
  assert.equal(await runner.run('beforeGenerate', 5), 12);
});

test('skips plugins without the hook', async () => {
  const runner = createHookRunner([{ name: 'x', hooks: {} }]);
  assert.equal(await runner.run('afterParse', 'keep'), 'keep');
});

test('rejects unknown hooks', () => {
  assert.throws(() => createHookRunner([{ name: 'bad', hooks: { nope() {} } }]),
    /unknown hook/);
});

test('loads inline plugin objects as-is', async () => {
  const plugins = await loadPlugins(process.cwd(), [{ name: 'inline' }]);
  assert.equal(plugins[0].name, 'inline');
});

test('loads plugin from a path', async () => {
  const plugins = await loadPlugins(process.cwd(), ['./examples/gea-docs/plugins/wordcount.js']);
  assert.equal(plugins[0].name, 'wordcount');
});

test('wraps load errors with plugin name', async () => {
  await assert.rejects(() => loadPlugins(process.cwd(), ['./nope-missing.js']),
    /Failed to load plugin/);
});
