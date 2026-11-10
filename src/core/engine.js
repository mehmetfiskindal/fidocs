/**
 * Fidocs core engine: discovers docs, parses, runs hooks, generates
 * static HTML pages and/or a Gea application, writes output.
 */

import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMdx } from '../parsers/mdx.js';
import { renderHtml } from '../generators/html.js';
import { generateGeaPage, componentNameFromSlug } from '../generators/gea.js';
import { renderTemplate, escapeHtml } from '../generators/templates.js';
import { createHookRunner } from '../plugins/hooks.js';
import { loadPlugins } from '../plugins/loader.js';
import { loadConfig, assertFormat } from './config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Discover .md/.mdx files recursively.
 * @param {string} dir
 */
export async function discover(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await discover(full)));
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
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const parsed = parseMdx(raw);
  const slug = rel
    .replace(/\.(md|mdx)$/, '')
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
export async function build(inputRoot) {
  const root = path.resolve(inputRoot);
  const config = await loadConfigAndPlugins(root);
  assertFormat(config.format);

  const { hooks } = config;
  const inputDir = path.resolve(root, config.input);
  const outDir = path.resolve(root, config.output);
  assertSafeOutput(root, inputDir, outDir);

  if (config.template && (config.format === 'html' || config.format === 'both')) {
    const templatePath = path.resolve(root, config.template);
    if (!existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
  }

  const files = await discover(inputDir);

  let pages = [];
  for (const file of files) {
    const before = await hooks.run('beforeParse', { root, file });
    const fileToParse = before && before.file ? before.file : file;
    const page = await parseFile(fileToParse, inputDir);
    page.title = page.data.title || titleFromSlug(page.slug);
    const updated = await hooks.run('afterParse', page, { config });
    pages.push(updated || page);
  }
  pages.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));

  let result = { config, pages };
  result = (await hooks.run('beforeGenerate', result, {})) || result;
  pages = result.pages;
  assertUniqueSlugs(pages);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const written = [];

  if (config.format === 'html' || config.format === 'both') {
    written.push(...(await emitHtml(config, pages, outDir, root)));
  }
  if (config.format === 'gea' || config.format === 'both') {
    written.push(...(await emitGea(config, pages, outDir)));
  }
  if (config.format === 'embed') {
    written.push(...(await emitEmbed(config, pages, outDir)));
  }

  await hooks.run('afterGenerate', { pages, written }, {});
  return { pages, written };
}

async function loadConfigAndPlugins(root) {
  let config = await loadConfig(root);
  const plugins = await loadPlugins(root, config.plugins);
  const runner = createHookRunner(plugins);
  config = (await runner.run('onConfigLoad', config, {})) || config;
  config.hooks = runner;
  return config;
}

/**
 * Reject output directories that would delete the project or its docs.
 * @param {string} root
 * @param {string} inputDir
 * @param {string} outDir
 */
function assertSafeOutput(root, inputDir, outDir) {
  const relToRoot = path.relative(root, outDir);
  if (!relToRoot || isOutside(relToRoot)) {
    throw new Error(
      `Unsafe output path "${outDir}": output must be a subdirectory of the project root.`,
    );
  }

  const relToInput = path.relative(outDir, inputDir);
  if (!relToInput || !isOutside(relToInput)) {
    throw new Error(
      `Unsafe output path "${outDir}": output cannot be the input directory or contain it.`,
    );
  }
}

function isOutside(rel) {
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

/**
 * Fail instead of silently overwriting one page with another.
 * @param {object[]} pages
 */
function assertUniqueSlugs(pages) {
  const seen = new Map();
  for (const page of pages) {
    const first = seen.get(page.slug);
    if (first) {
      throw new Error(
        `Duplicate page slug "${page.slug}" from "${first.rel}" and "${page.rel}". ` +
        'Rename one of the files or change the slug in a plugin.',
      );
    }
    seen.set(page.slug, page);
  }
}

function titleFromSlug(slug) {
  const last = slug.split('/').pop() || slug;
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function emitHtml(config, pages, outDir, root) {
  const written = [];
  const templatePath = config.template
    ? path.resolve(root, config.template)
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

/**
 * Write one Gea component file per page (plus copied local components),
 * returning the files written and the route descriptors for those pages.
 * @param {string} appDir
 * @param {object[]} pages
 * @param {object} config
 * @returns {Promise<{ written: string[], routes: object[], usedNames: Set<string> }>}
 */
async function writePageComponents(appDir, pages, config) {
  const written = [];
  const routes = [];
  const usedNames = new Set();
  const usedTargets = new Map();
  const copied = new Map();

  for (const page of pages) {
    const componentName = uniqueComponentName(componentNameFromSlug(page.slug), usedNames);
    const { jobs, rewrites } = mapLocalImports(appDir, page, usedTargets);
    const pageForGeneration = rewrites.size
      ? { ...page, imports: page.imports.map((imp) => (rewrites.has(imp.source) ? { ...imp, source: rewrites.get(imp.source) } : imp)) }
      : page;

    const { filename, code } = generateGeaPage(pageForGeneration, {
      componentName,
      jsxImportSource: config.gea ? config.gea.jsxImportSource : undefined,
    });
    const out = path.join(appDir, filename);
    await writeFile(out, code);
    written.push(out);
    routes.push({
      path: `/${page.slug === 'index' ? '' : page.slug}`,
      component: componentName,
      title: page.title,
    });
    written.push(...(await copyLocalComponents(appDir, jobs, copied)));
  }
  return { written, routes, usedNames };
}

/** Reserve a unique PascalCase component name. */
function uniqueComponentName(base, usedNames) {
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) name = `${base}${suffix++}`;
  usedNames.add(name);
  return name;
}

/**
 * Serialize route descriptors to a `routes.js` source string.
 * @param {object[]} routes
 * @returns {string}
 */
function routesCode(routes) {
  return `export const routes = [\n${routes
    .map((r) => `  { path: ${jsString(r.path)}, component: () => import(${jsString(`./${r.component}.jsx`)}), title: ${jsString(r.title)} },`)
    .join('\n')}\n]\n`;
}

/** Single-quoted JavaScript string literal. */
function jsString(value) {
  return `'${String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')}'`;
}

/** Emit a JSX string attribute, using an expression only when needed. */
function jsxStringAttr(value) {
  const text = String(value ?? '');
  if (/["\\<>{}\n\r&]/.test(text)) return `{${JSON.stringify(text)}}`;
  return `"${text}"`;
}

/** Emit JSX text, using a string expression only when needed. */
function jsxText(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (/[<>{}\n\r&]/.test(text) || /^\s|\s$/.test(text)) {
    return `{${JSON.stringify(text)}}`;
  }
  return text;
}

async function emitGea(config, pages, outDir) {
  const written = [];
  const geaConfig = config.gea || {};
  const appDir = path.resolve(outDir, geaConfig.dir || 'gea-app');
  const appRel = path.relative(outDir, appDir);
  if (!appRel || isOutside(appRel)) {
    throw new Error(`Unsafe gea.dir "${geaConfig.dir}": it must be inside the output directory.`);
  }
  await mkdir(appDir, { recursive: true });

  const { written: pageFiles, routes, usedNames } = await writePageComponents(appDir, pages, config);
  written.push(...pageFiles);

  if (!pages.some((p) => p.slug === 'index')) {
    const indexName = uniqueComponentName('Index', usedNames);
    const items = pages
      .map((p) => `          <li><a href=${jsxStringAttr(`/${p.slug}`)}>${jsxText(p.title)}</a></li>`)
      .join('\n');
    const code = `import { Component } from ${jsString(geaConfig.jsxImportSource || '@geajs/core')}

export default class ${indexName} extends Component {
  template() {
    return (
      <article class="doc-page">
        <h1>${jsxText(config.title)}</h1>
        <ul>
${items}
        </ul>
      </article>
    )
  }
}
`;
    const out = path.join(appDir, `${indexName}.jsx`);
    await writeFile(out, code);
    written.push(out);
    routes.unshift({ path: '/', component: indexName, title: config.title });
  }

  const appCode = `import { Component, Link, RouterView } from ${jsString(geaConfig.jsxImportSource || '@geajs/core')}
import { routes } from './routes.js'

class NavStore extends Component {
  template() {
    return (
      <nav class="doc-nav">
${routes.map((r) => `        <Link to=${jsxStringAttr(r.path)} label=${jsxStringAttr(r.title)} />`).join('\n')}
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

  const appName = (path.basename(outDir).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'fidocs') + '-gea';
  const pkg = {
    name: appName,
    private: true,
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { '@geajs/core': '^1.4.0', '@geajs/vite-plugin': '^1.4.0', vite: '^6.0.0' },
  };
  const pkgPath = path.join(appDir, 'package.json');
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  written.push(pkgPath);

  for (const [name, code] of [['routes.js', routesCode(routes)], ['App.jsx', appCode]]) {
    const out = path.join(appDir, name);
    await writeFile(out, code);
    written.push(out);
  }
  return written;
}

/**
 * Emit embeddable Gea components for an existing Gea app: page components
 * plus a `routes.js` the host app can merge into its own router. No
 * standalone App.jsx, nav or package.json is generated.
 * @param {object} config
 * @param {object[]} pages
 * @param {string} outDir
 */
async function emitEmbed(config, pages, outDir) {
  const written = [];
  await mkdir(outDir, { recursive: true });
  const { written: pageFiles, routes } = await writePageComponents(outDir, pages, config);
  written.push(...pageFiles);

  const out = path.join(outDir, 'routes.js');
  await writeFile(out, routesCode(routes));
  written.push(out);
  return written;
}

/**
 * Copy locally-imported component files into the generated Gea app,
 * mirroring their relative import paths so imports resolve at runtime.
 * @param {string} appDir
 * @param {Array<{ from: string, to: string }>} jobs
 * @param {Map<string, string>} copied
 */
async function copyLocalComponents(appDir, jobs, copied) {
  const appRoot = path.resolve(appDir);
  const copiedHere = [];
  for (const { from, to } of jobs) {
    const rel = path.relative(appRoot, to);
    if (!rel || isOutside(rel)) continue;

    const alreadyCopied = copied.has(to);
    if (alreadyCopied && copied.get(to) !== from) {
      throw new Error(
        `Component output collision for "${path.relative(appRoot, to)}": ` +
        `"${copied.get(to)}" and "${from}" would overwrite each other.`,
      );
    }
    copied.set(to, from);

    try {
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(from, to);
      if (!alreadyCopied) copiedHere.push(to);
    } catch (err) {
      if (!alreadyCopied) copied.delete(to);
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EISDIR') {
        // Missing local component: skip (may be provided by consumer).
        continue;
      }
      throw err;
    }
  }
  return copiedHere;
}

/**
 * Map local imports to files under appDir. Imports that would escape appDir
 * are copied to a flat internal folder and their source is rewritten.
 * @param {string} appDir
 * @param {object} page
 * @param {Map<string, string>} usedTargets - output path -> source path
 * @returns {{ jobs: Array<{ from: string, to: string }>, rewrites: Map<string, string> }}
 */
function mapLocalImports(appDir, page, usedTargets) {
  const appRoot = path.resolve(appDir);
  const srcDir = path.dirname(page.file);
  const jobs = [];
  const rewrites = new Map();

  for (const imp of page.imports) {
    if (!imp.source || !imp.source.startsWith('.')) continue;
    const from = path.resolve(srcDir, imp.source);
    let to = path.resolve(appRoot, imp.source);
    let rel = path.relative(appRoot, to);
    const owner = usedTargets.get(to);

    // Escape the app root or resolve a collision between two pages that use
    // the same relative import from different source directories.
    if (!rel || isOutside(rel) || (owner && owner !== from)) {
      const base = path.basename(from).replace(/[^\w.-]+/g, '_') || 'module';
      to = path.resolve(appRoot, '_fidocs-imports', `${hashString(from)}-${base}`);
      rel = path.relative(appRoot, to);
      rewrites.set(imp.source, `./${rel.split(path.sep).join('/')}`);
    }

    usedTargets.set(to, from);
    jobs.push({ from, to });
  }

  return { jobs, rewrites };
}

/** Small stable hash for flattened import file names. */
function hashString(value) {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

export { loadConfig };
export { watchFiles, startDevServer } from './dev.js';
