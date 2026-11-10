import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown, parseInline, slugify } from '../src/parsers/markdown.js';
import { parseMdx } from '../src/parsers/mdx.js';

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

test('keeps indented continuation lines inside a list item', () => {
  const ast = parseMarkdown('- first\n  continued\n- second');
  assert.equal(ast.children.length, 1);
  const items = ast.children[0].children;
  assert.equal(items.length, 2);
  const firstParagraph = items[0].children[0];
  assert.equal(firstParagraph.children.map((n) => n.value).join(''), 'first\ncontinued');
});

test('keeps text on a component opening line and after its closing tag', () => {
  const { ast } = parseMdx('<Callout>Hello\nworld\n</Callout> after');
  assert.equal(ast.children.length, 2);
  assert.equal(ast.children[0].type, 'component');
  assert.equal(ast.children[0].children[0].children[0].value, 'Hello\nworld');
  assert.equal(ast.children[1].type, 'paragraph');
  assert.equal(ast.children[1].children[0].value, 'after');
});

test('void and same-line tags do not swallow following content', () => {
  const { ast } = parseMdx('<Callout>\nhello\n<br>\nworld\n</Callout>\n\nafter');
  assert.deepEqual(ast.children.map((n) => n.type), ['component', 'paragraph']);
  assert.equal(ast.children[1].children[0].value, 'after');

  const sameLine = parseMdx('<Callout>\n<Bar>text</Bar>\n</Callout>\n\nafter');
  assert.deepEqual(sameLine.ast.children.map((n) => n.type), ['component', 'paragraph']);
});

test('unclosed components do not swallow the rest of the document', () => {
  const { ast } = parseMdx('<Callout>\nHello\n\nafter');
  assert.deepEqual(ast.children.map((n) => n.type), ['component', 'paragraph', 'paragraph']);
  assert.equal(ast.children[1].children[0].value, 'Hello');
  assert.equal(ast.children[2].children[0].value, 'after');
});

test('parses inline components', () => {
  const { ast, components } = parseMdx('Use <Counter start={5} /> and <Badge>hi</Badge>.');
  assert.deepEqual(components, ['Counter', 'Badge']);
  const paragraph = ast.children[0];
  assert.deepEqual(paragraph.children.map((n) => n.type),
    ['text', 'component', 'text', 'component', 'text']);
  assert.equal(paragraph.children[1].inline, true);
  assert.deepEqual(paragraph.children[1].props, [{ name: 'start', value: { expr: '5' } }]);
  assert.equal(paragraph.children[3].children[0].value, 'hi');
});

test('strips closing hashes from headings', () => {
  const ast = parseMarkdown('## Title ##');
  assert.equal(ast.children[0].children[0].value, 'Title');
  assert.equal(ast.children[0].id, 'title');
});

test('blockquote lazy continuation does not absorb a list', () => {
  const ast = parseMarkdown('> quote\ncontinued\n- item');
  assert.deepEqual(ast.children.map((n) => n.type), ['blockquote', 'list']);
});

test('splits table cells on unescaped pipes only', () => {
  const table = parseMarkdown('| a | b |\n| --- | --- |\n| `x|y` | z |').children[0];
  assert.equal(table.rows[0].length, 2);
  assert.equal(table.rows[0][0][0].value, 'x|y');
});

test('does not treat a mismatched delimiter row as a table', () => {
  const ast = parseMarkdown('a | b\n---');
  assert.deepEqual(ast.children.map((n) => n.type), ['paragraph', 'hr']);
});

test('gives duplicate headings unique ids', () => {
  const ids = parseMarkdown('# Intro\n# Intro\n# Intro').children.map((n) => n.id);
  assert.deepEqual(ids, ['intro', 'intro-1', 'intro-2']);
});
