/**
 * Plugin loader. Plugins can be provided as inline objects or as
 * module specifiers / paths (strings) resolved relative to the root.
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * @param {string} root
 * @param {Array<string|object>} pluginSpecs
 * @returns {Promise<object[]>}
 */
export async function loadPlugins(root, pluginSpecs = []) {
  const plugins = [];
  for (const spec of pluginSpecs) {
    if (typeof spec === 'object' && spec && spec.name) {
      plugins.push(spec);
      continue;
    }
    if (typeof spec === 'string') {
      const abs = spec.startsWith('.') ? path.resolve(root, spec) : spec;
      const url = spec.startsWith('.') || spec.startsWith('/') ? pathToFileURL(abs).href : spec;
      try {
        const mod = await import(url);
        const plugin = mod.default || mod;
        if (!plugin.name) plugin.name = spec;
        plugins.push(plugin);
      } catch (err) {
        throw new Error(`Failed to load plugin "${spec}": ${err.message}`);
      }
    }
  }
  return plugins;
}
