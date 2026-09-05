# AGENTS.md - Fidocs

## What this is

Zero-dependency documentation generator. Parses Markdown + MDX and emits
either static HTML or a runnable [Gea](https://www.npmjs.com/package/@geajs/core)
app. `format: 'both'` emits both.

## Hard constraints (do not break)

- **Zero dependencies**: no runtime AND no dev dependencies. `package.json`
  has no `dependencies`/`devDependencies`. Tests use the built-in
  `node:test` runner. Do not add Rollup/Terser/etc.
- **No build step**: the package runs directly from `src/` as ESM. `dist/`
  only ever means *generated output*, not compiled library code.
- Requires **Node >= 18**.

## Commands

```bash
npm test                                    # full suite (node --test glob)
node --test tests/markdown.test.js          # single file
node --test --test-name-pattern='slug' tests/markdown.test.js   # single test
node bin/fidocs.js build examples/gea-docs  # build example (html+gea)
node bin/fidocs.js dev <dir> --port 4321    # dev server w/ live reload
node bin/fidocs.js init <dir>               # scaffold config + docs/
npx ./create-fidocs <dir>                   # same scaffold via create-fidocs
```

## Layout / data flow

`discover()` finds `.md`/`.mdx` -> `parseMdx()` (frontmatter + AST) ->
plugin hooks -> `renderHtml()` and/or `generateGeaPage()`.

- `src/parsers/markdown.js` - block tokenizer + `parseInline`. **This is
  where MDX is handled too**: component tags (`<Foo />`, `<Foo>...</Foo>`)
  and `import` lines are recognized by the block tokenizer, not a separate
  MDX parser. `mdx.js` is a thin wrapper that extracts imports/components.
- `src/generators/html.js` - AST -> HTML. Unknown components become
  `<div class="fidocs-component" data-component="...">`; supply
  `config.components` in the project config for SSR rendering via
  `resolveComponent`.
- `src/generators/gea.js` - AST -> Gea `.jsx`. Components and `{expr}` are
  passed through as real JSX so `@geajs/vite-plugin` compiles them.
- `src/core/engine.js` - orchestration + Gea app scaffolding (copies locally
  imported component files into the app so imports resolve).

## Config (`fidocs.config.js` in the doc project root, not this repo)

Fields: `input`, `output`, `format`, `title`, `template`, `plugins`,
`components`, `gea`. One-off format override: `FIDOCS_FORMAT=gea`.

## Gotchas

- Frontmatter parser is a **YAML subset** (scalars, inline `[a,b]`, dash
  lists, nested maps) - not full YAML.
- Inline MDX expression regex (`RE_EXPR` in `markdown.js`) is intentionally
  built with `new RegExp('...')`; a raw literal for that pattern has been
  observed to mis-parse. Keep it as `new RegExp` if you touch it.
- Plugin hooks are validated at load time: `onConfigLoad`, `beforeParse`,
  `afterParse`, `beforeGenerate`, `afterGenerate`. Transform hooks should
  return the (new) payload; returning `undefined` keeps the prior value.
- Example project is `examples/gea-docs/` - the fastest end-to-end check.
