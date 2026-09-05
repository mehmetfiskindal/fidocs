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
      const m = /^import\s+(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/.exec(node.value);
      if (m) {
        imports.push({
          default: m[1] || null,
          named: m[2] ? m[2].split(',').map((s) => s.trim()).filter(Boolean) : [],
          source: m[3],
        });
      }
    }
    if (node.type === 'component') components.add(node.name);
  });

  return { data, ast, imports, components: [...components] };
}

/**
 * Depth-first walk over the AST.
 * @param {object} node
 * @param {(node: object) => void} visit
 */
export function walk(node, visit) {
  visit(node);
  if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, visit));
  if (Array.isArray(node.rows)) node.rows.flat().forEach((c) => walk(c, visit));
  if (Array.isArray(node.header)) node.header.forEach((c) => walk(c, visit));
}
