#!/usr/bin/env node
/**
 * Fidocs CLI: build | dev | init
 */

import { build } from '../core/engine.js';
import { startDevServer } from '../core/dev.js';
import { runCreate } from './init.js';

const HELP = `fidocs - zero-dependency documentation generator

Usage:
  fidocs <command> [options]

Commands:
  build [dir]     Build documentation to static HTML/Gea (default: .)
  dev   [dir]     Start dev server with live reload (default: .)
  init  [name]    Scaffold a docs project (asks for a name if omitted)

Options:
  --format <fmt>  Override output format: html | gea | both
  --port <n>      Dev server port (default: 4321)
  -h, --help      Show this help
`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') args.format = argv[++i];
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '-h' || a === '--help') args.help = true;
    else args._.push(a);
  }
  return args;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || args._.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  const command = args._[0];
  const dir = process.cwd() + '/' + (args._[1] || '.');
  const root = await import('node:path').then((p) => p.resolve(dir));

  try {
    if (command === 'build') {
      if (args.format) await writeOverride(root, args.format);
      const { pages, written } = await build(root);
      console.log(`[fidocs] built ${pages.length} page(s), ${written.length} file(s) written`);
      for (const w of written) console.log('  -', w.replace(root + '/', ''));
      return 0;
    }

    if (command === 'dev') {
      if (args.format) await writeOverride(root, args.format);
      await build(root);
      const server = await startDevServer({ root, rebuild: () => build(root), port: args.port || 4321 });
      process.on('SIGINT', () => { server.close(); process.exit(0); });
      return 0;
    }

    if (command === 'init') {
      return runCreate(args._[1] ? [args._[1]] : []);
    }

    console.error(`Unknown command: ${command}\n`);
    process.stdout.write(HELP);
    return 1;
  } catch (err) {
    console.error('[fidocs] error:', err.message);
    return 1;
  }
}

async function writeOverride(root, format) {
  // Apply a one-off format override via env consumed by config loader.
  process.env.FIDOCS_FORMAT = format;
}
