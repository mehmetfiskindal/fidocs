import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdown } from '../src/parsers/markdown.js';
import { renderHtml } from '../src/generators/html.js';
import { astToJsx } from '../src/generators/gea.js';

const html = (src) => renderHtml(parseMarkdown(src));
const jsx = (src) => astToJsx(parseMarkdown(src));

// --- Link safety -----------------------------------------------------------

test('neutralizes javascript: and other unsafe link schemes', () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'vbscript:x', 'data:text/html,x']) {
    const out = html(`[x](${url})`);
    assert.ok(!/href="\s*(javascript|vbscript|data):/i.test(out), `${url} -> ${out}`);
    assert.ok(out.includes('href="#"'), out);
  }
});

test('neutralizes unsafe schemes in the Gea output too', () => {
  assert.ok(!/javascript:/i.test(jsx('[x](javascript:alert(1))')));
});

test('keeps safe link schemes and relative urls', () => {
  for (const url of ['https://a.com', 'http://a.com', 'mailto:a@b.c', 'tel:123', '/abs', 'rel/page', '#anchor', '?q=1']) {
    assert.ok(html(`[x](${url})`).includes(`href="${url}"`), url);
  }
});

test('allows data:image urls for images only', () => {
  assert.ok(html('![a](data:image/png;base64,AAAA)').includes('src="data:image/png;base64,AAAA"'));
  assert.ok(html('![a](javascript:x)').includes('src="#"'));
});

test('supports balanced parentheses in link destinations', () => {
  const out = html('[wiki](https://en.wikipedia.org/wiki/Foo_(bar)) after');
  assert.ok(out.includes('href="https://en.wikipedia.org/wiki/Foo_(bar)"'), out);
  assert.ok(out.includes('</a> after'), out);
});

// --- Emphasis vs code spans --------------------------------------------------

test('emphasis does not reach into code spans', () => {
  assert.equal(html('a * b `code *x*` c'), '<p>a * b <code>code *x*</code> c</p>');
  assert.equal(html('*a `b*` c*'), '<p><em>a <code>b*</code> c</em></p>');
});

test('triple delimiters produce strong + em', () => {
  assert.equal(html('***both***'), '<p><strong><em>both</em></strong></p>');
  assert.equal(html('___both___'), '<p><strong><em>both</em></strong></p>');
});

test('emphasis delimiters must be flanking', () => {
  assert.equal(html('2 * 3 * 4'), '<p>2 * 3 * 4</p>');
  assert.equal(html('** not bold **'), '<p>** not bold **</p>');
});

test('em may contain strong', () => {
  assert.equal(html('*a **b** c*'), '<p><em>a <strong>b</strong> c</em></p>');
});

test('keeps intraword underscores literal', () => {
  assert.equal(html('snake_case_name'), '<p>snake_case_name</p>');
});

// --- Entities ------------------------------------------------------------------

test('decodes entity references instead of double escaping', () => {
  assert.equal(html('a &amp; b &lt;c&gt; &#169; &#x41;'), '<p>a &amp; b &lt;c&gt; © A</p>');
  assert.equal(html('`&amp;`'), '<p><code>&amp;amp;</code></p>');
});

// --- Fenced code -------------------------------------------------------------

test('a longer fence can contain a shorter one', () => {
  const ast = parseMarkdown('````md\n```\ninner\n```\n````\n\nafter');
  assert.equal(ast.children[0].type, 'code');
  assert.equal(ast.children[0].value, '```\ninner\n```');
  assert.equal(ast.children[1].type, 'paragraph');
});

test('closing fence must use the same character', () => {
  const ast = parseMarkdown('~~~\n```\n~~~');
  assert.equal(ast.children.length, 1);
  assert.equal(ast.children[0].value, '```');
});

test('fence info string keeps only the language', () => {
  const ast = parseMarkdown('```js title="a.js"\nx\n```');
  assert.equal(ast.children[0].lang, 'js');
  assert.equal(ast.children[0].value, 'x');
});

// --- Lists -------------------------------------------------------------------

test('ordered lists keep their start number', () => {
  assert.ok(html('3. x\n4. y').startsWith('<ol start="3">'));
  assert.ok(html('1. x').startsWith('<ol>'));
  assert.ok(jsx('3. x').includes('<ol start="3">'));
});

test('renders task list items', () => {
  const out = html('- [x] done\n- [ ] todo\n- plain');
  assert.ok(out.includes('<li class="task-list-item"><input type="checkbox" disabled checked> done</li>'), out);
  assert.ok(out.includes('<li class="task-list-item"><input type="checkbox" disabled> todo</li>'), out);
  assert.ok(out.includes('<li>plain</li>'), out);
  const g = jsx('- [x] done');
  assert.ok(g.includes('<input type="checkbox" disabled checked />'), g);
});

// --- Autolinks -----------------------------------------------------------------

test('renders autolinks', () => {
  assert.equal(html('<https://a.com/x>'), '<p><a href="https://a.com/x">https://a.com/x</a></p>');
  assert.equal(html('see <mailto:a@b.c> now'), '<p>see <a href="mailto:a@b.c">mailto:a@b.c</a> now</p>');
});

// --- Callouts ------------------------------------------------------------------

test('renders GitHub-style callouts', () => {
  const out = html('> [!WARNING]\n> Be careful');
  assert.equal(out, '<div class="callout callout-warning"><p class="callout-title">Warning</p>\n<p>Be careful</p></div>');
  assert.ok(jsx('> [!TIP]\n> x').includes('<div class="callout callout-tip">'));
});

test('unknown callout kinds stay plain blockquotes', () => {
  assert.ok(html('> [!FOO]\n> x').startsWith('<blockquote>'));
});
