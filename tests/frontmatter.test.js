import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter } from '../src/parsers/frontmatter.js';

test('returns content unchanged when no frontmatter', () => {
  const { data, content } = parseFrontmatter('# Hello\n');
  assert.deepEqual(data, {});
  assert.equal(content, '# Hello\n');
});

test('parses scalars, booleans, numbers, quoted strings', () => {
  const { data, content } = parseFrontmatter('---\ntitle: Hi\norder: 3\ndraft: false\ntags: "a b"\n---\n# Body');
  assert.equal(data.title, 'Hi');
  assert.equal(data.order, 3);
  assert.equal(data.draft, false);
  assert.equal(data.tags, 'a b');
  assert.equal(content, '# Body');
});

test('parses inline arrays and dash lists', () => {
  const { data } = parseFrontmatter('---\ninline: [a, b, 3]\nlist:\n  - x\n  - y\n---\n');
  assert.deepEqual(data.inline, ['a', 'b', 3]);
  assert.deepEqual(data.list, ['x', 'y']);
});

test('parses nested maps', () => {
  const { data } = parseFrontmatter('---\nmeta:\n  author: mehmet\n  year: 2026\n---\n');
  assert.deepEqual(data.meta, { author: 'mehmet', year: 2026 });
});
