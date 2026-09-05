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

// Inline MDX expression: {identifier}, {a.b}, {x: 1}, etc. Built via
// new RegExp to keep the pattern robust.
const RE_EXPR = new RegExp('^\\{([^{}]+)\\}');

/**
 * Parse markdown source into a block AST.
 * @param {string} src
 * @returns {{ type: 'root', children: object[] }}
 */
export function parseMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const children = parseBlocks(lines);
  return { type: 'root', children };
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
      const text = heading[2].trim();
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
      const { node, consumed } = parseTagBlock(lines, i);
      blocks.push(node);
      i += consumed;
      continue;
    }

    // Blockquote
    if (RE.quote.test(line)) {
      const body = [];
      while (i < lines.length && (RE.quote.test(lines[i]) || (lines[i].trim() && body.length && !RE.heading.test(lines[i])))) {
        const m = RE.quote.exec(lines[i]);
        body.push(m ? m[1] : lines[i]);
        i++;
      }
      blocks.push({ type: 'blockquote', children: parseBlocks(body) });
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length &&
        RE.tableDelim.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const header = splitRow(line);
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
           !RE.tagStart.test(lines[i].trim())) {
      para.push(lines[i]); i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(para.join('\n')) });
  }

  return blocks;
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
      if (i + 1 < lines.length && (RE.ulItem.test(lines[i + 1]) || RE.olItem.test(lines[i + 1]))) { i++; continue; }
      break;
    }
    const m = RE.ulItem.exec(line) || RE.olItem.exec(line);
    if (!m) {
      if (items.length && line.trimStart().startsWith('  ')) {
        items[items.length - 1].lines.push(line);
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
    const own = [it.text, ...it.lines.map((l) => l.trim())].join('\n');
    const node = { type: 'listItem', children: [{ type: 'paragraph', children: parseInline(own) }, ...it.children] };
    return node;
  });

  return { node: { type: 'list', ordered, spread: false, children }, consumed: i - start };
}

function parseTagBlock(lines, start) {
  const m = RE.tagStart.exec(lines[start].trim());
  const [, closing, name, attrs] = m;
  const isComponent = /^[A-Z]/.test(name);
  const startIdx = start;
  let depth = closing ? 0 : 1;
  let i = start;
  const body = [];

  const selfClosing = lines[start].trim().endsWith('/>');
  const closeRe = new RegExp(`</${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>`);
  const closedInFirst = selfClosing || closeRe.test(lines[start]);

  if (closedInFirst && !closing) {
    const inline = lines[start].trim();
    const openEnd = inline.indexOf('>');
    let inner = '';
    let trailing = '';
    if (!selfClosing) {
      const closeMatch = closeRe.exec(inline);
      inner = inline.slice(openEnd + 1, closeMatch.index);
      trailing = inline.slice(closeMatch.index + closeMatch[0].length);
    }
    const childLines = [inner, trailing].map((s) => s.trim()).filter(Boolean);
    return {
      node: isComponent
        ? { type: 'component', name, props: parseProps(attrs), children: parseBlocks(childLines) }
        : { type: 'html', value: inline },
      consumed: 1,
    };
  }

  i++;
  while (i < lines.length && depth > 0) {
    const t = lines[i].trim();
    const tag = RE.tagStart.exec(t);
    if (tag) {
      if (tag[1]) depth--;
      else if (!t.endsWith('/>') && !new RegExp(`</${name}>`).test(t)) depth++;
      else depth--;
    }
    if (depth > 0) body.push(lines[i]);
    else {
      const tail = t.slice(t.lastIndexOf('>') + 1).trim();
      if (tail) body.push(tail);
    }
    i++;
  }

  return {
    node: isComponent
      ? { type: 'component', name, props: parseProps(attrs), children: parseBlocks(body) }
      : { type: 'html', value: lines.slice(startIdx, i).join('\n') },
    consumed: i - startIdx,
  };
}

function parseProps(attrStr) {
  const props = [];
  const re = /(\w+)(?:=(?:\{([^}]*)\}|"([^"]*)"|'([^']*)'|([^\s"'>/}]+)))?/g;
  let m;
  while ((m = re.exec(attrStr || ''))) {
    props.push({
      name: m[1],
      value: m[2] !== undefined ? { expr: m[2].trim() }
        : m[3] !== undefined ? m[3]
        : m[4] !== undefined ? m[4]
        : m[5] !== undefined ? m[5]
        : true,
    });
  }
  return props;
}

function splitRow(row) {
  return row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
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
    if ((m = /^(\*|_)([\s\S]+?)\1/.exec(rest))) { flush(); nodes.push({ type: 'em', children: parseInline(m[2]) }); rest = rest.slice(m[0].length); continue; }
    if ((m = /^~~([\s\S]+?)~~/.exec(rest))) { flush(); nodes.push({ type: 'del', children: parseInline(m[1]) }); rest = rest.slice(m[0].length); continue; }
    if ((m = RE_EXPR.exec(rest))) { flush(); nodes.push({ type: 'expression', value: m[1].trim() }); rest = rest.slice(m[0].length); continue; }
    if ((m = /^<((?:br|kbd|mark|sup|sub|abbr|span|b|i|u|small|code|pre)\b[^>]*)>/.exec(rest))) {
      flush(); nodes.push({ type: 'inlineHtml', value: `<${m[1]}>` }); rest = rest.slice(m[0].length); continue;
    }
    if ((m = /^(  )\n/.exec(rest))) { flush(); nodes.push({ type: 'break' }); rest = rest.slice(3); continue; }

    buffer += rest[0];
    rest = rest.slice(1);
  }

  flush();
  return nodes;
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
