/**
 * Zero-dependency Markdown parser producing a block/inline AST.
 * Covers a CommonMark subset: headings, paragraphs, fenced code,
 * lists (nested), blockquotes, tables, hr, raw html and inline markup.
 */

const RE = {
  fence: /^(```+|~~~+)\s*([\w+-]*)\s*$/,
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
      const marker = fence[1][0];
      const lang = fence[2] || null;
      const body = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(marker.repeat(3)) && RE.fence.test(lines[i].trim()))) {
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
      blocks.push({ type: 'blockquote', children: parseBlocks(body) });
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
    const own = [it.text, ...it.lines].join('\n');
    const node = { type: 'listItem', children: [{ type: 'paragraph', children: parseInline(own) }, ...it.children] };
    return node;
  });

  return { node: { type: 'list', ordered, spread: false, children }, consumed: i - start };
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
    if ((m = /^`([^`]+)`/.exec(rest))) { flush(); nodes.push({ type: 'codespan', value: m[1] }); rest = rest.slice(m[0].length); continue; }
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(rest))) {
      flush(); nodes.push({ type: 'image', alt: m[1], url: m[2], title: m[3] || null }); rest = rest.slice(m[0].length); continue;
    }
    if ((m = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(rest))) {
      flush(); nodes.push({ type: 'link', children: parseInline(m[1]), url: m[2], title: m[3] || null }); rest = rest.slice(m[0].length); continue;
    }
    if ((m = /^(\*\*|__)([\s\S]+?)\1/.exec(rest))) { flush(); nodes.push({ type: 'strong', children: parseInline(m[2]) }); rest = rest.slice(m[0].length); continue; }
    if ((m = /^(\*|_)([\s\S]+?)\1/.exec(rest)) &&
        !(m[1] === '_' &&
          /[\p{L}\p{N}]/u.test(buffer.slice(-1)) &&
          /[\p{L}\p{N}]/u.test(rest[m[0].length] || ''))) {
      flush(); nodes.push({ type: 'em', children: parseInline(m[2]) }); rest = rest.slice(m[0].length); continue;
    }
    if ((m = /^~~([\s\S]+?)~~/.exec(rest))) { flush(); nodes.push({ type: 'del', children: parseInline(m[1]) }); rest = rest.slice(m[0].length); continue; }
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
