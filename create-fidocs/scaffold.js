/**
 * Shared scaffold used by `fidocs init` and `npm create fidocs`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function fidocsRange() {
  const { version } = JSON.parse(readFileSync(path.join(HERE, 'package.json'), 'utf8'));
  return `^${version}`;
}

const CONFIG = `export default {
  input: 'docs',
  output: 'dist',
  format: 'html', // 'html' | 'gea' | 'both'
  title: 'My Documentation',
  description: 'Generated with Fidocs',
  plugins: [],
};
`;

const INDEX = `---
title: Introduction
order: 1
---

# Welcome to Fidocs

A **zero-dependency** documentation generator.

## Features

- Markdown and \`MDX\` support
- Gea component embedding
- Static HTML or Gea app output

## Quick start

\`\`\`bash
npm run dev
npm run build
\`\`\`

> Edit \`docs/index.md\` to get started.
`;

const GITIGNORE = `node_modules
dist
`;

/**
 * @param {string} root
 * @param {{ name?: string }} [opts]
 */
export async function runInit(root, opts = {}) {
  await mkdir(root, { recursive: true });
  const docsDir = path.join(root, 'docs');
  await mkdir(docsDir, { recursive: true });

  const name = opts.name || path.basename(path.resolve(root));
  const pkgPath = path.join(root, 'package.json');
  if (!existsSync(pkgPath)) {
    await writeFile(pkgPath, JSON.stringify({
      name,
      private: true,
      type: 'module',
      scripts: {
        dev: 'fidocs dev',
        build: 'fidocs build',
      },
      dependencies: {
        fidocs: fidocsRange(),
      },
    }, null, 2) + '\n');
  }

  const configPath = path.join(root, 'fidocs.config.js');
  if (!existsSync(configPath)) await writeFile(configPath, CONFIG);

  const indexPath = path.join(docsDir, 'index.md');
  if (!existsSync(indexPath)) await writeFile(indexPath, INDEX);

  const ignorePath = path.join(root, '.gitignore');
  if (!existsSync(ignorePath)) await writeFile(ignorePath, GITIGNORE);
}

/**
 * CLI entry for `create-fidocs` / `npm create fidocs`.
 * Uses the first non-flag argument, or asks for a project name.
 * @param {string[]} [argv]
 * @param {{ input?: import('node:stream').Readable, output?: import('node:stream').Writable }} [io]
 * @returns {Promise<number>}
 */
export async function runCreate(argv = process.argv.slice(2), io = {}) {
  const given = argv.find((a) => !a.startsWith('-'));
  const name = await resolveProjectName(given, io);
  if (!name) return 1;

  const root = path.resolve(process.cwd(), name);
  if (existsSync(root)) {
    const entries = await readdir(root);
    if (entries.length) {
      console.error(`[fidocs] directory already exists: ${name}`);
      return 1;
    }
  }

  await runInit(root, { name: packageName(name) });
  const rel = path.relative(process.cwd(), root) || '.';
  console.log(`[fidocs] created project in ${rel}`);
  console.log(`  cd ${rel}`);
  console.log('  npm install');
  console.log('  npm run dev');
  return 0;
}

/**
 * @param {string | undefined} given
 * @param {{ input?: import('node:stream').Readable, output?: import('node:stream').Writable }} io
 */
async function resolveProjectName(given, io) {
  if (given) {
    const name = folderName(given);
    if (!name) {
      console.error('[fidocs] invalid project name (no slashes, not . or ..)');
      return null;
    }
    return name;
  }

  const input = io.input || process.stdin;
  const output = io.output || process.stdout;
  if (!io.input && !input.isTTY) {
    console.error('[fidocs] project name required, e.g. npm create fidocs my-docs');
    return null;
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = folderName(await rl.question('Project name: '));
      if (answer) return answer;
      output.write('Please enter a folder name (no slashes).\n');
    }
  } finally {
    rl.close();
  }
}

/** @param {string} raw */
function folderName(raw) {
  const name = String(raw).trim();
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) return null;
  return name;
}

/** @param {string} folder */
function packageName(folder) {
  const name = folder.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '');
  return name || 'docs';
}
