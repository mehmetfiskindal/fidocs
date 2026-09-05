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
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { data: {}, content: raw };
  return { data: parseYamlSubset(match[1]), content: raw.slice(match[0].length) };
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
        top.container.push(coerce(text.slice(1).trim()));
      }
      continue;
    }

    const kv = /^([^:]+):\s*(.*)$/.exec(text);
    if (!kv) continue;
    const key = kv[1].trim();
    const rawVal = kv[2].trim();

    if (rawVal === '') {
      const next = lines[i + 1];
      const isList = next && next.trim().startsWith('-') &&
        next.length - next.trimStart().length >= indent;
      const child = isList ? [] : {};
      top.container[key] = child;
      stack.push({ indent, container: child, key });
    } else if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      top.container[key] = rawVal.slice(1, -1).split(',').map((s) => coerce(s.trim()));
    } else {
      top.container[key] = coerce(rawVal);
    }
  }

  return root;
}

function coerce(value) {
  if (/^(['"]).*\1$/.test(value)) return value.slice(1, -1);
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  const num = Number(value);
  if (value !== '' && !Number.isNaN(num)) return num;
  return value;
}
