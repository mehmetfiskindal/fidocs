/**
 * Zero-dependency Markdown parser producing a block/inline AST.
 * Covers a CommonMark subset: headings, paragraphs, fenced code,
 * lists (nested), blockquotes, tables, hr, raw html and inline markup.
 */

const RE = {
  // Opening fence; backtick info strings may not contain backticks.
  fence: /^(?:(`{3,})\s*([^`]*)|(~{3,})\s*(.*))$/,
  heading: /^(#{1,6})\s+(.*)$/,
  hr: /^ {0,3}([-*_])( *\1){2,} *$/,
  quote: /^ {0,3}>\s?(.*)$/,
  ulItem: /^(\s*)([-*+])\s+(.*)$/,
  olItem: /^(\s*)(\d+)[.)]\s+(.*)$/,
  tableRow: /^.*\|.*$/,
  tableDelim: /^[\s|:-]+$/,
  import: /^import\s+.+$/,
  tagStart: /^<(\/?)([A-Za-z][\w.-]*)([^>]*)>/,
};

// Opening JSX/HTML tag. Quoted attribute values may contain ">".
const RE_TAG = /^<([A-Za-z][\w.-]*)((?:\s+(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^>"'])*)?)\s*(\/?)>/;

// Inline MDX expression: {identifier}, {a.b}, {x: 1}, etc. Built via
// new RegExp to keep the pattern robust.
const RE_EXPR = new RegExp('^\\{([^{}]+)\\}');

// GitHub-style alert marker on the first line of a blockquote.
const RE_CALLOUT = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i;

// Task list marker at the start of a list item.
const RE_TASK = /^\[([ xX])\]\s+/;

// Autolink: <scheme:...> with no spaces or angle brackets.
const RE_AUTOLINK = /^<((?:https?|mailto|tel):[^\s<>]+)>/i;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®',
  trade: '™', hellip: '…', mdash: '—', ndash: '–', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  laquo: '«', raquo: '»', middot: '·', times: '×', deg: '°',
};
const RE_ENTITY = /^&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]{1,31}));/;

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * Neutralize URLs with script-capable schemes (javascript:, vbscript:,
 * data: etc.). Relative URLs, fragments and http(s)/mailto/tel pass through;
 * images may additionally use data:image/*.
 * @param {string} url
 * @param {{ image?: boolean }} [opts]
 * @returns {string}
 */
export function sanitizeUrl(url, opts = {}) {
  // Browsers ignore control characters and whitespace inside the scheme.
  const probe = String(url).replace(/[\u0000- \u007f]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe);
  if (!scheme) return url;
  if (SAFE_SCHEMES.has(scheme[1])) return url;
  if (opts.image && /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/.test(probe)) return url;
  return '#';
}

const INLINE_HTML_TAGS = new Set([
  'br', 'kbd', 'mark', 'sup', 'sub', 'abbr', 'span', 'b', 'i', 'u', 'small', 'code', 'pre',
]);
const VOID_HTML_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param',
  'source', 'track', 'wbr',
]);

/**
 * Parse markdown source into a block AST.
 * @param {string} src
 * @returns {{ type: 'root', children: object[] }}
 */
export function parseMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const ast = { type: 'root', children: parseBlocks(lines) };
  makeHeadingIdsUnique(ast, new Map());
  return ast;
}

/**
 * Suffix duplicate heading ids so anchors do not collide.
 * @param {object} node
 * @param {Map<string, number>} used
 */
function makeHeadingIdsUnique(node, used) {
  if (Array.isArray(node)) {
    for (const child of node) makeHeadingIdsUnique(child, used);
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (node.type === 'heading') {
    const base = node.id || 'section';
    const count = used.get(base) || 0;
    node.id = count === 0 ? base : `${base}-${count}`;
    used.set(base, count + 1);
  }

  if (Array.isArray(node.children)) makeHeadingIdsUnique(node.children, used);
}

function parseBlocks(lines) {
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Fenced code
    const fence = RE.fence.exec(line.trim());
    if (fence) {
      const opener = fence[1] || fence[3];
      const info = (fence[2] ?? fence[4] ?? '').trim();
      const lang = info.split(/\s+/)[0] || null;
      // Closing fence: same character, at least as long, nothing else.
      const closeRe = new RegExp(`^${opener[0] === '`' ? '`' : '~'}{${opener.length},}\\s*$`);
      const body = [];
      i++;
      while (i < lines.length && !closeRe.test(lines[i].trim())) {
        body.push(lines[i]); i++;
      }
      i++;
      blocks.push({ type: 'code', lang, value: body.join('\n') });
      continue;
    }

    // Heading
    const heading = RE.heading.exec(line);
    if (heading) {
      const text = heading[2].trim().replace(/\s+#+\s*$/, '').trim();
      blocks.push({
        type: 'heading',
        level: heading[1].length,
        children: parseInline(text),
        id: slugify(text),
      });
      i++;
      continue;
    }

    // HR
    if (RE.hr.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    // Import (mdx)
    if (RE.import.test(line.trim())) {
      blocks.push({ type: 'import', value: line.trim() });
      i++;
      continue;
    }

    // Raw tag line (html element or PascalCase component)
    if (RE.tagStart.test(line.trim())) {
      const { nodes, consumed } = parseTagBlock(lines, i);
      blocks.push(...nodes);
      i += consumed;
      continue;
    }

    // Blockquote
    if (RE.quote.test(line)) {
      const body = [];
      while (i < lines.length) {
        const current = lines[i];
        const quoted = RE.quote.exec(current);
        if (quoted) {
          body.push(quoted[1]);
          i++;
          continue;
        }
        // Lazy continuation: plain paragraph text only. Lists, headings,
        // fences, tags, imports etc. end the quote.
        if (!current.trim() || !body.length || isBlockStart(current)) break;
        body.push(current);
        i++;
      }
      const callout = RE_CALLOUT.exec(body[0] || '');
      if (callout) {
        blocks.push({ type: 'callout', kind: callout[1].toLowerCase(), children: parseBlocks(body.slice(1)) });
      } else {
        blocks.push({ type: 'blockquote', children: parseBlocks(body) });
      }
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length &&
        RE.tableDelim.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitRow(line);
      const delimiter = splitRow(lines[i + 1]);
      if (delimiter.length === header.length && isTableDelimiterRow(delimiter)) {
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
          rows.push(splitRow(lines[i])); i++;
        }
        blocks.push({
          type: 'table',
          header: header.map((c) => parseInline(c)),
          rows: rows.map((r) => r.map((c) => parseInline(c))),
        });
        continue;
      }
    }

    // List
    if (RE.ulItem.test(line) || RE.olItem.test(line)) {
      const { node, consumed } = parseList(lines, i);
      blocks.push(node);
      i += consumed;
      continue;
    }

    // Paragraph
    const para = [];
    while (i < lines.length && lines[i].trim() &&
           !RE.heading.test(lines[i]) && !RE.fence.test(lines[i].trim()) &&
           !RE.hr.test(lines[i]) && !RE.quote.test(lines[i]) &&
           !RE.ulItem.test(lines[i]) && !RE.olItem.test(lines[i]) &&
           !RE.tagStart.test(lines[i].trim()) && !RE.import.test(lines[i].trim())) {
      para.push(lines[i]); i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(para.join('\n')) });
  }

  return blocks;
}

function isBlockStart(line) {
  return RE.heading.test(line) ||
    RE.fence.test(line.trim()) ||
    RE.hr.test(line) ||
    RE.ulItem.test(line) ||
    RE.olItem.test(line) ||
    RE.tagStart.test(line.trim()) ||
    RE.import.test(line.trim());
}

function isListLine(line) {
  return RE.ulItem.test(line) || RE.olItem.test(line);
}

function parseList(lines, start) {
  const first = RE.ulItem.exec(lines[start]) || RE.olItem.exec(lines[start]);
  const ordered = /^\s*\d/.test(lines[start]);
  const startNum = ordered ? Number.parseInt(first[2], 10) : null;
  const baseIndent = first[1].length;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      if (i + 1 < lines.length && isListLine(lines[i + 1])) { i++; continue; }
      break;
    }
    const m = RE.ulItem.exec(line) || RE.olItem.exec(line);
    if (!m) {
      const indent = line.length - line.trimStart().length;
      // Continuation text must be indented past the list marker.
      if (items.length && indent > baseIndent) {
        items[items.length - 1].lines.push(line.trim());
        i++;
        continue;
      }
      break;
    }
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      const { node, consumed } = parseList(lines, i);
      const last = items[items.length - 1];
      if (last) last.children.push(node);
      i += consumed;
      continue;
    }
    items.push({ text: m[3], lines: [], children: [] });
    i++;
  }

  const children = items.map((it) => {
    let own = [it.text, ...it.lines].join('\n');
    const task = RE_TASK.exec(own);
    if (task) own = own.slice(task[0].length);
    const node = { type: 'listItem', children: [{ type: 'paragraph', children: parseInline(own) }, ...it.children] };
    if (task) node.checked = task[1] !== ' ';
    return node;
  });

  const node = { type: 'list', ordered, spread: false, children };
  if (ordered) node.start = startNum;
  return { node, consumed: i - start };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a block-level JSX/HTML tag, including content on the opening line.
 * Returns one or more blocks so trailing text after the closing tag is not
 * folded into the component.
 */
function parseTagBlock(lines, start) {
  const trimmed = lines[start].trim();

  if (trimmed.startsWith('</')) {
    return { nodes: [{ type: 'html', value: trimmed }], consumed: 1 };
  }

  const match = RE_TAG.exec(trimmed);
  if (!match) {
    // e.g. an autolink such as <https://example.com> or a malformed tag.
    return { nodes: [{ type: 'paragraph', children: parseInline(trimmed) }], consumed: 1 };
  }

  const [, name, attrs = ''] = match;
  const full = match[0];
  const isComponent = /^[A-Z]/.test(name);
  const selfClosing = full.endsWith('/>');
  const trailingFirst = trimmed.slice(full.length);

  const emptyNode = () => (isComponent
    ? { type: 'component', name, props: parseProps(attrs), children: [] }
    : { type: 'html', value: full });

  const appendTrailing = (node, trailing) => (trailing.trim()
    ? [node, ...parseBlocks([trailing.trim()])]
    : [node]);

  if (selfClosing) {
    return { nodes: appendTrailing(emptyNode(), trailingFirst), consumed: 1 };
  }

  let depth = 1;
  let closeLine = -1;
  let trailing = '';
  const innerParts = [];
  const closeRe = new RegExp(`</?${escapeRegExp(name)}\\b(?:"[^"]*"|'[^']*'|\\{[^}]*\\}|[^>"'])*>`, 'g');

  for (let lineIdx = start; lineIdx < lines.length; lineIdx++) {
    const text = lineIdx === start ? trimmed.slice(full.length) : lines[lineIdx];
    closeRe.lastIndex = 0;
    let last = 0;
    let tag;
    while ((tag = closeRe.exec(text))) {
      const token = tag[0];
      const before = text.slice(last, tag.index);

      if (token.startsWith('</')) {
        if (depth === 1) {
          innerParts.push(before);
          closeLine = lineIdx;
          trailing = text.slice(tag.index + token.length);
          break;
        }
        depth--;
        innerParts.push(before + token);
      } else {
        if (!token.endsWith('/>')) depth++;
        innerParts.push(before + token);
      }
      last = tag.index + token.length;
    }

    if (closeLine !== -1) break;
    innerParts.push(text.slice(last));
    if (lineIdx + 1 < lines.length) innerParts.push('\n');
  }

  if (closeLine === -1) {
    // Unclosed tag: keep the tag itself and leave the following text alone
    // instead of swallowing the rest of the document.
    return { nodes: appendTrailing(emptyNode(), trailingFirst), consumed: 1 };
  }

  let node;
  if (isComponent) {
    node = {
      type: 'component',
      name,
      props: parseProps(attrs),
      children: parseBlocks(innerParts.join('').split('\n')),
    };
  } else {
    const raw = lines.slice(start, closeLine + 1).join('\n');
    node = { type: 'html', value: trailing ? raw.slice(0, raw.length - trailing.length) : raw };
  }

  return {
    nodes: appendTrailing(node, trailing),
    consumed: closeLine - start + 1,
  };
}

/**
 * Parse JSX-style attributes. Handles hyphenated names, quoted values and
 * balanced {expressions} (including nested braces and quotes).
 * @param {string} attrStr
 */
function parseProps(attrStr) {
  const props = [];
  const src = attrStr || '';
  let i = 0;

  const isSpace = (c) => /\s/.test(c);

  while (i < src.length) {
    while (i < src.length && (isSpace(src[i]) || src[i] === '/')) i++;
    if (i >= src.length) break;

    if (src.startsWith('...', i)) {
      i += 3;
      while (i < src.length && isSpace(src[i])) i++;
      if (src[i] === '{') {
        const start = i;
        let depth = 0;
        let closed = false;
        let stringQuote = null;
        for (; i < src.length; i++) {
          const ch = src[i];
          if (stringQuote) {
            if (ch === stringQuote && src[i - 1] !== '\\') stringQuote = null;
            continue;
          }
          if (ch === '"' || ch === "'" || ch === '`') { stringQuote = ch; continue; }
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) { i++; closed = true; break; }
          }
        }
        const expr = src.slice(start + 1, closed ? i - 1 : i).trim();
        props.push({ name: '...', value: { expr } });
      } else {
        const start = i;
        while (i < src.length && !isSpace(src[i])) i++;
        props.push({ name: '...', value: { expr: src.slice(start, i) } });
      }
      continue;
    }

    if (src[i] === '{') {
      const parsed = readBraceExpression(src, i);
      i = parsed.end;
      if (parsed.expr.startsWith('...')) {
        props.push({ name: '...', value: { expr: parsed.expr.slice(3).trim() } });
      }
      continue;
    }

    const nameStart = i;
    while (i < src.length && /[\w$:.-]/.test(src[i])) i++;
    if (i === nameStart) { i++; continue; }
    const name = src.slice(nameStart, i);

    while (i < src.length && isSpace(src[i])) i++;
    if (src[i] !== '=') {
      props.push({ name, value: true });
      continue;
    }

    i++;
    while (i < src.length && isSpace(src[i])) i++;
    const quote = src[i];

    if (quote === '"' || quote === "'") {
      i++;
      let value = '';
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < src.length) {
          value += src[i + 1];
          i += 2;
        } else {
          value += src[i++];
        }
      }
      if (i < src.length) i++;
      props.push({ name, value });
      continue;
    }

    if (quote === '{') {
      const parsed = readBraceExpression(src, i);
      i = parsed.end;
      props.push({ name, value: { expr: parsed.expr } });
      continue;
    }

    const valueStart = i;
    while (i < src.length && !isSpace(src[i])) i++;
    props.push({ name, value: src.slice(valueStart, i) });
  }

  return props;
}

/**
 * Read a balanced {expression} starting at `start`.
 * @param {string} src
 * @param {number} start
 * @returns {{ expr: string, end: number }}
 */
function readBraceExpression(src, start) {
  let i = start;
  let depth = 0;
  let closed = false;
  let stringQuote = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (stringQuote) {
      if (ch === stringQuote && src[i - 1] !== '\\') stringQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { stringQuote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { i++; closed = true; break; }
    }
  }
  return { expr: src.slice(start + 1, closed ? i - 1 : i).trim(), end: i };
}

function isTableDelimiterRow(cells) {
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function splitRow(row) {
  let value = row.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1);

  const cells = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && value[i + 1] === '|') {
      current += '\\|';
      i++;
      continue;
    }
    if (ch === '`') { inCode = !inCode; current += ch; continue; }
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parse inline markdown into a flat node list.
 * @param {string} text
 * @returns {object[]}
 */
export function parseInline(text) {
  const nodes = [];
  let rest = text;
  let buffer = '';

  const flush = () => { if (buffer) { nodes.push({ type: 'text', value: buffer }); buffer = ''; } };

  while (rest.length > 0) {
    let m;

    if ((m = /^\\([\\`*_{}\[\]()#+\-.!|>~])/.exec(rest))) { buffer += m[1]; rest = rest.slice(2); continue; }
    if ((m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest))) {
      let value = m[2];
      if (/^ [\s\S]* $/.test(value) && value.trim()) value = value.slice(1, -1);
      flush(); nodes.push({ type: 'codespan', value }); rest = rest.slice(m[0].length); continue;
    }
    if (rest[0] === '`') {
      // Unmatched backtick run is literal text.
      const run = /^`+/.exec(rest)[0];
      buffer += run; rest = rest.slice(run.length); continue;
    }
    if (rest[0] === '[' || (rest[0] === '!' && rest[1] === '[')) {
      const link = parseLink(rest);
      if (link) { flush(); nodes.push(link.node); rest = rest.slice(link.length); continue; }
    }
    if (rest[0] === '*' || rest[0] === '_' || rest[0] === '~') {
      const emph = parseEmphasis(rest, buffer.slice(-1));
      if (emph) { flush(); nodes.push(emph.node); rest = rest.slice(emph.length); continue; }
      // Consume the whole delimiter run so a later char of it cannot open.
      const run = new RegExp(`^\\${rest[0]}+`).exec(rest)[0];
      buffer += run; rest = rest.slice(run.length); continue;
    }
    if ((m = RE_ENTITY.exec(rest))) {
      const decoded = decodeEntity(m);
      if (decoded !== null) { buffer += decoded; rest = rest.slice(m[0].length); continue; }
    }
    if ((m = RE_AUTOLINK.exec(rest))) {
      flush();
      nodes.push({ type: 'link', children: [{ type: 'text', value: m[1] }], url: sanitizeUrl(m[1]), title: null });
      rest = rest.slice(m[0].length);
      continue;
    }
    if ((m = RE_EXPR.exec(rest))) { flush(); nodes.push({ type: 'expression', value: m[1].trim() }); rest = rest.slice(m[0].length); continue; }

    // Inline JSX component or known inline HTML tag.
    if ((m = RE_TAG.exec(rest))) {
      const full = m[0];
      const name = m[1];
      const attrs = m[2] || '';
      const selfClosing = full.endsWith('/>');
      const lower = name.toLowerCase();

      if (/^[A-Z]/.test(name)) {
        if (selfClosing) {
          flush();
          nodes.push({ type: 'component', name, props: parseProps(attrs), children: [], inline: true });
          rest = rest.slice(full.length);
          continue;
        }
        const close = findInlineClose(rest, full.length, name);
        if (close) {
          flush();
          nodes.push({
            type: 'component',
            name,
            props: parseProps(attrs),
            children: parseInline(rest.slice(full.length, close.start)),
            inline: true,
          });
          rest = rest.slice(close.end);
          continue;
        }
      } else if (INLINE_HTML_TAGS.has(lower)) {
        if (VOID_HTML_TAGS.has(lower)) {
          flush();
          nodes.push({ type: 'inlineHtml', value: selfClosing ? full : `<${lower} />` });
          rest = rest.slice(full.length);
          continue;
        }
        if (selfClosing) {
          flush();
          nodes.push({ type: 'inlineHtml', value: full });
          rest = rest.slice(full.length);
          continue;
        }
        const close = findInlineClose(rest, full.length, name);
        if (close) {
          flush();
          nodes.push({ type: 'inlineHtml', value: rest.slice(0, close.end) });
          rest = rest.slice(close.end);
          continue;
        }
      }
    }

    if ((m = /^(  )\n/.exec(rest))) { flush(); nodes.push({ type: 'break' }); rest = rest.slice(3); continue; }

    buffer += rest[0];
    rest = rest.slice(1);
  }

  flush();
  return nodes;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Skip a code span starting at `i` (text[i] === '`').
 * @returns {number} index just past the span, or past the backtick run if unclosed
 */
function skipCodeSpan(text, i) {
  let run = 0;
  while (text[i + run] === '`') run++;
  const ticks = '`'.repeat(run);
  let j = text.indexOf(ticks, i + run);
  while (j !== -1 && text[j + run] === '`') {
    let k = j; while (text[k] === '`') k++;
    j = text.indexOf(ticks, k);
  }
  return j === -1 ? i + run : j + run;
}

/**
 * Parse `[text](dest "title")` or `![alt](dest "title")` at the start of `text`.
 * @returns {{ node: object, length: number } | null}
 */
function parseLink(text) {
  const image = text[0] === '!';
  const open = image ? 1 : 0;
  const close = findBracketClose(text, open);
  if (close === -1 || text[close + 1] !== '(') return null;
  const dest = parseLinkDestination(text, close + 1);
  if (!dest) return null;
  const label = text.slice(open + 1, close);
  const node = image
    ? { type: 'image', alt: label, url: sanitizeUrl(dest.url, { image: true }), title: dest.title }
    : { type: 'link', children: parseInline(label), url: sanitizeUrl(dest.url), title: dest.title };
  if (!image && !label) return null;
  return { node, length: dest.end };
}

/** Index of the `]` matching the `[` at `start`, skipping escapes and code spans. */
function findBracketClose(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '`') { i = skipCodeSpan(text, i) - 1; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Parse a link destination and optional title starting at the `(` at `start`.
 * Supports `<...>` destinations and balanced parentheses.
 * @returns {{ url: string, title: string | null, end: number } | null}
 */
function parseLinkDestination(text, start) {
  let i = start + 1;
  const skipSpace = () => { while (i < text.length && /[ \t\n]/.test(text[i])) i++; };
  skipSpace();

  let url = '';
  if (text[i] === '<') {
    const end = text.indexOf('>', i);
    if (end === -1 || text.slice(i, end).includes('\n')) return null;
    url = text.slice(i + 1, end);
    i = end + 1;
  } else {
    let depth = 0;
    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) break;
      if (ch === '\\' && i + 1 < text.length && /[()\\]/.test(text[i + 1])) { url += text[i + 1]; i += 2; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      }
      url += ch;
      i++;
    }
    if (depth !== 0) return null;
  }

  skipSpace();
  let title = null;
  const q = text[i];
  if (q === '"' || q === "'" || q === '(') {
    const closer = q === '(' ? ')' : q;
    let value = '';
    i++;
    while (i < text.length && text[i] !== closer) {
      if (text[i] === '\\' && i + 1 < text.length) { value += text[i + 1]; i += 2; continue; }
      value += text[i++];
    }
    if (i >= text.length) return null;
    i++;
    title = value;
    skipSpace();
  }

  if (text[i] !== ')') return null;
  return { url, title, end: i + 1 };
}

/**
 * Parse emphasis (`*`, `_`), strong, strong+em (`***`) or strikethrough
 * (`~~`) at the start of `text`. Delimiters must be flanking: the opener
 * may not be followed by whitespace and the closer may not follow it.
 * Code spans inside are skipped when looking for the closer.
 * @param {string} text
 * @param {string} prev - character before the delimiter run
 * @returns {{ node: object, length: number } | null}
 */
function parseEmphasis(text, prev) {
  const ch = text[0];
  if (ch === '_' && WORD_CHAR.test(prev)) return null;
  let run = 0;
  while (text[run] === ch) run++;
  const sizes = ch === '~' ? (run >= 2 ? [2] : []) : [3, 2, 1].filter((n) => n <= run);

  for (const n of sizes) {
    if (!text[n] || /\s/.test(text[n])) continue;
    const close = findEmphasisCloser(text, n, ch, n);
    if (close === -1) continue;
    const inner = parseInline(text.slice(n, close));
    let node;
    if (ch === '~') node = { type: 'del', children: inner };
    else if (n === 3) node = { type: 'strong', children: [{ type: 'em', children: inner }] };
    else if (n === 2) node = { type: 'strong', children: inner };
    else node = { type: 'em', children: inner };
    return { node, length: close + n };
  }
  return null;
}

/**
 * Find where a delimiter of length `n` closes, scanning from `from`.
 * Nested runs of a different length (e.g. `**` inside `*...*`) are skipped.
 * @returns {number} index of the closing delimiter, or -1
 */
function findEmphasisCloser(text, from, ch, n) {
  let i = from;
  while (i < text.length) {
    const c = text[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { i = skipCodeSpan(text, i); continue; }
    if (c !== ch) { i++; continue; }

    let run = 0;
    while (text[i + run] === ch) run++;
    const rightFlanking = i > from && !/\s/.test(text[i - 1]);
    const intraword = ch === '_' && WORD_CHAR.test(text[i + run] || '');
    if (rightFlanking && !intraword && run >= n && !(run < 3 && run !== n)) {
      return i + run - n;
    }
    i += run;
  }
  return -1;
}

/**
 * Decode an entity reference match from RE_ENTITY.
 * @returns {string | null} decoded text, or null for unknown names
 */
function decodeEntity(m) {
  if (m[1] || m[2]) {
    const code = Number.parseInt(m[1] || m[2], m[1] ? 10 : 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�';
  }
  return Object.hasOwn(NAMED_ENTITIES, m[3]) ? NAMED_ENTITIES[m[3]] : null;
}

/**
 * Find the closing tag matching an inline opening tag.
 * @param {string} text
 * @param {number} from - index just after the opening tag
 * @param {string} name
 * @returns {{ start: number, end: number } | null}
 */
function findInlineClose(text, from, name) {
  const re = new RegExp(`</?${escapeRegExp(name)}\\b(?:"[^"]*"|'[^']*'|\\{[^}]*\\}|[^>"'])*>`, 'g');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].startsWith('</')) {
      depth--;
      if (depth === 0) return { start: m.index, end: m.index + m[0].length };
    } else if (!m[0].endsWith('/>')) {
      depth++;
    }
  }
  return null;
}

/**
 * Generate an URL-safe slug from heading text.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}
