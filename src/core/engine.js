/**
 * Fidocs core engine: discovers docs, parses, runs hooks, generates
 * static HTML pages and/or a Gea application, writes output.
 */

import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMdx } from '../parsers/mdx.js';
import { renderHtml } from '../generators/html.js';
import { generateGeaPage } from '../generators/gea.js';
import { renderTemplate, escapeHtml } from '../generators/templates.js';
import { createHookRunner } from '../plugins/hooks.js';
import { loadPlugins } from '../plugins/loader.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Discover .md/.mdx files recursively.
 * @param {string} dir
 * @param {string} [base]
 */
export async function discover(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await discover(full, base)));
    else if (/\.(md|mdx)$/.test(entry.name)) out.push(full);
  }
  return out.sort();
}

/**
 * Parse a single doc file.
 * @param {string} file
 * @param {string} root
 */
async function parseFile(file, root) {
  const raw = await readFile(file, 'utf8');
  const rel = path.relative(root, file);
  const parsed = parseMdx(raw);
  const slug = path
    .relative(path.join(root, parsed.dir || ''), file)
    .replace(/\.(md|mdx)$/, '')
    .replace(/\\/g, '/')
    .replace(/\/index$/, '') || 'index';
  return {
    file,
    rel,
    slug,
    ...parsed,
    order: typeof parsed.data.order === 'number' ? parsed.data.order : 999,
  };
}

/**
 * Build the whole project.
 * @param {string} root - project root (contains fidocs.config.js and docs/)
 * @returns {Promise<{ pages: object[], written: string[] }>}
 */
export async function build(root) {
  const config = await loadConfigAndPlugins(root);
  const { hooks } = config;
  const inputDir = path.join(root, config.input);
  const files = await discover(inputDir);

  let pages = [];
  for (const file of files) {
    await hooks.run('beforeParse', { root, file });
    const page = await parseFile(file, inputDir);
    page.title = page.data.title || titleFromSlug(page.slug);
    const updated = await hooks.run('afterParse', page, { config });
    pages.push(updated || page);
  }
  pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  let result = { config, pages };
  result = (await hooks.run('beforeGenerate', result, {})) || result;
  pages = result.pages;

  const outDir = path.join(root, config.output);
  await rm(outDir, { recursive: true, force: true });
  const written = [];

  if (config.format === 'html' || config.format === 'both') {
    written.push(...(await emitHtml(config, pages, outDir, root)));
  }
  if (config.format === 'gea' || config.format === 'both') {
    written.push(...(await emitGea(config, pages, outDir)));
  }

  await hooks.run('afterGenerate', { pages, written }, {});
  return { pages, written };
}

async function loadConfigAndPlugins(root) {
  const { loadConfig } = await import('./config.js');
  let config = await loadConfig(root);
  const plugins = await loadPlugins(root, config.plugins);
  const runner = createHookRunner(plugins);
  config = (await runner.run('onConfigLoad', config, {})) || config;
  config.hooks = runner;
  return config;
}

function titleFromSlug(slug) {
  const last = slug.split('/').pop() || slug;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function emitHtml(config, pages, outDir, root) {
  const written = [];
  const templatePath = config.template
    ? path.join(root, config.template)
    : path.join(HERE, '..', '..', 'templates', 'base.html');
  const tpl = await readFile(templatePath, 'utf8');

  const nav = pages
    .map((p) => `<li><a href="/${p.slug === 'index' ? '' : p.slug + '.html'}">${escapeHtml(p.title)}</a></li>`)
    .join('');

  const resolver = config.components
    ? (name, props, children) => {
        const fn = config.components[name];
        return typeof fn === 'function' ? fn({ ...props, children }) : '';
      }
    : undefined;

  for (const page of pages) {
    const body = renderHtml(page.ast, { resolveComponent: resolver });
    const html = renderTemplate(tpl, {
      title: escapeHtml(page.title),
      siteTitle: escapeHtml(config.title),
      description: escapeHtml(page.data.description || config.description),
      nav,
      content: body,
    });
    const out = path.join(outDir, page.slug === 'index' ? 'index.html' : `${page.slug}.html`);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, html);
    written.push(out);
  }

  if (!pages.some((p) => p.slug === 'index')) {
    const links = pages
      .map((p) => `<li><a href="/${p.slug}.html">${escapeHtml(p.title)}</a></li>`)
      .join('');
    const html = renderTemplate(tpl, {
      title: escapeHtml(config.title),
      siteTitle: escapeHtml(config.title),
      description: escapeHtml(config.description),
      nav,
      content: `<h1>${escapeHtml(config.title)}</h1><ul>${links}</ul>`,
    });
    const out = path.join(outDir, 'index.html');
    await writeFile(out, html);
    written.push(out);
  }
  return written;
}

async function emitGea(config, pages, outDir) {
  const written = [];
  const appDir = path.join(outDir, config.gea.dir);
  await mkdir(appDir, { recursive: true });

  const routes = [];
  for (const page of pages) {
    const { filename, code } = generateGeaPage(page);
    const out = path.join(appDir, filename);
    await writeFile(out, code);
    written.push(out);
    routes.push({
      path: `/${page.slug === 'index' ? '' : page.slug}`,
      component: filename.replace(/\.jsx$/, ''),
      title: page.title,
    });
    written.push(...(await copyLocalComponents(appDir, page)));
  }

  if (!pages.some((p) => p.slug === 'index')) {
    const items = pages
      .map((p) => `          <li><a href="/${p.slug}">${escapeHtml(p.title)}</a></li>`)
      .join('\n');
    const code = `import { Component } from '@geajs/core'

export default class Index extends Component {
  template() {
    return (
      <article class="doc-page">
        <h1>${escapeHtml(config.title)}</h1>
        <ul>
${items}
        </ul>
      </article>
    )
  }
}
`;
    const out = path.join(appDir, 'Index.jsx');
    await writeFile(out, code);
    written.push(out);
    routes.unshift({ path: '/', component: 'Index', title: config.title });
  }

  const routesCode = `export const routes = [\n${routes
    .map((r) => `  { path: '${r.path}', component: () => import('./${r.component}.jsx'), title: ${JSON.stringify(r.title)} },`)
    .join('\n')}\n]\n`;

  const appCode = `import { Component, Link, RouterView } from '@geajs/core'
import { routes } from './routes.js'

class NavStore extends Component {
  template() {
    return (
      <nav class="doc-nav">
${routes.map((r) => `        <Link to="${r.path}" label="${r.title}" />`).join('\n')}
      </nav>
    )
  }
}

export default class FidocsApp extends Component {
  template() {
    return (
      <div class="fidocs-app">
        <NavStore />
        <RouterView routes={routes} />
      </div>
    )
  }
}
`;

  for (const [name, code] of [['routes.js', routesCode], ['App.jsx', appCode]]) {
    const out = path.join(appDir, name);
    await writeFile(out, code);
    written.push(out);
  }

  const pkg = {
    name: `${path.basename(outDir)}-gea`,
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { '@geajs/core': '^1.4.0', '@geajs/vite-plugin': '^1.4.0', vite: '^6.0.0' },
  };
  const pkgPath = path.join(appDir, 'package.json');
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  written.push(pkgPath);
  return written;
}

/**
 * Copy locally-imported component files into the generated Gea app,
 * mirroring their relative import paths so imports resolve at runtime.
 * @param {string} appDir
 * @param {object} page
 */
async function copyLocalComponents(appDir, page) {
  const copied = [];
  const srcDir = path.dirname(page.file);
  for (const imp of page.imports) {
    if (!imp.source.startsWith('.')) continue;
    const from = path.resolve(srcDir, imp.source);
    const to = path.resolve(appDir, imp.source);
    if (!to.startsWith(path.resolve(appDir))) continue;
    try {
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
      copied.push(to);
    } catch {
      // missing local component: skip (may be provided by consumer)
    }
  }
  return copied;
}

export { loadConfig } from './config.js';
export { watchFiles, startDevServer } from './dev.js';
