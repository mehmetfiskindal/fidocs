/**
 * Shared scaffold used by `fidocs init` and `npm create fidocs`.
 */

import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

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
        fidocs: '^0.1.0',
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
 * First non-flag argument is the target directory (default: `.`).
 * @param {string[]} [argv]
 * @returns {Promise<number>}
 */
export async function runCreate(argv = process.argv.slice(2)) {
  const target = argv.find((a) => !a.startsWith('-')) || '.';
  const root = path.resolve(process.cwd(), target);
  await runInit(root);
  const rel = path.relative(process.cwd(), root) || '.';
  console.log(`[fidocs] created project in ${rel}`);
  console.log(`  cd ${rel}`);
  console.log('  npm install');
  console.log('  npm run dev');
  return 0;
}
