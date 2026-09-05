# Fidocs — geliştirici belgesi

Bu dosya **kullanıcı README’si değil**. Fidocs’un ne işe yaradığını, kodun hangi kurallara uyduğunu, mimariyi ve bir dokümanın kaynaktan çıktıya nasıl aktığını anlatır.

Kullanıcı bakışı için: [`README.md`](./README.md).  
Katkı / ajan kuralları için: [`AGENTS.md`](./AGENTS.md).

---

## 1. Fidocs neye yarar?

Fidocs, Markdown ve MDX benzeri dosyalardan **dokümantasyon sitesi üreten** bir araçtır.

Bir doküman projesinde `docs/` altındaki `.md` / `.mdx` dosyalarını okur ve şunlardan birini (veya ikisini) yazar:

| Format | Çıktı | Ne zaman |
|--------|--------|----------|
| `html` | Statik HTML sayfaları | Basit, etkileşimsiz doküman; CDN / GitHub Pages / herhangi bir statik host |
| `gea` | Çalıştırılabilir [Gea](https://www.npmjs.com/package/@geajs/core) uygulaması | MDX içinde canlı bileşenler (`<Counter />`) istiyorsan |
| `both` | İkisi birden | Örnek proje ve “ikisini de dene” senaryosu |

**Ne değildir**

- Tam bir MDX derleyici (babel / esbuild / `@mdx-js/mdx` yok).
- Tam CommonMark / GFM uygulaması.
- Tam YAML parser.
- Doküman *içeriğini* barındıran bir ürün — bu repo **jeneratörün kendisi**. Asıl içerik, tüketicinin `docs/` klasöründe durur.

İki paket vardır:

- **`fidocs`** — parser, motor, CLI (`build` / `dev` / `init`).
- **`create-fidocs`** — `npm create fidocs` ile boş bir doküman projesi iskeleler. Aynı scaffold kodu `fidocs init` ile de çalışır.

---

## 2. Kod neye uygun?

### 2.1 Tasarım sözleşmeleri (kırılmaz)

| Kural | Anlamı |
|--------|--------|
| **Sıfır bağımlılık** | `package.json` içinde `dependencies` ve `devDependencies` yok. Rollup, Terser, marked, gray-matter, chokidar eklenmez. |
| **Derleme adımı yok** | Paket `src/` altındaki ESM’i doğrudan çalıştırır. `dist/` bu repoda *kütüphane çıktısı değil*; tüketicinin ürettiği doküman çıktısıdır. |
| **Node >= 18** | `fs/promises`, `pathToFileURL`, `node:test`, `node:http`, `fs.watch`. |
| **ESM only** | `"type": "module"`. `require()` yok. |
| **Sürüm kilidi** | `package.json` ve `create-fidocs/package.json` aynı semver. Scaffold, `fidocs@^<o sürüm>` yazar. |

Testler Node’un yerleşik `node:test` koşucusuyla gider. Harici test framework’ü yok.

### 2.2 Dil ve stil

- Kaynak **JavaScript (ESM)**, TypeScript yok.
- Kamu fonksiyonlarında **JSDoc** (`@param`, `@returns`, `@typedef`).
- Node yerleşikleri `node:` önekiyle import edilir (`node:fs/promises`, `node:path`, …).
- Lisans: **MIT**.

### 2.3 Markdown / MDX / YAML — hangi “standart”?

Fidocs harici bir spec’i %100 uygulamaz; **kasıtlı alt kümeler** kullanır:

**Markdown (CommonMark alt kümesi)** — `src/parsers/markdown.js`

- Başlıklar (`#` … `######`, slug `id`)
- Paragraf, yatay çizgi
- Fenced code (` ``` ` / `~~~ `)
- Sıralı / sırasız listeler (iç içe)
- Alıntı
- Tablo (`\|` + ayırıcı satır)
- Inline: `*em*`, `**strong**`, `~~del~~`, `` `code` ``, link, görsel, satır sonu (`  \n`)
- Kaçış: `\*` vb.
- Satır içi HTML’nin dar bir listesi (`br`, `kbd`, `mark`, `span`, …)

Yok / sınırlı: setext başlık, referans link, tam HTML bloğu, GFM task list, footnote.

**MDX benzeri** — ayrı bir MDX parser yok. Blok tokenizer şunları tanır:

- `import … from '…'` satırları → `{ type: 'import' }`
- PascalCase etiketler (`<Foo />`, `<Foo>…</Foo>`) → `{ type: 'component' }`
- `{expr}` → `{ type: 'expression' }`
- küçük harfli HTML etiketleri → `{ type: 'html' }` (ham)

`src/parsers/mdx.js` ince bir sarmalayıcıdır: frontmatter + markdown parse + import/component toplama.

**Frontmatter** — YAML alt kümesi (`src/parsers/frontmatter.js`):

- Skalerler, tırnaklı string, `true`/`false`/`null`, sayı
- Satır içi dizi: `[a, b]`
- Tire listeleri, girintili iç içe map
- Tam YAML (anchor, çok satırlı `|`, tag) yok

### 2.4 Çıktı sözleşmeleri

- **HTML:** AST → string. Bilinmeyen bileşenler  
  `<div class="fidocs-component" data-component="Ad">`.  
  `config.components` ile SSR fonksiyonu verilirse `resolveComponent` çağrılır.
- **Gea:** AST → JSX. Bileşenler ve `{expr}` gerçek JSX olarak geçer; derleme `@geajs/vite-plugin`’e bırakılır. Her sayfa `class X extends Component { template() { … } }` olur.

### 2.5 Plugin sözleşmesi

Hook isimleri yükleme anında doğrulanır. Geçerli olanlar:

`onConfigLoad` · `beforeParse` · `afterParse` · `beforeGenerate` · `afterGenerate`

Transform hook’u **yeni değeri döndürmeli**. `undefined` = önceki değeri koru.

---

## 3. Depo düzeni

```
fidocs/
├── bin/
│   ├── fidocs.js              # CLI girişi → src/cli/index.js
│   └── create-fidocs.js       # iskele girişi → create-fidocs/scaffold.js
├── src/
│   ├── index.js               # kamu API (paketin "exports" noktası)
│   ├── cli/                   # argümanlar, init
│   ├── core/                  # build, config, dev sunucu
│   ├── parsers/               # markdown, mdx, frontmatter
│   ├── generators/            # html, gea, şablon
│   └── plugins/               # loader + hook runner
├── templates/base.html        # varsayılan HTML kabuğu ({{title}} …)
├── create-fidocs/             # ayrı npm paketi (aynı scaffold)
├── examples/gea-docs/         # uçtan uca örnek (format: both)
├── tests/                     # node:test
├── package.json               # fidocs
└── DEVELOPMENT.md             # bu dosya
```

Tüketici projesi (üretilen, bu repo değil) kabaca:

```
my-docs/
├── fidocs.config.js
├── docs/                      # kaynak .md / .mdx
└── dist/                      # fidocs build çıktısı
    ├── index.html             # format html | both
    └── gea-app/               # format gea | both
        ├── App.jsx
        ├── routes.js
        ├── package.json       # @geajs/core + vite
        └── *.jsx
```

---

## 4. Mimari (büyük resim)

Fidocs bir **boru hattı**. Katmanlar tek yönlü akar; parser HTML bilmez, HTML üreteci dosya sistemi bilmez.

```
                    fidocs.config.js
                           │
                           ▼
                    loadConfig()
                           │
                    loadPlugins()
                           │
                    onConfigLoad
                           │
                           ▼
              discover(input/)  →  .md / .mdx yolları
                           │
              her dosya için:
                beforeParse
                parseFile → parseMdx (frontmatter + AST)
                afterParse
                           │
                    sayfalar sıralanır
                    (frontmatter.order, sonra slug)
                           │
                    beforeGenerate
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
         emitHtml()                emitGea()
         renderHtml(AST)           generateGeaPage(AST)
         templates/base.html       App.jsx + routes.js
              │                         │
              └────────────┬────────────┘
                           ▼
                    afterGenerate
                           ▼
                    dist/  (+ isteğe bağlı HTML dev sunucu)
```

**Sorumluluk sınırı**

| Katman | Dosya | İşi | Bilmediği |
|--------|--------|-----|-----------|
| Keşif | `core/engine.js` `discover` | `.md`/`.mdx` topla | İçerik |
| Parse | `parsers/*` | Metin → AST + data + imports | Çıktı formatı |
| Plugin | `plugins/*` | Hook’larla AST/config/sonucu değiştir | Üretim detayı |
| HTML | `generators/html.js` | AST → HTML string | Gea, Vite |
| Gea | `generators/gea.js` | AST → JSX dosyası | HTTP, şablon |
| Motor | `core/engine.js` | Orkestrasyon, yazma, Gea app iskelesi | Markdown sözdizimi |
| Dev | `core/dev.js` | `fs.watch` + `node:http` + SSE reload | Parse |
| CLI | `cli/index.js` | `build` / `dev` / `init` | AST |

---

## 5. Uçtan uca: bir dosya nasıl sayfa olur?

Örnek: `docs/guide/install.md`

```markdown
---
title: Installation
order: 2
---

# Install

Use `npm create fidocs`.
```

1. **`discover`** dosyayı bulur (gizli klasör ve `node_modules` atlanır).
2. **`parseFile`**
   - `parseMdx` → `data = { title, order }`, `ast` (heading + paragraph), `imports = []`
   - **slug:** `docs/` köküne göre yol, uzantı düşer, `/index` kırpılır.  
     `guide/install.md` → slug `guide/install`.  
     `index.md` → slug `index`.
   - `title` yoksa slug’dan üretilir (`install` → `Install`).
3. **`afterParse`** plugin’ler sayfayı değiştirebilir (ör. kelime sayısı).
4. Sayfalar `order` (yoksa 999) sonra slug ile sıralanır. Bu sıra HTML nav ve Gea `Link` listesini belirler.
5. **HTML:** `dist/guide/install.html`. `index` → `dist/index.html`. Index yoksa motor bir dizin sayfası üretir.
6. **Gea:** slug PascalCase bileşen adına döner (`Guide/install` benzeri yollar `generateGeaPage` içinde `-_ /` ile bölünür). Dosya `gea-app/` altına yazılır. Yerel `import './components/Foo.jsx'` varsa dosya app dizinine **kopyalanır** ki import çözülsün.

---

## 6. Katmanlar ayrıntıda

### 6.1 Config — `src/core/config.js`

Arama sırası: `fidocs.config.js` (ESM `default` export) → `fidocs.config.json`. Yoksa tamamen varsayılanlar.

```js
{
  input: 'docs',
  output: 'dist',
  format: 'html',          // 'html' | 'gea' | 'both'
  title: 'Documentation',
  description: '',
  template: null,          // kök-göreli özel HTML şablon
  plugins: [],
  components: undefined,   // HTML SSR: { Alert: ({ children }) => '...' }
  gea: {
    dir: 'gea-app',
    jsxImportSource: '@geajs/core',
  },
}
```

Tek seferlik format: CLI `--format` → `process.env.FIDOCS_FORMAT` → `loadConfig` bunu `format` üzerine yazar.

Config **bu repoda değil**, doküman projesinin kökünde durur.

### 6.2 Parser — `src/parsers/markdown.js`

Satır satır blok tokenizer:

1. Boş satır atla  
2. Fenced code  
3. Heading  
4. HR  
5. `import`  
6. `<Tag>` (PascalCase = component, aksi = ham HTML)  
7. Blockquote  
8. Tablo  
9. Liste  
10. Paragraf  

`parseInline` soldan sağa eşleşir: kaçış, codespan, image, link, strong, em, del, `{expr}`, dar inline HTML, hard break.

**Gotcha:** `RE_EXPR` bilerek `new RegExp('...')` ile kurulur. Ham regex literal’in yanlış parse edildiği görülmüş; dokunurken `new RegExp` kalsın.

Bileşen özellikleri: `name`, `name="str"`, `name={expr}`, boolean `name`.

### 6.3 MDX sarmalayıcı — `src/parsers/mdx.js`

`parseMdx(raw)` döner:

```js
{
  data,          // frontmatter
  ast,           // { type: 'root', children }
  imports: [{ default, named, source }],
  components: ['Callout', 'Counter'],
}
```

`walk(node, visit)` AST’yi dolaşır (children, table header/rows).

### 6.4 HTML üreteci — `src/generators/html.js`

`renderHtml(ast, { resolveComponent })`.

- `import` düğümleri boş string (HTML’e yazılmaz).
- `expression` → `<span class="fidocs-expr" data-expr="…">` (statik HTML’de çalışmaz; işaretçi).
- Liste öğesinde tek paragraf varsa CommonMark “tight list” gibi inline basılır.

Şablon: `templates/base.html` veya `config.template`. Yer tutucular `{{title}}`, `{{siteTitle}}`, `{{description}}`, `{{nav}}`, `{{content}}`. Motor değerleri *kaçırılmış* halde verir; `renderTemplate` olduğu gibi yapıştırır.

### 6.5 Gea üreteci — `src/generators/gea.js`

`generateGeaPage(page)` → `{ filename, code }`.

- Sayfa class’ı `Component` extend eder, `template()` JSX döner.
- MDX `import` satırları dosyanın tepesine kopyalanır.
- `{expr}` JSX `{expr}` olarak kalır.
- Metindeki `{` `}` JSX metin kaçışına çevrilir: `{'{'}` .

`engine.emitGea` ek olarak:

- `routes.js` — `{ path, component: () => import('./X.jsx'), title }`
- `App.jsx` — `NavStore` + `RouterView`
- `package.json` — `@geajs/core`, `@geajs/vite-plugin`, `vite` (tüketici `gea-app` içinde `npm install && npm run dev` yapar)
- Yerel bileşen kopyası (`copyLocalComponents`): yalnızca `source` `.` ile başlıyorsa; path traversal’a karşı hedef `appDir` altında kalmalı.

### 6.6 Motor — `src/core/engine.js`

`build(root)`:

1. Config + plugin yükle, `onConfigLoad`
2. `input` altında keşif
3. Parse döngüsü
4. `beforeGenerate`
5. `output/` **silinir** (`rm` recursive) sonra yeniden yazılır
6. Formata göre `emitHtml` / `emitGea`
7. `afterGenerate`
8. `{ pages, written }` döner

`pages` öğesi kabaca:

```js
{
  file, rel, slug, title, order,
  data, ast, imports, components,
  // plugin’lerin eklediği alanlar (ör. wordCount)
}
```

### 6.7 Dev sunucu — `src/core/dev.js`

Sıfır bağımlılık:

- `fs.watch(docs/, { recursive: true })` — yalnızca `.md`/`.mdx`, 60 ms debounce
- `node:http` — `dist/` servis eder
- SSE: `GET /__fidocs/events` → `event: reload` → HTML’e enjekte edilen `EventSource` `location.reload()`

Path traversal: çözülen yol `output` kökünün dışında ise 403.

Not: izlenen dizin şu an sabit `docs/` (`config.input` değil). Özel `input` ile dev izlemesi sapabilir.

### 6.8 Plugin’ler

**Yükleme** (`plugins/loader.js`): spec ya `{ name, hooks }` nesnesi ya da köke göreli yol / paket adı string’i.

**Çalıştırma** (`plugins/hooks.js`): sırayla, async. Bilinmeyen hook adı → throw.

| Hook | Payload | Tipik kullanım |
|------|---------|----------------|
| `onConfigLoad` | config | varsayılanları doldur |
| `beforeParse` | `{ root, file }` | yan etki / log |
| `afterParse` | page | AST, title, ekstra alan |
| `beforeGenerate` | `{ config, pages }` | sayfa listesini süz / sırala |
| `afterGenerate` | `{ pages, written }` | rapor, kopyala |

Örnek: `examples/gea-docs/plugins/wordcount.js`.

### 6.9 CLI ve iskele

```
bin/fidocs.js  →  src/cli/index.js
  build [dir]     build(root)
  dev   [dir]     build + startDevServer
  init  [name]    runCreate → create-fidocs/scaffold.js
```

`create-fidocs` paketi aynı `scaffold.js`’i kullanır. `fidocsRange()` `create-fidocs/package.json` sürümünü okur; scaffold `fidocs@^oSürüm` yazar. Bu yüzden iki paket **aynı semver’de** tutulur.

---

## 7. Kamu API

`src/index.js` (npm `exports: { ".": "./src/index.js" }`):

```js
import {
  build, discover,
  loadConfig, DEFAULTS,
  startDevServer, watchFiles,
  parseMarkdown, parseInline, slugify,
  parseMdx, walk,
  parseFrontmatter,
  renderHtml,
  astToJsx, generateGeaPage,
  renderTemplate, escapeHtml,
  createHookRunner, loadPlugins,
  runInit, runCreate,
} from 'fidocs';

await build('/path/to/project');
```

Kütüphane kullanımı CLI ile aynı motoru çağırır; ayrı bir “runtime” yoktur.

---

## 8. Veri: AST düğümleri

Blok: `root`, `heading`, `paragraph`, `code`, `blockquote`, `list`, `listItem`, `table`, `hr`, `html`, `import`, `component`.

Inline: `text`, `strong`, `em`, `del`, `codespan`, `link`, `image`, `expression`, `inlineHtml`, `break`.

`component`: `{ type, name, props: [{ name, value }], children }`.  
`value` string, `true`, veya `{ expr: '10' }`.

Bu AST hem HTML hem Gea üretecinin **tek kaynağıdır**. Yeni bir sözdizimi eklemek = tokenizer’a düğüm eklemek + iki üreteci güncellemek + test.

---

## 9. Geliştirme komutları

```bash
npm test                                    # tests/**/*.test.js
node --test tests/markdown.test.js          # tek dosya
node --test --test-name-pattern='slug' tests/markdown.test.js
node bin/fidocs.js build examples/gea-docs  # örnek (html+gea)
node bin/fidocs.js dev examples/gea-docs --port 4321
node bin/fidocs.js init <dir>
npx ./create-fidocs <dir>
```

En hızlı uçtan uca kontrol: `examples/gea-docs/` (`format: 'both'`, MDX bileşenler, wordcount plugin).

Test haritası:

| Dosya | Konu |
|--------|------|
| `markdown.test.js` | blok / inline / slug |
| `mdx.test.js` | import, component, walk |
| `frontmatter.test.js` | YAML alt kümesi |
| `generators.test.js` | HTML + Gea string çıktısı |
| `plugins.test.js` | hook sırası, doğrulama |
| `dev.test.js` | izleme / sunucu |
| `e2e.test.js` | gerçek `build` |
| `init.test.js` | scaffold |

---

## 10. Sürümleme

Yayımlanan her değişiklikten sonra **iki** `package.json` aynı semver’e çıkar:

- **patch** — hata, paketteki doküman, iç düzen
- **minor** — kullanıcıya görünen özellik (CLI, scaffold, API)
- **major** — kırıcı CLI / API / çıktı

İnsan sürüm yükseltmez; değişiklikle birlikte yapılır.

---

## 11. Bir şeyi değiştirirken

| Hedef | Nereye bak |
|--------|-------------|
| Yeni markdown özelliği | `markdown.js` + `html.js` + `gea.js` + `tests/markdown.test.js` + `tests/generators.test.js` |
| Frontmatter anahtarı | `frontmatter.js` + `engine.parseFile` (ör. `order`) |
| HTML görünümü | `templates/base.html` veya `config.template` |
| Gea app kabuğu (nav, router) | `engine.js` `emitGea` |
| Yeni hook | `hooks.js` `validHooks` + loader sözleşmesi + test |
| CLI bayrağı | `cli/index.js` |
| Scaffold dosyaları | `create-fidocs/scaffold.js` |

Dokunulmaması gerekenler: bağımlılık eklemek, `src/`’i `dist/`’e derlemek, `RE_EXPR`’i raw literal yapmak, yalnızca bir paketin sürümünü yükseltmek.
