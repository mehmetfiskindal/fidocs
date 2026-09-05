/**
 * Renders a markdown/MDX AST to an HTML string.
 * Component nodes are rendered via a user-supplied resolver (for
 * server-side HTML output) or as placeholder elements.
 */

import { escapeHtml } from './templates.js';

/**
 * @typedef {(name: string, props: Record<string, unknown>, childrenHtml: string) => string} ComponentResolver
 */

/**
 * Render an AST to HTML.
 * @param {{ type: string, children: object[] }} ast
 * @param {{ resolveComponent?: ComponentResolver }} [opts]
 * @returns {string}
 */
export function renderHtml(ast, opts = {}) {
  return renderNodes(ast.children, opts);
}

function renderNodes(nodes, opts) {
  return nodes.map((n) => renderNode(n, opts)).filter((s) => s.trim()).join('\n');
}

/**
 * Render a list item: a lone paragraph is inlined (CommonMark tight list),
 * otherwise render all child blocks.
 */
function renderListItem(item, opts) {
  const kids = item.children || [];
  if (kids.length === 1 && kids[0].type === 'paragraph') {
    return renderInline(kids[0].children, opts);
  }
  return renderNodes(kids, opts);
}

function renderNode(node, opts) {
  switch (node.type) {
    case 'heading':
      return `<h${node.level} id="${node.id}">${renderInline(node.children, opts)}</h${node.level}>`;
    case 'paragraph':
      return `<p>${renderInline(node.children, opts)}</p>`;
    case 'code':
      return `<pre class="code${node.lang ? ` language-${escapeHtml(node.lang)}` : ''}"><code>${
        escapeHtml(node.value)
      }</code></pre>`;
    case 'blockquote':
      return `<blockquote>${renderNodes(node.children, opts)}</blockquote>`;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const items = node.children.map((li) => `<li>${renderListItem(li, opts)}</li>`).join('');
      return `<${tag}>${items}</${tag}>`;
    }
    case 'table': {
      const head = node.header.map((c) => `<th>${renderInline(c, opts)}</th>`).join('');
      const body = node.rows
        .map((row) => `<tr>${row.map((c) => `<td>${renderInline(c, opts)}</td>`).join('')}</tr>`)
        .join('');
      return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    case 'hr':
      return '<hr>';
    case 'html':
      return node.value;
    case 'import':
      return '';
    case 'component':
      return renderComponent(node, opts);
    default:
      return '';
  }
}

function renderComponent(node, opts) {
  const props = {};
  for (const p of node.props || []) props[p.name] = p.value && p.value.expr ? p.value.expr : p.value;
  const childrenHtml = renderNodes(node.children || [], opts);
  if (opts.resolveComponent) return opts.resolveComponent(node.name, props, childrenHtml);
  const attrs = Object.entries(props)
    .map(([k, v]) => (v === true ? k : `data-${escapeHtml(k)}="${escapeHtml(String(v))}"`))
    .join(' ');
  return `<div class="fidocs-component" data-component="${escapeHtml(node.name)}" ${attrs}>${childrenHtml}</div>`;
}

function renderInline(nodes, opts) {
  return nodes.map((n) => renderInlineNode(n, opts)).join('');
}

function renderInlineNode(node, opts) {
  switch (node.type) {
    case 'text':
      return escapeHtml(node.value);
    case 'strong':
      return `<strong>${renderInline(node.children, opts)}</strong>`;
    case 'em':
      return `<em>${renderInline(node.children, opts)}</em>`;
    case 'del':
      return `<del>${renderInline(node.children, opts)}</del>`;
    case 'codespan':
      return `<code>${escapeHtml(node.value)}</code>`;
    case 'link':
      return `<a href="${escapeHtml(node.url)}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}>${renderInline(node.children, opts)}</a>`;
    case 'image':
      return `<img src="${escapeHtml(node.url)}" alt="${escapeHtml(node.alt)}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}>`;
    case 'expression':
      return `<span class="fidocs-expr" data-expr="${escapeHtml(node.value)}"></span>`;
    case 'inlineHtml':
      return node.value;
    case 'break':
      return '<br>';
    case 'component':
      return renderComponent(node, opts);
    default:
      return '';
  }
}
