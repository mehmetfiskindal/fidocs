/**
 * Fidocs - zero-dependency documentation generator.
 * Public API entry point.
 */

export { build, discover } from './core/engine.js';
export { loadConfig, DEFAULTS } from './core/config.js';
export { startDevServer, watchFiles } from './core/dev.js';
export { parseMarkdown, parseInline, slugify } from './parsers/markdown.js';
export { parseMdx, walk } from './parsers/mdx.js';
export { parseFrontmatter } from './parsers/frontmatter.js';
export { renderHtml } from './generators/html.js';
export { astToJsx, generateGeaPage } from './generators/gea.js';
export { renderTemplate, escapeHtml } from './generators/templates.js';
export { createHookRunner } from './plugins/hooks.js';
export { loadPlugins } from './plugins/loader.js';
export { runInit, runCreate } from './cli/init.js';
