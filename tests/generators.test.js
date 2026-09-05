import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHtml } from '../src/generators/html.js';
import { generateGeaPage, astToJsx } from '../src/generators/gea.js';
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
