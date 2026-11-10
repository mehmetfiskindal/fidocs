import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/generators/html.js';
import { generateGeaPage, astToJsx, componentNameFromSlug } from '../src/generators/gea.js';
import { renderTemplate, escapeHtml } from '../src/generators/templates.js';
import { parseMarkdown } from '../src/parsers/markdown.js';
import { parseMdx } from '../src/parsers/mdx.js';

const ast = (src) => parseMarkdown(src);

test('renders headings with ids and inline markup', () => {
  const html = renderHtml(ast('# Hi *there*'));
  assert.match(html, /<h1 id="hi-there">Hi <em>there<\/em><\/h1>/);
});

test('escapes html in text and code', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  const html = renderHtml(ast('```\n<script>x</script>\n```'));
  assert.match(html, /&lt;script&gt;/);
  assert.ok(!html.includes('<script>'));
});

test('renders lists, tables, blockquotes', () => {
  assert.match(renderHtml(ast('- a\n- b')), /<ul><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(renderHtml(ast('| h |\n| --- |\n| v |')), /<table>.*<th>h<\/th>.*<td>v<\/td>.*<\/table>/s);
  assert.match(renderHtml(ast('> q')), /<blockquote>/);
});

test('components become placeholders without a resolver', () => {
  const { ast: a } = parseMdx('<Counter start={5} />');
  const html = renderHtml(a);
  assert.match(html, /data-component="Counter"/);
});

test('components use a resolver when provided', () => {
  const { ast: a } = parseMdx('<Counter start={5}>body</Counter>');
  const html = renderHtml(a, {
    resolveComponent: (name, props, children) => `<b>${name}:${children}</b>`,
  });
  assert.equal(html, '<b>Counter:<p>body</p></b>');
});

test('gea output embeds components and expressions', () => {
  const { ast: a, imports } = parseMdx("import C from './c.jsx'\n\n<Counter start={5} />\n\n{count}");
  const jsx = astToJsx(a);
  assert.match(jsx, /<Counter start=\{5\} \/>/);
  assert.match(jsx, /\{count\}/);
});

test('generateGeaPage produces valid component with imports', () => {
  const { ast: a, imports, data } = parseMdx("import C from './c.jsx'\n\n# T\n\n<C />");
  const { filename, code } = generateGeaPage({ slug: 'getting-started', imports, ast: a, data });
  assert.equal(filename, 'GettingStarted.jsx');
  assert.match(code, /class GettingStarted extends Component/);
  assert.match(code, /import C from '\.\/c\.jsx'/);
});

test('template engine substitutes variables and blanks missing', () => {
  assert.equal(renderTemplate('Hi {{name}}!', { name: 'Fidocs' }), 'Hi Fidocs!');
  assert.equal(renderTemplate('{{missing}}', {}), '');
});

test('renders inline components in HTML', () => {
  const { ast: a } = parseMdx('Use <Counter start={5}>hi</Counter> here.');
  const html = renderHtml(a, {
    resolveComponent: (name, props, children) => `<b>${name}:${children}</b>`,
  });
  assert.equal(html, '<p>Use <b>Counter:hi</b> here.</p>');
});

test('escapes JSX text that would be parsed as syntax', () => {
  const jsx = astToJsx(parseMdx('a < b and x > y').ast);
  assert.equal(jsx, '<p>{"a < b and x > y"}</p>');
});

test('escapes quotes in component string attributes', () => {
  const { ast: a } = parseMdx('<Foo label=\'He said "hi"\' />');
  const jsx = astToJsx(a);
  assert.match(jsx, /label=\{"He said \\"hi\\""\}/);
});

test('derives safe component names from nested and numeric slugs', () => {
  assert.equal(componentNameFromSlug('guide/intro'), 'GuideIntro');
  assert.equal(componentNameFromSlug('404'), 'Page404');
  assert.equal(componentNameFromSlug('foo.bar'), 'FooBar');
  assert.equal(componentNameFromSlug('!!!'), 'Page');

  const { ast: a } = parseMdx('# T');
  assert.equal(generateGeaPage({ slug: 'guide/intro', imports: [], ast: a, data: {} }).filename,
    'GuideIntro.jsx');
  assert.match(generateGeaPage({ slug: '404', imports: [], ast: a, data: {} }).code,
    /class Page404 extends Component/);
});

test('honors a custom JSX import source', () => {
  const { ast: a } = parseMdx('# T');
  const { code } = generateGeaPage({ slug: 'x', imports: [], ast: a, data: {} },
    { jsxImportSource: '@custom/core' });
  assert.match(code, /from '@custom\/core'/);
});
