/**
 * Plugin hook runner. Hooks: onConfigLoad, beforeParse, afterParse,
 * beforeGenerate, afterGenerate.
 * @typedef {object} Plugin
 * @property {string} name
 * @property {Record<string, Function>} [hooks]
 */

/**
 * Create a hook runner bound to a plugin list.
 * @param {Plugin[]} plugins
 */
export function createHookRunner(plugins) {
  const validHooks = ['onConfigLoad', 'beforeParse', 'afterParse', 'beforeGenerate', 'afterGenerate'];

  for (const p of plugins) {
    for (const key of Object.keys(p.hooks || {})) {
      if (!validHooks.includes(key)) {
        throw new Error(`Plugin "${p.name}": unknown hook "${key}". Valid: ${validHooks.join(', ')}`);
      }
    }
  }

  return {
    /**
     * Run a transform hook sequentially; each result feeds the next.
     * @param {string} hook
     * @param {any} payload
     * @param {any[]} [args] - extra args passed to every handler
     */
    async run(hook, payload, ...args) {
      let value = payload;
      for (const p of plugins) {
        const fn = p.hooks && p.hooks[hook];
        if (typeof fn !== 'function') continue;
        const result = await fn(value, ...args);
        if (result !== undefined) value = result;
      }
      return value;
    },
  };
}
