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
npm create fidocs my-docs
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

Options: `--format html|gea|both`, `--port <n>` (dev), `--help`.

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
  format: 'both',           // html | gea | both
  title: 'My Docs',
  template: null,           // custom HTML template path
  plugins: ['./plugins/x.js'],
  components: { Alert: ({ children }) => `<aside>${children}</aside>` },
};
```

## Development

```bash
npm test              # run full test suite (node --test)
npm run build:example # build the bundled example project
```

See `examples/gea-docs/` for a working project with MDX + Gea components.
