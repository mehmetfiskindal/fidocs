/**
 * Configuration loader. Reads fidocs.config.js (preferred) or
 * fidocs.config.json from the project root and merges with defaults.
 */

import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

/** Supported output formats. */
export const FORMATS = ['html', 'gea', 'both', 'embed'];

/**
 * Throw a clear error for an unsupported output format.
 * @param {string} format
 */
export function assertFormat(format) {
  if (!FORMATS.includes(format)) {
    throw new Error(`Invalid format "${format}". Expected one of: ${FORMATS.join(', ')}`);
  }
}

let configLoadId = 0;

/** @type {object} */
export const DEFAULTS = {
  input: 'docs',
  output: 'dist',
  format: 'html', // 'html' | 'gea' | 'both' | 'embed'
  title: 'Documentation',
  description: '',
  template: null, // path to custom HTML template file (relative to root)
  plugins: [],
  gea: {
    dir: 'gea-app',
    jsxImportSource: '@geajs/core',
  },
};

/**
 * Load merged config for a project root.
 * @param {string} root
 * @returns {Promise<object>}
 */
export async function loadConfig(root) {
  const jsPath = path.join(root, 'fidocs.config.js');
  const jsonPath = path.join(root, 'fidocs.config.json');
  let userConfig = {};

  if (existsSync(jsPath)) {
    // Bust ESM cache so a rebuild (dev server) sees edited config values.
    const url = pathToFileURL(jsPath);
    url.searchParams.set('t', `${statSync(jsPath).mtimeMs}-${++configLoadId}`);
    const mod = await import(url.href);
    userConfig = mod.default || mod;
  } else if (existsSync(jsonPath)) {
    userConfig = JSON.parse(await readFile(jsonPath, 'utf8'));
  }

  const merged = {
    ...DEFAULTS,
    ...userConfig,
    gea: { ...DEFAULTS.gea, ...(userConfig.gea || {}) },
    root,
  };
  if (process.env.FIDOCS_FORMAT) merged.format = process.env.FIDOCS_FORMAT;
  return merged;
}
