/**
 * MDX parser: frontmatter + markdown with JSX/component awareness.
 * Component and import handling is provided by the block tokenizer;
 * this module extracts imports and collects component usages.
 */

import { parseMarkdown } from './markdown.js';
import { parseFrontmatter } from './frontmatter.js';

/**
 * Parse an MDX document.
 * @param {string} raw - Full file content
 * @returns {{ data: object, ast: object, imports: object[], components: string[] }}
 */
export function parseMdx(raw) {
  const { data, content } = parseFrontmatter(raw);
  const ast = parseMarkdown(content);
  const imports = [];
  const components = new Set();

  walk(ast, (node) => {
    if (node.type === 'import') {
      const imp = parseImport(node.value);
      if (imp) imports.push(imp);
    }
    if (node.type === 'component') components.add(node.name);
  });

  return { data, ast, imports, components: [...components] };
}

/**
 * Parse the import forms Fidocs emits back into the generated Gea page.
 * @param {string} value
 * @returns {{ default: string|null, named: string[], namespace: string|null, sideEffect: boolean, source: string } | null}
 */
function parseImport(value) {
  const line = String(value).trim();

  let m = /^import\s*['"]([^'"]+)['"];?$/.exec(line);
  if (m) return { default: null, named: [], namespace: null, sideEffect: true, source: m[1] };

  m = /^import\s+\*\s+as\s+(\w+)\s+from\s*['"]([^'"]+)['"];?$/.exec(line);
  if (m) return { default: null, named: [], namespace: m[1], sideEffect: false, source: m[2] };

  m = /^import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"];?$/.exec(line);
  if (m) {
    return {
      default: m[1] || null,
      named: m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [],
      namespace: null,
      sideEffect: false,
      source: m[3],
    };
  }

  return null;
}

/**
 * Depth-first walk over the AST. Arrays (table cells/rows) are traversed
 * without being passed to the visitor.
 * @param {object|object[]} node
 * @param {(node: object) => void} visit
 */
export function walk(node, visit) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit);
    return;
  }
  if (!node) return;

  visit(node);
  if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, visit));
  if (Array.isArray(node.rows)) node.rows.forEach((row) => walk(row, visit));
  if (Array.isArray(node.header)) walk(node.header, visit);
}
