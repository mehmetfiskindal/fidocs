# Fidocs

Zero-dependency documentation generator for Markdown and MDX with
[Gea](https://www.npmjs.com/package/@geajs/core) component support. Outputs
static HTML or a runnable Gea app.

## Requirements

- Node.js >= 18 (uses the built-in `node --test` runner)
- No npm install required: zero runtime and zero dev dependencies

## Usage

Create a new docs project:

```bash
npm create fidocs
# Project name: my-docs
cd my-docs
npm install
npm run dev
```

Local / unpublished:

```bash
npx ./create-fidocs my-docs
# or
node bin/create-fidocs.js my-docs
node bin/fidocs.js init my-docs
node bin/fidocs.js build my-docs
node bin/fidocs.js dev my-docs
```

After publishing `fidocs` and `create-fidocs` to npm, `npm create fidocs` works globally.

Options: `--format html|gea|both|embed`, `--port <n>` (dev), `--help`.

As a library:

```js
import { build, parseMdx, renderHtml } from 'fidocs';
await build('/path/to/project');
```

## Configuration (`fidocs.config.js`)

```js
export default {
  input: 'docs',
  output: 'dist',
  format: 'both',           // html | gea | both | embed
  title: 'My Docs',
  template: null,           // custom HTML template path
  plugins: ['./plugins/x.js'],
  components: { Alert: ({ children }) => `<aside>${children}</aside>` },
};
```

## Embedding into an existing Gea site

`format: 'embed'` compiles your Markdown/MDX into Gea components you can drop
into an app you already have (e.g. one created with `npm create gea@latest`),
instead of scaffolding a separate standalone site. It writes page components
plus a `routes.js` — **no** `App.jsx`, nav or `package.json`.

```js
export default {
  input: 'docs',
  output: 'src/fidocs',   // inside your Gea app's src/
  format: 'embed',
};
```

Then merge the generated routes into your own router:

```js
import { routes as docRoutes } from './fidocs/routes.js';
// spread docRoutes into your existing routes array
```

Each page is a Gea component (`GettingStarted.jsx`, `Components.jsx`, …) with
its MDX imports and `{expr}`/component usages preserved, so `@geajs/vite-plugin`
compiles them just like the rest of your app.

## Development

Architecture, pipeline, AST, plugins, and contribution constraints:
see **[DEVELOPMENT.md](./DEVELOPMENT.md)**.

```bash
npm test              # run full test suite (node --test)
npm run build:example # build the bundled example project
```

See `examples/gea-docs/` for a working project with MDX + Gea components.
