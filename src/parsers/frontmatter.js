/**
 * Minimal zero-dependency YAML frontmatter parser.
 * Supports scalars, inline arrays, dash lists and nested maps.
 */

/**
 * Parse frontmatter block from the top of a document.
 * @param {string} raw - Full file content
 * @returns {{ data: Record<string, unknown>, content: string }}
 */
export function parseFrontmatter(raw) {
  const normalized = String(raw).replace(/^\uFEFF/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(normalized);
  if (!match) return { data: {}, content: normalized };
  return { data: parseYamlSubset(match[1]), content: normalized.slice(match[0].length) };
}

/**
 * Parse a YAML subset into a plain object.
 * @param {string} src
 * @returns {Record<string, unknown>}
 */
function parseYamlSubset(src) {
  const root = {};
  const stack = [{ indent: -1, container: root, key: null }];
  const lines = src.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.length - line.trimStart().length;
    const text = line.trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const top = stack[stack.length - 1];

    if (text.startsWith('- ') || text === '-') {
      if (Array.isArray(top.container)) {
        top.container.push(coerce(stripInlineComment(text.slice(1).trim())));
      }
      continue;
    }

    const kv = /^([^:]+):\s*(.*)$/.exec(text);
    if (!kv) continue;
    const key = kv[1].trim();
    const rawText = kv[2].trim();
    const rawVal = stripInlineComment(rawText);

    if (rawText === '') {
      const next = lines[i + 1];
      const isList = next && next.trim().startsWith('-') &&
        next.length - next.trimStart().length >= indent;
      const child = isList ? [] : {};
      top.container[key] = child;
      stack.push({ indent, container: child, key });
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      const inner = rawVal.slice(1, -1).trim();
      top.container[key] = inner
        ? splitInlineArray(inner).map((s) => coerce(s.trim()))
        : [];
    } else if (rawVal === '') {
      // A value that was only a comment is YAML null.
      top.container[key] = null;
    } else {
      top.container[key] = coerce(rawVal);
    }
  }

  return root;
}

/**
 * Remove a YAML inline comment, respecting quoted strings.
 * @param {string} value
 * @returns {string}
 */
function stripInlineComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      if (ch === quote && value[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '#' && (i === 0 || /\s/.test(value[i - 1]))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

/**
 * Split an inline YAML array on commas outside quotes.
 * @param {string} value
 * @returns {string[]}
 */
function splitInlineArray(value) {
  const items = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      current += ch;
      if (ch === quote && value[i - 1] !== '\\') quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if (ch === ',') { items.push(current); current = ''; continue; }
    current += ch;
  }
  items.push(current);
  return items;
}

function coerce(value) {
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value); } catch { return value.slice(1, -1); }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  const num = Number(value);
  if (value !== '' && !Number.isNaN(num)) return num;
  return value;
}
