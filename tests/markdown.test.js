import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, slugify } from '../src/parsers/markdown.js';

const types = (ast) => ast.children.map((n) => n.type);

test('parses headings with slugs', () => {
  const ast = parseMarkdown('# Hello World\n### Deep');
  assert.deepEqual(types(ast), ['heading', 'heading']);
  assert.equal(ast.children[0].level, 1);
  assert.equal(ast.children[0].id, 'hello-world');
  assert.equal(ast.children[1].level, 3);
});

test('parses fenced code with language', () => {
  const ast = parseMarkdown('```js\nconst x = 1;\n```');
  assert.equal(ast.children[0].type, 'code');
  assert.equal(ast.children[0].lang, 'js');
  assert.equal(ast.children[0].value, 'const x = 1;');
});

test('parses ordered and unordered lists', () => {
  const ast = parseMarkdown('- a\n- b');
  assert.equal(ast.children[0].type, 'list');
  assert.equal(ast.children[0].ordered, false);
  assert.equal(ast.children[0].children.length, 2);

  const ol = parseMarkdown('1. one\n2. two');
  assert.equal(ol.children[0].ordered, true);
});

test('parses nested lists', () => {
  const ast = parseMarkdown('- top\n  - inner');
  const outer = ast.children[0];
  assert.equal(outer.children[0].children.length, 2);
  assert.equal(outer.children[0].children[1].type, 'list');
});

test('parses tables', () => {
  const ast = parseMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
  assert.equal(ast.children[0].type, 'table');
  assert.equal(ast.children[0].header.length, 2);
  assert.equal(ast.children[0].rows.length, 1);
});

test('parses blockquotes and hr', () => {
  const ast = parseMarkdown('> quoted\n\n---');
  assert.equal(ast.children[0].type, 'blockquote');
  assert.equal(ast.children[1].type, 'hr');
});

test('parses inline emphasis, code, links', () => {
  const nodes = parseInline('**bold** *em* `code` [x](https://e.com)');
  assert.deepEqual(nodes.filter((n) => n.type !== 'text').map((n) => n.type),
    ['strong', 'em', 'codespan', 'link']);
});

test('parses images and expressions', () => {
  const nodes = parseInline('![alt](/img.png) and {count}');
  assert.equal(nodes.find((n) => n.type === 'image').url, '/img.png');
  assert.equal(nodes.find((n) => n.type === 'expression').value, 'count');
});

test('slugify handles unicode and symbols', () => {
  assert.equal(slugify('Merhaba, Dünya!'), 'merhaba-dünya');
  assert.equal(slugify('  spaced   out '), 'spaced-out');
});

test('handles RTL and non-latin text as plain text', () => {
  const ast = parseMarkdown('مرحبا بالعالم');
  assert.equal(ast.children[0].type, 'paragraph');
  assert.equal(ast.children[0].children[0].value, 'مرحبا بالعالم');
});
