/**
 * Tiny template engine: {{var}} substitution only (values injected as-is;
 * callers are responsible for escaping).
 */

const RE = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Render a template string with the given variables.
 * @param {string} tpl
 * @param {Record<string, string | number>} vars
 * @returns {string}
 */
export function renderTemplate(tpl, vars) {
  return tpl.replace(RE, (_, key) => {
    const value = key.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), vars);
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Escape a string for safe embedding in HTML text/attributes.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
