import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMdx, walk } from '../src/parsers/mdx.js';

test('extracts default and named imports', () => {
  const { imports } = parseMdx("import A from './a.jsx'\nimport { B, C } from 'x'\n\n# T");
  assert.equal(imports[0].default, 'A');
  assert.equal(imports[1].named.join(','), 'B,C');
  assert.equal(imports[1].source, 'x');
});

test('parses self-closing components with props', () => {
  const { components } = parseMdx('<Counter start={10} label="hi" />');
  assert.deepEqual(components, ['Counter']);
});

test('parses component blocks with children', () => {
  const { ast } = parseMdx('<Callout type="tip">\nSome **content** here.\n</Callout>');
  const comp = ast.children.find((n) => n.type === 'component');
  assert.equal(comp.name, 'Callout');
  assert.equal(comp.props[0].name, 'type');
  assert.equal(comp.props[0].value, 'tip');
  assert.ok(comp.children.length > 0);
});

test('distinguishes lowercase html from components', () => {
  const { ast } = parseMdx('<div>raw html</div>');
  assert.equal(ast.children[0].type, 'html');
});

test('walk visits every node', () => {
  const { ast } = parseMdx('# H\n\n- a\n- b');
  let count = 0;
  walk(ast, () => count++);
  assert.ok(count >= 4);
});
