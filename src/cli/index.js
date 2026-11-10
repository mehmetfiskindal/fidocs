#!/usr/bin/env node
/**
 * Fidocs CLI: build | dev | init
 */

import path from 'node:path';

import { build } from '../core/engine.js';
import { startDevServer } from '../core/dev.js';
import { assertFormat } from '../core/config.js';
import { runCreate } from './init.js';

const HELP = `fidocs - zero-dependency documentation generator

Usage:
  fidocs <command> [options]

Commands:
  build [dir]     Build documentation to static HTML/Gea (default: .)
  dev   [dir]     Start dev server with live reload (default: .)
  init  [name]    Scaffold a docs project (asks for a name if omitted)

Options:
  --format <fmt>  Override output format: html | gea | both | embed
  --port <n>      Dev server port (default: 4321)
  -h, --help      Show this help
`;

function parseArgs(argv) {
  const args = { _: [], unknown: [], error: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') {
      const value = argv[++i];
      if (value === undefined) args.error = 'Option --format requires a value.';
      else args.format = value;
    } else if (a.startsWith('--format=')) args.format = a.slice('--format='.length);
    else if (a === '--port') {
      const value = argv[++i];
      if (value === undefined) args.error = 'Option --port requires a value.';
      else args.port = Number(value);
    } else if (a.startsWith('--port=')) args.port = Number(a.slice('--port='.length));
    else if (a === '-h' || a === '--help') args.help = true;
    else if (a.startsWith('-')) args.unknown.push(a);
    else args._.push(a);
  }
  return args;
}

function validatePort(port) {
  if (port === undefined) return;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port "${port}". Expected an integer between 1 and 65535.`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`${args.error}\n`);
    process.stdout.write(HELP);
    return 1;
  }
  if (args.unknown.length) {
    console.error(`Unknown option: ${args.unknown[0]}\n`);
    process.stdout.write(HELP);
    return 1;
  }
  if (args.help || args._.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  const command = args._[0];
  // Use path.resolve, not cwd + "/" + arg: absolute paths must stay absolute.
  const root = path.resolve(args._[1] || '.');

  try {
    if (command === 'build') {
      const previousFormat = process.env.FIDOCS_FORMAT;
      try {
        if (args.format) {
          assertFormat(args.format);
          process.env.FIDOCS_FORMAT = args.format;
        }
        const { pages, written } = await build(root);
        console.log(`[fidocs] built ${pages.length} page(s), ${written.length} file(s) written`);
        for (const w of written) console.log('  -', w.replace(root + path.sep, ''));
        return 0;
      } finally {
        if (args.format) {
          if (previousFormat === undefined) delete process.env.FIDOCS_FORMAT;
          else process.env.FIDOCS_FORMAT = previousFormat;
        }
      }
    }

    if (command === 'dev') {
      if (args.format) {
        assertFormat(args.format);
        process.env.FIDOCS_FORMAT = args.format;
      }
      validatePort(args.port);
      await build(root);
      const server = await startDevServer({ root, rebuild: () => build(root), port: args.port ?? 4321 });
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
