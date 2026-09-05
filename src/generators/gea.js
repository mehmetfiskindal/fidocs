/**
 * Generates Gea (JSX) component files from parsed MDX pages.
 * Each page becomes a Gea Component class whose template() returns
 * the document as JSX; MDX components/expressions are passed through
 * so @geajs/vite-plugin can compile them.
 */

import { escapeHtml } from './templates.js';

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
      return `<h${node.level} id="${node.id}">${inlineToJsx(node.children)}</h${node.level}>`;
    case 'paragraph':
      return `<p>${inlineToJsx(node.children)}</p>`;
    case 'code':
      return `<pre class="code"${node.lang ? ` data-lang="${node.lang}"` : ''}><code>${escapeHtml(node.value)}</code></pre>`;
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
      return componentToJsx(node);
    default:
      return '';
  }
}

function listItemJsx(child) {
  if (child.type === 'paragraph') return inlineToJsx(child.children);
  return nodeToJsx(child);
}

function componentToJsx(node) {
  const attrs = (node.props || [])
    .map((p) => {
      if (p.value === true) return p.name;
      if (p.value && typeof p.value === 'object' && p.value.expr) return `${p.name}={${p.value.expr}}`;
      return `${p.name}="${p.value}"`;
    })
    .join(' ');
  const open = `<${node.name}${attrs ? ' ' + attrs : ''}`;
  const children = (node.children || []).map(nodeToJsx).filter(Boolean);
  if (!children.length) return `${open} />`;
  return `${open}>\n${children.join('\n')}\n</${node.name}>`;
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
      return `<a href="${node.url}">${inlineToJsx(node.children)}</a>`;
    case 'image':
      return `<img src="${node.url}" alt="${node.alt || ''}" />`;
    case 'expression':
      return `{${node.value}}`;
    case 'inlineHtml':
      return node.value;
    case 'break':
      return '<br />';
    default:
      return '';
  }
}

function jsxText(value) {
  return value.replace(/&/g, '&amp;').replace(/&amp;lt;/g, '&lt;').replace(/&amp;gt;/g, '&gt;').replace(/[{}]/g, (c) => `{'${c}'}`);
}

/**
 * Generate a full Gea component file for one doc page.
 * @param {{ slug: string, imports: object[], ast: object, data: object }} page
 * @returns {{ filename: string, code: string }}
 */
export function generateGeaPage(page) {
  const componentName = page.slug
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

  const importLines = [
    "import { Component } from '@geajs/core'",
    ...page.imports.map((imp) => {
      const parts = [];
      if (imp.default) parts.push(imp.default);
      if (imp.named.length) parts.push(`{ ${imp.named.join(', ')} }`);
      return `import ${parts.join(', ')} from '${imp.source}'`;
    }),
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
