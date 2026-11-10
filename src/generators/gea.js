/**
 * Generates Gea (JSX) component files from parsed MDX pages.
 * Each page becomes a Gea Component class whose template() returns
 * the document as JSX; MDX components/expressions are passed through
 * so @geajs/vite-plugin can compile them.
 */

/**
 * Render an AST to a JSX string (the article body).
 * @param {{ children: object[] }} ast
 * @returns {string}
 */
export function astToJsx(ast) {
  return ast.children.map(nodeToJsx).filter((l) => l.trim()).join('\n');
}

function nodeToJsx(node) {
  switch (node.type) {
    case 'heading':
      return `<h${node.level} id=${jsxStringAttr(node.id)}>${inlineToJsx(node.children)}</h${node.level}>`;
    case 'paragraph':
      return `<p>${inlineToJsx(node.children)}</p>`;
    case 'code':
      return `<pre class="code"${node.lang ? ` data-lang=${jsxStringAttr(node.lang)}` : ''}><code>${jsxText(node.value)}</code></pre>`;
    case 'blockquote':
      return `<blockquote>\n${node.children.map(nodeToJsx).join('\n')}\n</blockquote>`;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const items = node.children.map((li) => `<li>${li.children.map(listItemJsx).join('')}</li>`);
      return `<${tag}>\n${items.join('\n')}\n</${tag}>`;
    }
    case 'table': {
      const head = node.header.map((c) => `<th>${inlineToJsx(c)}</th>`).join('');
      const rows = node.rows.map((r) => `<tr>${r.map((c) => `<td>${inlineToJsx(c)}</td>`).join('')}</tr>`).join('\n');
      return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    case 'hr':
      return '<hr />';
    case 'html':
      return node.value;
    case 'import':
      return '';
    case 'component':
      return componentToJsx(node, false);
    default:
      return '';
  }
}

function listItemJsx(child) {
  if (child.type === 'paragraph') return inlineToJsx(child.children);
  return nodeToJsx(child);
}

/**
 * Render a component node. Inline components keep their children inline;
 * block components render child blocks.
 * @param {object} node
 * @param {boolean} inline
 */
function componentToJsx(node, inline) {
  const attrs = (node.props || [])
    .map((p) => {
      if (p.name === '...') return `{...${p.value.expr}}`;
      if (p.value === true) return p.name;
      if (p.value && typeof p.value === 'object' && p.value.expr !== undefined) {
        return `${p.name}={${p.value.expr}}`;
      }
      return `${p.name}=${jsxStringAttr(p.value)}`;
    })
    .join(' ');
  const open = `<${node.name}${attrs ? ' ' + attrs : ''}`;
  const children = inline
    ? inlineToJsx(node.children || [])
    : (node.children || []).map(nodeToJsx).filter(Boolean).join('\n');

  if (!children) return `${open} />`;
  if (inline) return `${open}>${children}</${node.name}>`;
  return `${open}>\n${children}\n</${node.name}>`;
}

function inlineToJsx(nodes) {
  return nodes.map(inlineNodeToJsx).join('');
}

function inlineNodeToJsx(node) {
  switch (node.type) {
    case 'text':
      return jsxText(node.value);
    case 'strong':
      return `<strong>${inlineToJsx(node.children)}</strong>`;
    case 'em':
      return `<em>${inlineToJsx(node.children)}</em>`;
    case 'del':
      return `<del>${inlineToJsx(node.children)}</del>`;
    case 'codespan':
      return `<code>{${JSON.stringify(node.value)}}</code>`;
    case 'link':
      return `<a href=${jsxStringAttr(node.url)}${node.title ? ` title=${jsxStringAttr(node.title)}` : ''}>${inlineToJsx(node.children)}</a>`;
    case 'image':
      return `<img src=${jsxStringAttr(node.url)} alt=${jsxStringAttr(node.alt || '')}${node.title ? ` title=${jsxStringAttr(node.title)}` : ''} />`;
    case 'expression':
      return `{${node.value}}`;
    case 'inlineHtml':
      return node.value;
    case 'break':
      return '<br />';
    case 'component':
      return componentToJsx(node, true);
    default:
      return '';
  }
}

/**
 * Emit JSX text safely. Values that JSX would misinterpret are emitted as
 * a string expression instead of raw text.
 * @param {unknown} value
 */
function jsxText(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (/[<>{}\n\r&]/.test(text) || /^\s|\s$/.test(text)) {
    return `{${JSON.stringify(text)}}`;
  }
  return text;
}

/**
 * Emit a JSX string attribute. Plain values keep the familiar
 * `name="value"` form; problematic values become an expression.
 * @param {unknown} value
 */
function jsxStringAttr(value) {
  const text = String(value ?? '');
  if (/["\\<>{}\n\r&]/.test(text)) return `{${JSON.stringify(text)}}`;
  return `"${text}"`;
}

/**
 * Derive a safe PascalCase class/file name from a page slug.
 * Handles nested paths, leading digits and punctuation.
 * @param {string} slug
 * @returns {string}
 */
export function componentNameFromSlug(slug) {
  const words = String(slug || '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  let name = words.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  if (!name) name = 'Page';
  if (/^\p{N}/u.test(name)) name = `Page${name}`;
  return name;
}

/**
 * Generate a full Gea component file for one doc page.
 * @param {{ slug: string, imports: object[], ast: object, data: object }} page
 * @param {{ componentName?: string, jsxImportSource?: string }} [opts]
 * @returns {{ filename: string, code: string }}
 */
export function generateGeaPage(page, opts = {}) {
  const componentName = opts.componentName || componentNameFromSlug(page.slug);
  const jsxImportSource = opts.jsxImportSource || '@geajs/core';

  const importLines = [
    `import { Component } from ${quoteString(jsxImportSource)}`,
    ...page.imports.map(importToCode),
  ];

  const code = `${importLines.join('\n')}

export default class ${componentName} extends Component {
  template() {
    return (
      <article class="doc-page">
${astToJsx(page.ast)
  .split('\n')
  .map((l) => '        ' + l)
  .join('\n')}
      </article>
    )
  }
}
`;

  return { filename: `${componentName}.jsx`, code };
}

/**
 * Serialize one parsed import for the generated page.
 * @param {object} imp
 */
function importToCode(imp) {
  if (imp.sideEffect) return `import ${quoteString(imp.source)}`;

  const parts = [];
  if (imp.namespace) parts.push(`* as ${imp.namespace}`);
  else {
    if (imp.default) parts.push(imp.default);
    if (imp.named && imp.named.length) parts.push(`{ ${imp.named.join(', ')} }`);
  }

  if (!parts.length) return `import ${quoteString(imp.source)}`;
  return `import ${parts.join(', ')} from ${quoteString(imp.source)}`;
}

/** Single-quoted JavaScript string literal. */
function quoteString(value) {
  return `'${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;
}
