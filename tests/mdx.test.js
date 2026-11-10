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

test('walk visits table cell contents', () => {
  const { ast } = parseMdx('| head | other |\n| --- | --- |\n| **bold** | text |');
  const texts = [];
  walk(ast, (node) => {
    if (node.type === 'text') texts.push(node.value);
  });
  assert.deepEqual(texts.sort(), ['bold', 'head', 'other', 'text']);
});

test('extracts side-effect and namespace imports', () => {
  const { imports } = parseMdx(
    "import './style.css'\nimport * as utils from './utils.js'\n\n# T",
  );
  assert.deepEqual(imports[0], {
    default: null, named: [], namespace: null, sideEffect: true, source: './style.css',
  });
  assert.equal(imports[1].namespace, 'utils');
  assert.equal(imports[1].source, './utils.js');
});

test('parses hyphenated props and balanced expressions', () => {
  const { ast } = parseMdx('<Foo data-id="x" values={{ a: 1 }} />');
  assert.deepEqual(ast.children[0].props, [
    { name: 'data-id', value: 'x' },
    { name: 'values', value: { expr: '{ a: 1 }' } },
  ]);
});

test('supports comparison operators inside prop expressions', () => {
  const { ast } = parseMdx('<Foo cond={a > b} />');
  assert.deepEqual(ast.children[0].props, [{ name: 'cond', value: { expr: 'a > b' } }]);
});

test('keeps spread props in the AST', () => {
  const { ast } = parseMdx('<Foo {...props} bar="x" />');
  assert.deepEqual(ast.children[0].props, [
    { name: '...', value: { expr: 'props' } },
    { name: 'bar', value: 'x' },
  ]);
});
