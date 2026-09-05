/**
 * Configuration loader. Reads fidocs.config.js (preferred) or
 * fidocs.config.json from the project root and merges with defaults.
 */

import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/** @type {object} */
export const DEFAULTS = {
  input: 'docs',
  output: 'dist',
  format: 'html', // 'html' | 'gea' | 'both'
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
    const mod = await import(pathToFileURL(jsPath).href);
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
