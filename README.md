# @debutify/liquidjs

Debutify's fork of [LiquidJS](https://github.com/harttle/liquidjs) for rendering Shopify themes outside Shopify. With default options it is LiquidJS (see `NOTICE.md`). Install with `npm install @debutify/liquidjs`. It runs on Node.js 24 or newer; the browser bundles of the root entry are unchanged.

## Options added by this fork

| Option | Default | Effect |
| --- | --- | --- |
| `numberSemantics` | `'js'` | `'ruby'` keeps whole numbers and decimals apart as Shopify Liquid does (`{{ 10 \| divided_by: 4 }}` is `2`, `{{ 2.0 }}` prints `2.0`, decimal arithmetic is exact). |
| `rawTags` | `['raw']` | Tags whose bodies are never parsed; register a `RawBodyTag` subclass for each new name. A listed `comment` nests. The list replaces the default, so include `raw` to keep `{% raw %}` raw. |
| `inlineErrors` | `false` | Write render errors inline (`Liquid error (line 1): …`) and keep rendering; collect them with `render(tpl, scope, { errors })`. |
| `topLevelSize` | `true` | `false` makes an undefined top-level `size` print nothing, as Ruby Liquid does, instead of the number of keys in the render's globals as upstream LiquidJS does; a `size` that a scope or the globals define, and the `size` of a value (`list.size`), are not affected. The Shopify preset sets it to `false`. |
| `bugCompatibleWhitespaceTrimming` | `false` | `true` trims as Ruby Liquid's `bug_compatible_whitespace_trimming` parse option, which Shopify's storefront parses themes with: when `{%-` or `{{-` strips the text before it to nothing, the text keeps its first character, so `{{ a }}\n  {%- if b %}` keeps the newline. The Shopify preset sets it to `true`. |

```js
const { Liquid } = require('@debutify/liquidjs')
const liquid = new Liquid({ numberSemantics: 'ruby', rawTags: ['raw', 'comment'], inlineErrors: true })

const errors = []
liquid.parseAndRender('{{ 10 | divided_by: 4 }} {{ 2.0 }} {{ 1 | divided_by: 0 }}', {}, { errors }).then(html => {
  console.log(html)          // 2 2.0 Liquid error (line 1): divided by 0
  console.log(errors.length) // 1
})
```

Details that do not fit the table:

- With `numberSemantics: 'ruby'`, decimal values that reach API callers (`evalValue`, `evalValueSync`, values written by `assign`) are `LiquidFloat` objects: read `.value`, or use `Number(x)`.
- A `rawTags` list replaces the default `['raw']` instead of adding to it. Without `raw` in it, the body of `{% raw %}` is parsed as Liquid, so `rawTags: ['comment']` makes `{% raw %}{{ x {% endraw %}` a tokenization error.
- Setting `rawTags` explicitly, even to the default list, lets an end tag carry a whitespace-control marker in the forms `{%- endraw -%}`, `{% endraw-%}` and `{%- endraw %}`. Under the default list those three stay unclosed, as in upstream LiquidJS, while `{% endraw -%}` closes either way.
- With `inlineErrors`, an error in a tag that prints nothing (`assign`, `capture`, a block with a blank body) is recorded in `errors` and not written.
- With `inlineErrors`, an undefined variable is recorded and not written, but it is an error only under `strictVariables`; by default nothing is recorded.
- With `inlineErrors`, an undefined filter is recorded and not written only when it is met while rendering, for example inside a grouped expression (`groupedExpressions`). Under `strictFilters` a misspelt filter in an ordinary tag is a parse error and still throws, as in upstream LiquidJS, and without `strictFilters` it is not an error at all.
- With `inlineErrors`, a syntax error met while rendering, such as in a partial parsed at render time, is written as `Liquid syntax error (<file> line <n>): <message>`. A syntax error in the template you pass to `parse` still throws, and so does a limit error (`memoryLimit`, `renderLimit`, `parseLimit`). A limit hit while rendering arrives wrapped in a `RenderError`, so test what you catch with `isLimitError(err)`, which looks through `originalError`; `LimitError.is(err)` is false for the wrapper.
- With `topLevelSize: false`, `{{ size }}` prints nothing, `{% if size %}` is false and `{{ size | default: 'M' }}` prints `M` when nothing defines `size`. Under `strictVariables` an undefined `size` throws like any other undefined variable.
- With `bugCompatibleWhitespaceTrimming: true`, a text that a `-%}` or `-}}` already stripped to nothing keeps nothing, a text with anything but whitespace in it is stripped as before, and the body of a raw tag is never trimmed.

All five defaults are upstream LiquidJS's behaviour, so none of these options changes anything until you opt in.

One behaviour differs from upstream without an opt-in: the `slice` filter charges `memoryLimit` for the length of the array or string it returns, where upstream LiquidJS 10.30.0 charges the length it was asked for, so `{{ list | slice: 0, 1000 }}` over a short array no longer hits a low `memoryLimit`. It only matters once you set `memoryLimit`, which is unlimited by default; the Shopify preset sets it.

## Shopify themes: `@debutify/liquidjs/shopify`

The `/shopify` entry point renders Shopify Online Store 2.0 themes without a Shopify store: a preset engine with Shopify's tags and filters, store objects built from data you pass in, and a theme runtime that renders whole pages or single sections and reports what it could not render faithfully. The root entry, `@debutify/liquidjs`, stays plain LiquidJS.

With the Shopify layer, import `Drop`, `LiquidFloat` and any other engine class from `@debutify/liquidjs/shopify`; a Drop built on the root entry's class reads as empty under the preset.

The `./shopify` entry of the package's `exports` map has `types`, `module` and `default` conditions, and no `import` or `require` condition. Bundlers that read `module` take the ES module build, `dist/shopify.node.mjs`; plain Node, whether the caller uses `import` or `require`, takes `default`, the CommonJS build `dist/shopify.node.js`. The `/shopify` entry is for Node: it imports Node's `stream`, `path`, `fs`, `module` and `crypto` and has no browser build, which the root entry keeps.

What each tag, filter and object prints follows its page in shopify.dev's [Liquid reference](https://shopify.dev/docs/api/liquid); where shopify.dev does not pin an output, the package follows the closest documented behaviour or Shopify Liquid's own tests, and the case is listed under [Behaviours still to confirm on Shopify](#behaviours-still-to-confirm-on-shopify).

The preset parses templates as Shopify's storefront does. Its whitespace control is bug-compatible (`bugCompatibleWhitespaceTrimming`): a heading that prints `{{ heading }}`, a newline and `{%- if accent -%}` keeps that newline, as liquid-spec's Dawn recordings and Shopify's own Dawn demo store show. An `if`, `unless`, `case` or `for` whose every branch is blank, holding only whitespace and tags that print nothing (`assign`, `capture`, `comment`, an empty `raw` or `doc`, and blocks as blank as these), prints nothing at all, as Ruby Liquid drops the text of such a block (`remove_blank_strings` in Shopify/liquid's `if.rb`, `for.rb` and `case.rb`); a `tablerow` keeps its text, as in Ruby.

### Render a page

Run this as an ES module (a `.mjs` file, or `"type": "module"` in `package.json`).

```js
import { renderPage, renderSection } from '@debutify/liquidjs/shopify'

const theme = {
  files: {
    'layout/theme.liquid': '<!doctype html><html><head>{{ content_for_header }}</head><body>{{ content_for_layout }}</body></html>',
    'templates/product.json': '{ "sections": { "main": { "type": "main-product" } }, "order": ["main"] }',
    'sections/main-product.liquid': '<h1>{{ product.title }}</h1>{{ product.price | money }}<link rel="stylesheet" href="{{ "product.css" | asset_url }}">{% schema %}{ "name": "Product" }{% endschema %}'
  }
}

const services = { assetUrl: (path) => `https://cdn.example.com/assets/${path}` }

const { html, report } = await renderPage({ theme, templateName: 'product', request: { resource: 'black-sunnies' }, services })
// html ends with <body><div id="shopify-section-template--product__main" class="shopify-section"><h1>Black Sunnies</h1>$50.00<link rel="stylesheet" href="https://cdn.example.com/assets/product.css"></div></body></html>
// report.errors is [] and report.sections[0].status is 'rendered'

const { html: section } = await renderSection({ theme, templateName: 'product', section: 'main', request: { resource: 'black-sunnies' }, services })
// section is <div id="shopify-section-template--product__main" class="shopify-section"><h1>Black Sunnies</h1>$50.00<link rel="stylesheet" href="https://cdn.example.com/assets/product.css"></div>
```

From CommonJS, which has no top-level `await`, use `require` with `.then` (with the `theme` and `services` objects from above):

```js
const { renderPage } = require('@debutify/liquidjs/shopify')

renderPage({ theme, templateName: 'product', request: { resource: 'black-sunnies' }, services }).then(({ html }) => console.log(html))
```

`theme.files` holds every file of the theme by path; the package never reads the file system. Keep the same `theme` object between renders: it is parsed once, and a file you edit in `theme.files` is re-parsed on the next render. Without `data`, pages render with the package's public sample store (`sampleStoreData`): Shopify's mock.shop `demostore` catalogue (https://mock.shop), 29 apparel products such as `black-sunnies` (Black Sunnies, $50.00), the collections `men`, `women`, `unisex`, `tops`, `bottoms`, `accessories`, `featured` and `shoes`, the pages `contact` and `liquid`, the blog `news` and the `main-menu` and `footer` menus, which is why `request: { resource: 'black-sunnies' }` finds a product in the example. Its product images are on Shopify's CDN. To render your own store, pass `data`, a `StoreData` object (an exported type, with `sampleStoreData` as a model of one; `sampleStoreData` is frozen all the way down, so to change it pass a copy, `data: structuredClone(sampleStoreData)`, edited first). `t` reads translations from `locales/<locale>.json`, `locales/<locale>.default.json` and the `.schema.json` variants in `theme.files`. A template the theme does not have rejects.

The options of `renderPage` are `theme`, `templateName` (`index`, `product`, `page.contact`, `customers/login`), `data` (a `StoreData` object), `locale`, `request` (`path`, `host`, `origin`, `page`, `resource`, `context` for contextual section groups, `searchTerms`, `recommendations` for a [Product Recommendations API](https://shopify.dev/docs/api/ajax/reference/product-recommendations) request with its `productId`, `limit` and `intent`), `services`, `trustLiquidSettings`, `trustHtmlSettings`, `unknownTags`, `parseLimit`, `renderLimit` and `memoryLimit`. `renderSection` takes the same options plus `section`: the id `renderPage` reports for it (`template--product__main`), a key of the template's `sections` (`main`) or the name of a static section. It returns `html`, `report` and `assets`, the bodies of the `{% stylesheet %}` and `{% javascript %}` tags that ran while the section rendered. A section the page does not have renders nothing and is reported.

The templates follow shopify.dev's [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates), [section groups](https://shopify.dev/docs/storefronts/themes/architecture/section-groups), [section schema](https://shopify.dev/docs/storefronts/themes/architecture/sections/section-schema) and [theme blocks](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks) pages, and `renderSection` the [Section Rendering API](https://shopify.dev/docs/api/ajax/section-rendering), which returns a section's HTML alone. The bodies of `{% stylesheet %}` and `{% javascript %}` tags are inlined into `content_for_header`; shopify.dev says Shopify serves them [through `content_for_header`](https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags), and inlining them is Debutify's choice.

### Render one template or snippet

```js
import { createShopifyLiquid, renderLiquid } from '@debutify/liquidjs/shopify'

const liquid = createShopifyLiquid({ files: { 'snippets/price.liquid': '{{ price | money }}' } })
const { html, report } = await renderLiquid(liquid, "{{ 1999 | money }} {{ 10 | divided_by: 4 }} {{ 'Hello World' | handleize }} {% render 'price', price: 500 %}")
// html is "$19.99 2 hello-world $5.00" and report.errors is []
```

`files` holds the snippets and layouts that `render`, `include` and `layout` read (`{% render 'price', price: 500 %}` reads `snippets/price.liquid`). `renderLiquid(liquid, source, scope)` starts every call from a fresh state, so two renders never share a report, and its `scope` is the template's scope; it takes no render options. With `liquid.parseAndRender(source, scope, { globals })`, the globals you pass replace the engine's `globals` option, as in LiquidJS; the preset keeps its own Shopify state either way. `createShopifyLiquid` takes `files`, `services`, `translator`, `moneyFormat`, `moneyWithCurrencyFormat`, `unknownTags`, `parseLimit`, `renderLimit`, `memoryLimit` and `engine`, a LiquidJS options object applied last, over the preset. Trusted mode for settings is not among them: settings objects are built by `renderPage` and `renderSection`, which take it (see [Safety](#safety)).

### Services

The package never fetches anything and names no host of its own: the only literal hosts are the video players' embed URLs that `external_video_url` and `external_video_tag` write (`https://www.youtube.com/embed/` and `https://player.vimeo.com/video/`), and the SVG namespace in the default artwork is not a host. URLs, artwork, fonts and the clock come from `services`, which both `renderPage` and `createShopifyLiquid` accept; every one has a host-free default, and the defaults are Debutify's stand-ins, not Shopify's output. `defaultServices` is frozen: to change a service, pass your own function in the `services` option, which is merged over the defaults for that call.

| Service | Used by | Default |
| --- | --- | --- |
| `assetUrl(path)` | `asset_url` | `/assets/<path>` |
| `shopifyAssetUrl(path)` | `shopify_asset_url` | `/shopify-assets/<path>` |
| `imageUrl(image, params)` | `image_url`, `image_tag`, `img_url` | the image's `src` with Shopify-style sorted query parameters |
| `fontUrl(font, format)` | `font_url`, `font_face` | `/fonts/<handle>.<format>` |
| `fontFace(font, options)` | `font_face` | Shopify's `@font-face` rule built from `fontUrl` |
| `fontInfo(handle)` | `font_picker` settings, `font_modify` | parsed from the handle (`assistant_n4`) |
| `placeholderSvg(name)` | `placeholder_svg_tag` | Debutify's own line drawing for each name the filter's page lists, with no background |
| `paymentTypeSvg(type)` | `payment_type_svg_tag` | a plain card outline |
| `currentTime()` | `'now' \| date`, `time_tag` | the system clock |

### The render report

Every render returns a `report` with `unknownTags`, `unknownFilters` and `stubbedFilters` (name, count, files), `missing` (templates, layouts, sections, section groups, blocks, snippets, translations and resources the theme named but the theme or data did not have), `unsupported` (features and inputs the package could not render faithfully, such as app blocks), `errors` (inline errors with file and line), `sections` (each section's id, type, location, status and time) and `timing`.

A `missing` entry's `kind` and an `unsupported` entry's `feature` are snake_case values of the exported types `MissingKind` (`template`, `layout`, `section`, `section_group`, `block`, `snippet`, `translation`, `resource`) and `UnsupportedFeature` (`invalid_setting`, `unsafe_url`, `unsafe_key`, `app_block`, `blocks`, `section_group`, `wrapper` and the rest, including the name of a filter that could not use its input, such as `color_darken`), so a caller can switch on them. Report strings are plain text, not HTML: the names and files of `unknownTags`, `unknownFilters` and `stubbedFilters`, the names of `missing` and the details of `unsupported` have `<` and `>` removed but can still hold quotes and ampersands, and the messages of `errors` and the entries of `sections` are not filtered at all, so escape every report string when you show it as HTML.

An unknown filter returns its input and an unknown tag renders nothing, so one gap never blanks a section. `unknownTags: 'error'`, an option of `createShopifyLiquid`, `renderPage` and `renderSection`, makes an unknown tag a parse error instead (`Unknown tag 'name'`); under `renderPage` the file that holds it then fails like any file that does not parse. shopify.dev documents neither behaviour nor the text of an inline error (`Liquid error (sections/header line 12): …`); they follow the recordings in Shopify's [liquid-spec](https://github.com/Shopify/liquid-spec).

### Filter status

`shopifyFilterRegistry()` lists every filter in Shopify's [theme-liquid-docs](https://github.com/Shopify/theme-liquid-docs) with a status: `exact` (matches output recorded from Shopify), `approx` (implemented from shopify.dev, not yet matched against Shopify), `stub` (documented but not implemented: renders nothing and is reported) or `engine` (a standard Liquid filter provided by the engine). This release has 154 filters: 56 `engine`, 52 `approx`, 46 `stub`, none `exact` yet; a filter becomes `exact` only after it matches output recorded from a Shopify store. `shopifyFilterRegistry()` returns new entries on every call, so editing them changes nothing. `shopifyFilterRegistry().filter((filter) => filter.status === 'stub')` lists the stubs, among them `md5`, `sha1`, `hmac_sha1`, `base64_url_safe_encode`, `base64_url_safe_decode`, `asset_img_url`, `file_url`, `payment_type_img_url` and `inline_asset_content`.

### Public API

From 1.0.0, semver covers what `@debutify/liquidjs/shopify` exports, and nothing else:

- the functions `createShopifyLiquid`, `renderLiquid`, `renderPage`, `renderSection`, `compileTheme`, `parseWrapper` and `shopifyFilterRegistry`, and the values `defaultServices`, `sampleStoreData` and `SHOPIFY_DEFAULT_LIMITS`;
- the types of their options and results (`ShopifyLiquidOptions` with `BaseTemplates`, `RenderLiquidResult`, `ThemeInput`, `RenderPageOptions`, `RenderPageResult`, `RenderSectionOptions`, `RenderSectionResult`, `RequestInput`, `RecommendationsRequest`, `ShopifyServices`), `CompiledTheme` (a type only: it is what `compileTheme` returns, and the class itself is not exported), the report types (`RenderReport`, `CountEntry`, `ErrorEntry`, `MissingEntry`, `MissingKind`, `SectionEntry`, `UnsupportedEntry`, `UnsupportedFeature`) and the data types (`StoreData` with `ShopData`, `ProductData`, `VariantData`, `MediaData`, `ImageMediaData`, `VideoMediaData`, `VideoSourceData`, `ExternalVideoMediaData`, `CollectionData`, `PageData`, `BlogData`, `ArticleData`, `LinkData`, `LinkListData`, `CartData`, `LocalizationData`, `CountryOptionData`, `FilterData`, `GiftCardData`, `CustomerData`, `AddressData`, `OrderData`, `OrderLineData`, `FulfillmentData`, `TransactionData` and `Metafields`, then `SectionData`, `BlockData`, `ImageData`, `ImageUrlParams`, `FontInfo`, `LocaleTree`, `SettingDefinition`, `FilterStatus` and `ShopifyFilterEntry`);
- `Translator` and `TranslationsInput`, for the `translator` option;
- the drops a custom filter can be given (`SettingsDrop`, `ImageDrop`, `ImageUrlDrop`, `ColorDrop`, `ColorSchemeDrop`, `FontDrop`, `VideoUrlDrop`, `ExternalVideoUrlDrop`), for `instanceof` checks and their Liquid properties;
- the Shopify tag classes (`SchemaTag`, `JavascriptTag`, `StylesheetTag`, `DocTag`, `StyleTag`, `FormTag`, `PaginateTag`, `SectionTag`, `SectionsTag`, `ContentForTag`, `ShopifyLayoutTag` and `ShopifyTablerowTag`); `ShopifyTablerowTag` and `ShopifyLayoutTag` carry the prefix so that they do not shadow the root's `TablerowTag` and `LayoutTag`, which stay the plain engine's classes under `/shopify` as they are in the root entry;
- every name of the root entry, which `/shopify` re-exports.

The constructors of the drops and tags and the members of a `CompiledTheme` other than `templates(path)` (which parses one Liquid file of the theme and throws its parse error) are internal and may change in any release. So is anything imported from a deeper path (`@debutify/liquidjs/dist/...`): it is not covered, even where the `exports` map lets you resolve it.

### Safety

Theme files come only from the `files` map: no file-system access and no `require`. A theme may be laid over another with `ThemeInput.base`: a file in its `files` replaces the base's file at the same path and every other file comes from the base, which `compileTheme` parses once for every theme laid over it; give each version of a theme its own object, and do not edit the files of a base after a theme was compiled over it. The preset turns on `ownPropertyOnly` and sets `parseLimit` (10,000,000 characters per file), `renderLimit` (2,000 ms per render) and `memoryLimit` (100,000,000 of LiquidJS's allocation units per render); `createShopifyLiquid` takes all three and `unknownTags` (`ShopifyLiquidOptions`), `renderPage` and `renderSection` take the same four (`RenderPageOptions`, which `RenderSectionOptions` extends), and `compileTheme` takes `parseLimit` and `unknownTags`, so callers may lower the limits at each of them; `renderLiquid` takes none, because it renders with the engine you give it. `SHOPIFY_DEFAULT_LIMITS` is frozen: to change a limit, pass it as an option of the call. A render that runs past `renderLimit` or `memoryLimit` rejects instead of returning a page (`template render limit exceeded`, `memory alloc limit exceeded`); test what you catch with `isLimitError(err)`, as the options section above describes. These limits are cooperative, not isolation: render themes you did not write in a worker thread or child process with memory limits and a kill timeout, as LiquidJS's [security model](https://liquidjs.com/tutorials/security-model.html) advises.

Setting values are treated as untrusted by default, which is different from Shopify. On shopify.dev's [input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings) page, a `liquid` setting accepts "HTML and limited Liquid markup" that Shopify renders, and an `html` setting has only `<html>`, `<head>` and `<body>` removed; the page says nothing about sanitising them, so Shopify in effect trusts the merchant who writes them. Debutify's preset is built for settings that an AI model or a user wrote, so it does the opposite until you opt in:

- A `liquid` setting prints as escaped text, so `{{ shop.name }}` and markup in it show up literally.
- An `html` setting passes an allowlist sanitiser that keeps formatting markup and links and drops scripts, styles, frames, forms, event handlers, inline styles and every URL scheme but `http`, `https`, `mailto` and `tel`. It is not a general-purpose sanitiser; it only makes setting values safe to print. Any other text setting (`text`, `textarea`) that contains `<` goes through the same sanitiser, and plain text prints byte for byte as stored.
- `richtext` and `inline_richtext` settings are always sanitised, whichever mode you choose.
- Every other setting type is held to the form shopify.dev documents for it, because Shopify's editor writes only those forms. A `url` or `video_url` with a quote, angle bracket, backtick, whitespace or control character, with a character reference to a quote or a number (`&#39;`, `&quot;`, `&apos;`), or with a scheme other than `http`, `https`, `mailto` and `tel`, is dropped (relative paths, `/…`, `#…` and `shopify://…` pass). A `select`, `radio` or `text_alignment` must hold one of its options. A `range` and a `number` must be finite numbers, and a `range` is clamped to its `min` and `max`. A `checkbox` must be a boolean, and one that is unset with no `default` reads `false`, as shopify.dev says. A `color` must be hex, `rgb()` or `hsl()` (alpha forms included), so a named colour such as `red` is rejected, and a `color_background` must be a colour or a plain gradient: `linear-gradient`, `radial-gradient`, `conic-gradient` and their `repeating-` forms around colours, so a value that calls any other function, such as `url()`, is rejected. An `image_picker` given as data needs a URL-shaped `src` (held to the same rules as a `url`) and numeric `width`, `height`, `id` and `focal_point`, and an `alt` whose apostrophes become typographic ones (`Women's dress` reads `Women’s dress`, which cannot end a single-quoted attribute); an `alt` that still has a double quote, angle bracket, backtick or control character is dropped, and the image stays. A colour scheme's id may hold only letters, digits, `-` and `_`. A `metaobject` or `metaobject_list` setting holds no metaobject here, so a string stored in it follows the text rule above.
- In untrusted mode the JSON that places sections and blocks is held to the same rule, because themes print `section.id`, `block.id` and `block.type` in ids, class names, attributes and `<style>`. A section key, a block key and a block `type` may hold only letters, digits, `-` and `_` (Shopify's own are of that form), a block `type` may also be `@app` or the `shopify://apps/…/blocks/…/…` form of an app block, and a section group's `type` may also hold `.` (`custom.<name>`). Anything else is skipped (a group `type` falls back to the group's name) and reported under the feature `unsafe_key` without the key. A template `wrapper` with an event-handler attribute (a name starting with `on`, in any case) or a `style` attribute is not applied, so the page renders without a wrapper, and is reported under the feature `wrapper`; `parseWrapper(spec, trusted)` takes `true` as its second argument to accept them, which is what trusted mode passes. In either mode the value of a wrapper's `[name=value]` attribute is escaped, so `&`, `<`, `>`, `"` and `'` are written as `&amp;`, `&lt;`, `&gt;`, `&quot;` and `&#39;`.
- A rejected value falls back to the setting's default (or to what an unset setting of that type reads) and is listed in `report.unsupported` under the feature `invalid_setting`, `unsafe_url`, `unsafe_key` or `color_scheme`; the entry never contains the rejected value. Stored keys that are not declared and carry a quote, angle bracket, backtick or control character are dropped the same way (feature `unsafe_key`). A resource setting whose handle names nothing is listed in `report.missing` by its setting (`product of setting featured`), not by the handle, an unknown `font_picker` font is reported without its handle, and a missing section or block `type` shows as `(unsafe name)` unless it is made of letters, digits and `. _ - / : @`, because the report may be shown as HTML.
- `json`, `jsonify` and `inspect` always write `/` as `\/` and `<`, `>`, `&`, U+2028 and U+2029 as `\uXXXX` escapes, whichever mode you choose, so a stored value or key cannot end a `<script type="application/json">` block; the escaped text parses to the same JSON. `\/` is what Shopify prints (it is recorded on liquid-spec's Dawn pages); shopify.dev says nothing about escaping and no recording holds the other characters, so those escapes are Debutify's choice.

To opt into trusted mode, pass `trustLiquidSettings: true` for `liquid` settings and `trustHtmlSettings: true` for every other rule above (sanitising, the form checks, the dropped keys, the key rule for sections and blocks, the `wrapper` rule) to `renderPage` or `renderSection`. Do that only for themes whose author you trust; the `json` escapes stay on. Trusted `liquid` settings render with the scope of the place where they print, to at most five levels of nesting; shopify.dev says Shopify withholds `section`, `settings` and a few tags from them, and this package does not. A trusted `html` setting loses its `<html>`, `<head>` and `<body>` tags, as shopify.dev says, and prints the rest as stored: shopify.dev says Shopify closes unclosed tags when the setting is saved, and this package does not, so a tag left open stays open in the page.

Trusted mode is set only on `renderPage` and `renderSection`, which build the settings objects; `createShopifyLiquid` and `renderLiquid` take no trust options.

Untrusted mode keeps setting values out of script and markup contexts, but a few things stay with the caller. A text-like setting prints byte for byte, so it can still close an attribute that a theme prints it into without `| escape` (`class="{{ section.settings.cls }}"` with `x" onmouseover="alert(1)`), and it is a `javascript:` link wherever a theme uses a text setting as a URL (`href="{{ section.settings.label_link }}"`, `link_to`); `json` output inside an attribute needs `| escape` too, because it escapes `<`, `>`, `&` and `/` for a script block and leaves quotes as they are. `StoreData` and `request` values are printed exactly as given, so sanitise them yourself when you do not trust them. Serve previews from a sandboxed origin, and run a theme check for unescaped text settings in attributes and for text settings used as URLs on any theme you give untrusted settings.

### Conformance

Shopify's liquid-spec runs in CI on the Shopify preset, including the recordings of Shopify's Dawn theme. The numbers, what the build gates on, the known gaps and the [behaviours still to confirm on Shopify](#behaviours-still-to-confirm-on-shopify) follow under [Shopify compatibility](#shopify-compatibility).

## Shopify compatibility

On the Shopify preset (`createShopifyLiquid`), 4005 of the 4585 specs in Shopify's [liquid-spec](https://github.com/Shopify/liquid-spec) (commit 84bf25e) pass (87.4%), and 13 of the 26 specs recorded from Shopify's Dawn theme pass (the other 13 need Dawn's snippets, see Known gaps). CI runs them on every push to `master` and on every pull request, and gates on the per-spec baseline in `spec/liquid-spec/baseline.json`: a spec that passed must keep passing, and the pass count may not drop.

The figures count the specs the adapter runs, not every spec in the gem. `spec/liquid-spec/adapter.rb` skips the specs that need Ruby objects or bytes that JSON cannot carry (Ruby drops and types, drop class names, randomness, binary data, template factories, `self` shadowing the environment), the range resource limits and the strict2 blank-body errors, and five Shopify feature groups (`shopify_includes`, `shopify_blank`, `shopify_error_handling`, `shopify_error_format`, `shopify_string_access`) stay switched off because each has failing specs. liquid-spec records its specs from Ruby Liquid without bug-compatible trimming, so `spec/liquid-spec/server.mjs` runs the preset with `bugCompatibleWhitespaceTrimming: false`; the Dawn suite compares whitespace-normalised HTML, so this changes no Dawn result, and the preset's own tests cover the bug-compatible mode. Most of the other known failures are differences in the core engine inherited from LiquidJS: parser edge cases and error texts, `for` loop `limit` and `offset` permutations, and Ruby `inspect` text.

### Known gaps

Shopify features the package does not have yet, most of them seen as failing liquid-spec specs:

- `base64_url_safe_encode` and `base64_url_safe_decode` are stubs (15 specs), as are `md5`, `sha1` and `hmac_sha1`.
- `date` and `time_tag` lack some strftime directives: `%F %D %T %R %r %v` print the directive, `%V %G %g` (ISO week) are not expanded, and `%c %x %X` print locale text where Ruby prints `Mon Jun 15 14:30:45 2020`, `06/15/20` and `14:30:45`; a string's own offset (`-0400`) is dropped, so `%z` prints `+0000`, and an empty format does not print Ruby's default (`2020-06-15 14:30:45`).
- `render … for items` without `as` loops but does not bind the partial's name (`render … for items as name` does), `include … for` does not loop over the collection, `include … with value as name` does not bind `name`, and an `include … with` followed by a named argument (`{% include 'font' with multiplier: 1.5 %}`) binds differently from Shopify's lax parser.
- `string.first` and `string.last` print nothing (shopify.dev does not pin them; liquid-spec expects them to work).
- Bracket access `a['size']` returns the length, where Shopify reads nil.
- Ruby's comparison errors (`comparison of String with 1 failed`) are not reproduced.
- `tablerow` differs from Shopify on a string collection (one cell, `limit` and `offset` ignored), on a `limit` that is not a number (Shopify raises `invalid integer`) and on `break` and `continue` inside it.
- A recursive `render` or `include` runs to `renderLimit` (`template render limit exceeded`) instead of stopping at `Nesting too deep`.
- `ifchanged` is not implemented and is reported as an unknown tag.
- Dawn's snippet files are not vendored, because Dawn's licence limits use to building Shopify themes, so the 13 Dawn specs that render them cannot pass.
- Search results are not ranked by Shopify's relevance: they come in store order (products, pages, articles). The parity store ranks `probe-search-type-product` as gray-leather-sneakers, canvas-sneakers, high-top-sneakers, white-leather-sneakers, and `probe-search-shirt` lists the article liquidpeak-450 before new-line-of-tennis-products where `probe-search-prefix` lists them the other way round; no rule of plain matching gives these orders, and the fixture tests compare those two results as sets.

### Behaviours still to confirm on Shopify

shopify.dev does not pin these outputs, or pins only part of the filter, tag or object a line belongs to, so the package follows the closest documented behaviour or Shopify Liquid's own tests and the filter stays `approx` until it is compared with a Shopify store. Each line names the part that stays open, and links the shopify.dev page where there is one.

**Tags**

- [`form`](https://shopify.dev/docs/api/liquid/tags/form): the position of extra attributes beyond the documented example; the `customer_address` form for an existing address; `form.id` for form types other than `customer_address`.
- [`render`](https://shopify.dev/docs/api/liquid/tags/render) given a block (`{% render block %}`, `{% for child in block.blocks %}{% render child %}{% endfor %}`): a theme block renders as `content_for` renders it, in its wrapper unless its schema says `"tag": null` (shopify.dev documents `{% render block %}` only for app blocks, so the theme-block case is Debutify's reading); an app block prints nothing and is reported; parameters after a block are not passed. Any other value that is not a string (a number, an object) is a render error, `render needs a snippet name or a block, not a number`, in Debutify's words.
- `form` of type `product` inside a section: after `product-id` it adds `<input type="hidden" name="section-id" value="<the section's id>" />`, which Shopify's Dawn demo store prints today and no Dawn file prints, but which shopify.dev does not document (its example renders outside a section) and liquid-spec's older Dawn recording lacks, together with `product-id`.
- Blankness of Shopify's own `schema`, `javascript` and `stylesheet` tags, which print nothing where they stand: they count as blank here, so an `if` holding only one of them and whitespace prints nothing. Ruby Liquid does not have these tags, and shopify.dev does not say.
- [`form` object](https://shopify.dev/docs/api/liquid/objects/form): its example key is `password_needed?` while its property list says `password_needed`; only `password_needed` exists here.
- `form` of type `localization` or `currency`: an explicit `return_to` replaces the default instead of adding a second input.
- [`paginate`](https://shopify.dev/docs/api/liquid/tags/paginate) and [`default_pagination`](https://shopify.dev/docs/api/liquid/filters/default_pagination): the default `window_size` (3) and the markup for windows wider than the documented example.
- `paginate` past its pages or past the 25,000 item limit shows the last page it reaches.
- `paginate` reads `<name>_count` (`collection.products_count`) as the total, and takes a shorter array as the page already fetched.
- `paginate` clamps page sizes outside 1 to 250, prints a `current` part for a lone page, and always uses `page` as the `page_param` key.
- [`javascript` and `stylesheet`](https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags): a second tag in one file is a syntax error on Shopify, and the first body wins silently here.

**Translations and text**

- [`t`](https://shopify.dev/docs/api/liquid/filters/translate): the text for a missing key (`translation missing: <locale>.<key>`, escaped), whether interpolated values are part of the translated content (here an `_html` key prints them as they are, so a template should escape data it passes in, and any other key escapes them with the rest), and a `zero` key winning for `count: 0` in every locale.
- Locale fallback ([storefront locale files](https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files)): a missing key falls back to the default locale and `fr-CA` to `fr`, and within a locale the locale file is searched before the section's schema `locales`.
- [`money`](https://shopify.dev/docs/api/liquid/filters/money): nil prints nothing, a boolean, array or hash prints nothing and is reported, a string is read like Ruby's `to_i` (`"abc"` is `$0.00`), a fraction of a cent is dropped and a negative amount prints `$-1.50`, all as in liquid-spec's reference filters.
- [`money_without_currency`](https://shopify.dev/docs/api/liquid/filters/money_without_currency) for a format with other placeholders (the first placeholder is used), and the space between amount and currency code in `money_with_currency`.
- [`date`](https://shopify.dev/docs/api/liquid/filters/date) and [`time_tag`](https://shopify.dev/docs/api/liquid/filters/time_tag): a string without a zone is read as UTC, and the zone Shopify renders in is not pinned; a time in a skipped or repeated hour of a DST zone; a timezone argument, which the engine's `date` takes second and the page does not have.
- `date` and `time_tag`: every named format except `abbreviated_date`, and the text of the error for an unknown named format (Debutify's).
- `date` with a named `timezoneOffset` set through `engine` can print a time an hour off near a DST change when the machine itself is in a DST zone, an issue in the core LiquidJS date code.
- [`escape`](https://shopify.dev/docs/api/liquid/filters/escape) writes `&quot;` and `&#39;` as Ruby does, and `escape_once` counts named and decimal entities as already escaped.
- [`pluralize`](https://shopify.dev/docs/api/liquid/filters/pluralize) with a fractional or negative count reads it like Ruby's `to_i`, so `1.5` is singular; [`within`](https://shopify.dev/docs/api/liquid/filters/within) on a collection without a URL returns the URL unchanged.
- [`link_to`](https://shopify.dev/docs/api/liquid/filters/link_to) always writes `title=""` and `rel="nofollow"` as the page's examples do; whether Shopify drops `rel` for the shop's own pages is not pinned.
- [`handleize`](https://shopify.dev/docs/api/liquid/filters/handleize) on non-ASCII text and on characters the page's one example does not show follows liquid-spec's reference algorithm.
- `format_code` is not on shopify.dev; it groups a gift card code in fours.

**Media**

- [`image_tag`](https://shopify.dev/docs/api/liquid/filters/image_tag): the default `srcset` widths above 352; the section index after which images are lazy-loaded (after the third section of a location here); `preload: true` only stops the automatic `loading="lazy"`, because a string render cannot send a `Link` header.
- [`image_url`](https://shopify.dev/docs/api/liquid/filters/image_url) without a width or height returns the image's original URL with no size parameters, although the page's Caution says an error is returned; Dawn, Shopify's reference theme, prints the sizeless form as the last `srcset` candidate.
- `image_url: 'master'` (a positional size, read as omitted) and a nil or `0` `width:` or `height:` (also read as omitted).
- `image_url` clamps `width` and `height` to the image's own size and to 5760, scales an oversized two-sided request proportionally, clamps `quality` to 10 to 90, and sorts the query keys.
- [`img_url`](https://shopify.dev/docs/api/liquid/filters/img_url): the default size (`small`, read from the page's no-argument example), an unknown or empty size (`small`), `original` and `master` as 1024x1024 (the page has one table row for both), and `crop`, `format` and `scale` changing nothing in the default service.
- [`video_tag`](https://shopify.dev/docs/api/liquid/filters/video_tag): `m3u8` sources when not looping, where `loading` goes, the section index for lazy loading, and the product-title fallback for `aria-label` (and for [`external_video_tag`](https://shopify.dev/docs/api/liquid/filters/external_video_tag)'s `title`), which reads the `product` variable in scope.
- `media_tag` on an image renders `image_tag` at the image's own width (1100 when it has none); the page has no image example.
- `escape` after [`image_tag`](https://shopify.dev/docs/api/liquid/filters/image_tag) leaves the tag as it is, as Shopify's Origin demo store shows for Dawn's `image_tag | escape` thumbnails and liquid-spec records for HTML-safe strings; whether Shopify's other tag filters (`stylesheet_tag`, `link_to`, `video_tag` and the rest) are HTML-safe too is not pinned, so `escape` still escapes theirs, and `escape_once` escapes `image_tag`'s.
- [`placeholder_svg_tag`](https://shopify.dev/docs/api/liquid/filters/placeholder_svg_tag) draws Debutify's own line art, not Shopify's, in the markup the page's example shows (`<svg>` with `xmlns`, the `0 0 525.5 525.5` viewBox and unfilled `<path>` elements, so the theme's CSS `fill` colours it and no background is drawn). Not pinned: the viewBox of the names other than the example's `collection-1`, the colour of the names the page lists as colour illustrations (drawn as line art here), and a name the page does not list, which draws `image` here.
- [`payment_button`](https://shopify.dev/docs/api/liquid/filters/payment_button): the page prints a `<shopify-accelerated-checkout>` element carrying shop tokens; a disabled "Buy it now" button stands in for it here.
- [`payment_terms`](https://shopify.dev/docs/api/liquid/filters/payment_terms) prints nothing, as Shopify does in liquid-spec's Dawn product page for a store without Shop Pay Installments; the banner a store with Shop Pay Installments shows is not on shopify.dev, and the store data has no Shop Pay Installments setting, so it is never printed here.

**Colour and fonts**

- [Colour filters](https://shopify.dev/docs/api/liquid/filters/color-filters): the output format for `rgb()` and `hsl()` input (hex when opaque, `rgba()` otherwise), `color_to_hsl` for a translucent colour (`hsla()`), and how `color.alpha` prints (`1.0`).
- Colour input: the pages say only "CSS color string"; hex (3, 4, 6 and 8 digits), `rgb()`, `rgba()`, `hsl()` and `hsla()` are accepted, and named colours, `transparent`, `oklch()` and `color()` are rejected and reported.
- Colour filters given a value that is not a colour, a missing or non-numeric argument, or an unknown component return their input (or render empty) and are reported.
- A `font_picker` setting printed on its own prints its handle.
- [`font_modify`](https://shopify.dev/docs/api/liquid/filters/font_modify): only the "browser fallback weights" half of `lighter` and `bolder`; a missing computed weight returns nil.
- [`font_face`](https://shopify.dev/docs/api/liquid/filters/font_face) for a system font prints nothing.
- The font handle grammar and a font's variants (`assistant_n4`) are Debutify's reading unless the `fontInfo` service supplies the real library.

**Store data and settings**

- [`product.compare_at_price`](https://shopify.dev/docs/api/liquid/objects/product) is nil when no variant has a compare-at price, so dividing by it raises `divided by 0`.
- `== empty` and `== blank` on a value with its own `empty?` (the [cart](https://shopify.dev/docs/api/liquid/objects/cart)'s `empty?`, or a Drop's `empty?` method) follow that `empty?`, as Ruby Liquid's condition calls `empty?` on a value that has one; liquid-spec's recordings of Shopify show `cart == empty` this way, but `== blank` on such a value is pinned by neither them nor shopify.dev, whose [Liquid basics](https://shopify.dev/docs/api/liquid/basics) page uses `blank` for strings and `empty` for objects.
- The stored formats of resource settings (`shopify://…`), and a `url` setting that points at a missing resource.
- `link.active` with a query string, the `link.type` URL patterns and `customer_account_page_link` for `/account…` paths; `canonical_url` on paginated pages (the origin and path, with no query string or page number).
- `position` on product [images](https://shopify.dev/docs/api/liquid/objects/image) and [media](https://shopify.dev/docs/api/liquid/objects/media) is 1-based here; the pages' examples show 1 and do not state the base.
- [`line_item.index`](https://shopify.dev/docs/api/liquid/objects/line_item) is not on shopify.dev; the sample cart's lines carry it 0-based because Dawn reads it as a row number (`item.index | plus: 1`).
- [`search.sort_options`](https://shopify.dev/docs/api/liquid/objects/search): the values of the options, which the page does not give.
- [`recommendations`](https://shopify.dev/docs/api/liquid/objects/recommendations) has both `performed` and `performed?` (the page names only `performed?`), and an empty array for `products` where the page says an `EmptyDrop` while `performed?` is false (they behave alike for `== empty`, `size` and loops). It is performed for `request.recommendations`, a [Product Recommendations API](https://shopify.dev/docs/api/ajax/reference/product-recommendations) request, which leaves out the product itself, unavailable products, products priced at 0, gift cards and products in the cart, as the [related products](https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations/related-products) and [complementary products](https://shopify.dev/docs/storefronts/themes/product-merchandising/recommendations/complementary-products) pages say. Debutify's own, not pinned: related products are the products of the collections the product is in (without `all` and `frontpage`, as shopify.dev's related-collections rule says), then the products of its product type, in store order, because the store data has no purchase history or description similarity; complementary products, which a merchant sets up in the admin, are none; a `limit` outside 1 to 10 is clamped into that range; product URLs carry no `pr_` tracking parameters; and a product id the store does not have, or an intent other than `related` and `complementary`, leaves `recommendations` not performed and is reported, where Shopify answers 404 or 422.
- The sample [blog](https://shopify.dev/docs/api/liquid/objects/blog)'s `moderated?` is `false`; the page lists the property without saying which value a store has.
- [Input settings](https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings): an unset `text`, `textarea`, `html`, `richtext`, `inline_richtext` or `liquid` setting reads as `''` where the page says an `empty` object (`== empty` and `== blank` match, it prints nothing and is not nil); a `product`, `collection`, `page`, `blog` or `article` setting prints its handle when output directly, as the page says, and it is the store's own object (so `==` and `contains` find it), whose handle print also shows wherever else the object is printed, such as the elements of a `product_list` or `collection_list`, which the page does not pin; what a `link_list` prints directly is not pinned either and prints as the object does.
- A trusted `html` setting loses its `<html>`, `<head>` and `<body>` tags and keeps what was between them; the page lists the tags and says nothing about their content.
- A setting id named `toJSON`, `constructor`, `valueOf` or `toString`, and a handle named `size` or `constructor` in a handle map (`collections`, `pages`, `linklists`), read as the object's own member instead of the stored value.
- [`gift_card`](https://shopify.dev/docs/api/liquid/objects/gift_card) is set on the `gift_card` template from `StoreData.gift_card`, nil without one. Not pinned: `last_four_characters` leaving out the spaces of a grouped code (the page's example implies it), and the defaults for what the data leaves out (`currency` the shop's, `enabled` true, `expired` false, the rest nil).
- [`customer`](https://shopify.dev/docs/api/liquid/objects/customer) is built from `StoreData.customer`, with its [addresses](https://shopify.dev/docs/api/liquid/objects/address) and [orders](https://shopify.dev/docs/api/liquid/objects/order), and the `customers/order` template gets `order`, the customer's order `request.resource` names by its name, number or id, or the first one. Debutify's own, not pinned: the English `financial_status_label`, `fulfillment_status_label` and transaction `status_label` (the value with its first letter upper-case and `_` as a space, as the pages' `Paid`, `Partial` and `Success` examples read), `cancel_reason_label` as the description the order page gives each reason, `financial_status` `paid` and `fulfillment_status` read from the fulfillments when the data gives neither, `customer_url` as `/account/orders/<id>` (the page's example is an absolute URL with a token) and `order_status_url` and `customer_order_url` nil, a line item's `fulfillment` as the first fulfillment that lists it, `customer.orders` in the order the data gives them, `last_order` as the order created last, `total_spent` as the sum of the orders' `total_net_amount`, the address `summary` joined with `, ` and including the name, and a shipping method's `handle` and `id` nil. No discounts, duties, tips or saved payment methods are modelled.
- [`search`](https://shopify.dev/docs/api/liquid/objects/search) runs when `request.searchTerms` is given: it finds the products, pages and articles whose words match every term, case-insensitively, as [storefront search](https://shopify.dev/docs/storefronts/themes/navigation-search/search) describes. The request's `type` limits the kinds (`search.types` lists them as `article`, `page`, `product`), `options[prefix]` is `last` by default (the last term starts a word) or `none` (a whole word), `options[unavailable_products]` is `last` by default (after every other result), `show` (in place) or `hide`, `sort_by` is `relevance` or a price order (non-products after the products), and the `filter.*` parameters narrow the products, with the filters' links keeping the whole query. Debutify's own matching, not pinned: the fields searched (a product's title, vendor, type, tags and description, a page's title and content, an article's title, tags and content), splitting at anything that is not a letter or digit, results ordered available products, pages, articles, then unavailable products (no relevance ranking), the sort option names `Relevance`, `Price, low to high` and `Price, high to low`, an unknown `type` being ignored (a `type` of only unknown kinds searching all kinds), an unknown `sort_by` reading as `relevance`, the order of a price sort with unavailable products (last among the products, before the non-products), and an article's `handle` in the results being `<blog>/<article>` (as the parity store prints it, fixtures `probe-search-shirt` and `probe-search-prefix`). The page labels `price-ascending` "high to low" and `price-descending` "low to high"; the names and the parity store (fixture `probe-search-filtered`) say the opposite, and the names win.
- Storefront filters ([`filter`](https://shopify.dev/docs/api/liquid/objects/filter), [`filter_value`](https://shopify.dev/docs/api/liquid/objects/filter_value)): `collection.filters` and `search.filters` are built from `StoreData.filters` over the collection's products or the matching search results, with no filter applied, because the request has no query string. Not pinned: the default filter labels, availability's value labels (`In stock`, `Out of stock`) and its listing both values at any count, availability counting a product under each stock status one of its variants has (a product with an in-stock and a sold-out variant counts under both, reading the [storefront filtering](https://shopify.dev/docs/storefronts/themes/navigation-search/filtering/storefront-filtering) page's variant-level `0` and `1` with the filter_value page's `count`, "the number of results related to the filter value"), the order of values, counting each product once per value, the lower-cased option name in `filter.v.option.<name>`, `encodeURIComponent` for values in URLs, `OR` for every list filter, and nil swatches.
- [`country_option_tags`](https://shopify.dev/docs/api/liquid/objects/country_option_tags) and [`all_country_option_tags`](https://shopify.dev/docs/api/liquid/objects/all_country_option_tags) list the countries `StoreData` gives under those names (the store's own country, with no subregions, when it gives none, where a store lists its shipping zones and every country); whether `all_country_option_tags` starts with a `---` option, as the `country_option_tags` example does, is not pinned.
- [Selling plans](https://shopify.dev/docs/api/liquid/objects/selling_plan_group) come from `ProductData.selling_plan_groups`, with one allocation per plan on every variant the group offers (a group that offers none of the product's variants is not listed, as the [product](https://shopify.dev/docs/api/liquid/objects/product#product-selling_plan_groups) page words it). Not pinned: (1) a selected variant together with a selected plan (`?variant=…&selling_plan=…`): the variant's `selected_selling_plan_allocation` is taken to be its allocation for the plan, as the page ties it to the selected variant; the parity store was recorded with a plan and no variant only, where every variant's is nil. (2) `product.selected_or_first_available_selling_plan_allocation` with a variant chosen but no plan, or a plan that variant is not offered, is the first allocation of the first available variant, as the page words it (not the chosen variant's), and with `?selling_plan=71002` alone it is the first allocation (71001), which `probe-product-plan-selected` cannot tell from the selected plan's because 71001 is both. (3) A percentage price that is not a half minor unit is rounded to the nearest (halves up); the parity store was recorded with 2155.5, printed 2156, which half up, half even and rounding up all give. (4) A `price` adjustment is converted to a market's currency as the recorded fixed amount is, unrounded, and a market's price adjustment applies to both (the recorded market has none). (5) A plan with two price adjustments prices each from the variant's own price, and the allocation's `price` is the first. (6) An allocation's `compare_at_price` is the variant's price, also for a variant that has a compare-at price of its own. A plan's checkout charge is always 100 percent and `remaining_balance_charge_amount` 0, because the data holds no partial charge. A group has `selling_plan_selected` as the page names it, and no `selected`, which the parity store prints as nil.
- Not modelled in store data: `quantity_rule`, unit prices and metafield types other than plain values.

**Theme runtime**

- Section and block ids: the [section object](https://shopify.dev/docs/api/liquid/objects/section) page says Shopify generates the ids of sections in JSON templates dynamically, and the [Section Rendering API](https://shopify.dev/docs/api/ajax/section-rendering) page gives only the examples `sections--1234__header` and `template--5678__image_banner`. Here they are `template--<template>__<key>` and `sections--<group>__<key>`, and blocks that come from a schema `default` get `block-1`, `block-2`…
- The `<!-- BEGIN sections: <group> -->` and `END` comments around a [section group](https://shopify.dev/docs/storefronts/themes/architecture/section-groups), which the page describes only as having "no markup between the sections"; the `shopify-section-group-<group>` class is shown by the [Section Rendering API](https://shopify.dev/docs/api/ajax/section-rendering) page's example response (which writes `className`, apparently a typo) and followed here.
- The `wrapper` grammar of a JSON template beyond the page's one example, and schema `tag` values beyond the documented six (any lowercase element name is accepted, and the 50-character limit on a block's `tag` is not enforced).
- A block's wrapper markup (`<div id="shopify-block-<id>" class="shopify-block">`), `class` when `tag` is `null` (not applied), and `block.shopify_attributes`, which is always empty because the package has no theme editor.
- `block.blocks` in a theme block: the children its `content_for 'blocks'` renders, listed as `section.blocks` lists a section's (static ones left out). The [`block` object](https://shopify.dev/docs/api/liquid/objects/block) page does not have it; Shopify's Horizon theme reads `block.blocks.size` in a theme block.
- Where a static section's saved settings live (`current.sections[<name>]` in [`settings_data.json`](https://shopify.dev/docs/storefronts/themes/architecture/config/settings-data-json), whose page documents only `current`, `presets` and `platform_customizations`), and `current` given as a preset name.
- A [static block](https://shopify.dev/docs/storefronts/themes/architecture/blocks/theme-blocks/static-blocks)'s saved entry sits under the `blocks` of the section or block it renders in, with `"static": true` and no place in `block_order`, as the page's "Static theme blocks in data" shows; this package requires the flag, and an entry without it is not used and is reported as `unsupported`. Still open: a saved entry whose `type` differs from the tag's (the tag's type wins), and `content_for 'block'` with no saved entry (the block renders with its schema defaults).
- Contextual section group files: how one merges with its parent (objects by key, arrays replaced), which one wins when several match, and `market` combined with `b2b`.
- Which template wins when a JSON and a Liquid template share a name (the JSON one), which wins in `renderSection` when a bare template key and a static section share a name, and group ids whose key contains `__`.
- The template renders before the layout, so a Liquid template's `assign` is not visible in its layout; the [layouts](https://shopify.dev/docs/storefronts/themes/architecture/layouts) page says Shopify can start sending the page when the layout reaches `content_for_header`, before the template's sections render.
- `renderSection` keeps the section's index on the page (the section object page says `section.index` is nil under the Section Rendering API), and accepts a section group's id, applying the request's `context`.
- The nesting limit of 100 for `section`, `sections` and `content_for` (`Nesting too deep`) is Debutify's number, taken from Ruby Liquid; a theme block that renders itself stops there, and `render` and `include` recursion runs to `renderLimit` instead.
- The exact text of `content_for_header` (shopify.dev says only that it holds all scripts Shopify requires), so a filter applied to it, such as `| size`, differs from a store.
- Malformed template fields are read as empty and reported (a saved block that is not an object is left out of `section.blocks`, and block `settings` that are not an object read as empty, both under the feature `blocks`), and the 25-section and 50-block limits of [JSON templates](https://shopify.dev/docs/storefronts/themes/architecture/templates/json-templates) are not enforced.
- The section schema's `blocks` list (`@theme`, `@app`, block types) does not restrict what renders from saved data, and `disabled` on a block (documented for sections only) skips it.
- The text of a section's syntax error and of the `content_for` errors (unknown type, missing `type` or `id`), and where a failing block's error lands: a block file that does not parse is listed in `report.errors` with its file and line, but a block whose saved JSON or schema has the wrong shape prints an error such as `Liquid error: block <id>: "settings" must be an object` (`Liquid error: blocks/<type>.liquid: …` for its schema) in its own wrapper and is not listed in `report.errors`; its siblings and the rest of its section still render, and the section is reported as `failed` with that message as the `reason`.
- Block-level `t` lookups: a block resolves `sections.<section type>.<key>` through its section's schema `locales`.

The upstream README follows.

---

# LiquidJS

A simple, expressive, extensible Liquid template engine for JavaScript — Shopify, Jekyll and GitHub Pages compatible, for Node.js, browsers, and the CLI, with TypeScript support.

[![npm version](https://img.shields.io/npm/v/liquidjs.svg?logo=npm&style=flat-square)](https://www.npmjs.org/package/liquidjs)
[![npm downloads](https://img.shields.io/npm/dm/liquidjs.svg?style=flat-square)](https://www.npmjs.org/package/liquidjs)
[![Build Status](https://img.shields.io/github/actions/workflow/status/harttle/liquidjs/ci-build.yml?branch=master&style=flat-square)](https://github.com/harttle/liquidjs/actions/workflows/ci-build.yml?query=branch%3Amaster)
[![Coverage](https://img.shields.io/coveralls/harttle/liquidjs.svg?style=flat-square)](https://coveralls.io/github/harttle/liquidjs?branch=master)
[![License: MIT](https://img.shields.io/github/license/harttle/liquidjs?style=flat-square)](https://github.com/harttle/liquidjs/blob/master/LICENSE)

[Documentation][doc] · [Playground](https://liquidjs.com/playground.html) · [Setup guide][setup] · [Contributing][contribution]

<a href="https://liquidjs.com/playground.html">
  <img src="docs/source/playground-demo.gif" alt="LiquidJS playground: edit a template and context, see live HTML output" width="980" style="display: block; margin: 0 auto;" />
</a>

<p align="center"><sub>Try the <a href="https://liquidjs.com/playground.html">online playground</a>.</sub></p>

## Quick start

```js
import { Liquid } from 'liquidjs'

const engine = new Liquid()
const html = await engine.parseAndRender(
  'Hello, {{ name | capitalize }}!',
  { name: 'liquid' }
)
//=> 'Hello, Liquid!'
```

## Installation

**Node.js**

```bash
npm install liquidjs
```

**Browser** (jsDelivr UMD bundle)

```html
<script src="https://cdn.jsdelivr.net/npm/liquidjs/dist/liquid.browser.min.js"></script>
```

**CLI**

```bash
npx liquidjs --template 'Hello, {{ name }}!' --context '{"name": "Liquid"}'
```

See the [setup guide][setup] for partials, layouts, caching, and other options.

## Used by

<!-- USED-BY-BEGIN -->
<p align="center" style="line-height: 2.5;">
  <a href="https://www.11ty.dev/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/35147177?v=4&s=100" height="80" style="vertical-align: middle;" alt="Eleventy" title="Eleventy"/></a>
  <a href="https://www.opensense.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/opensense-inc/bf840ae/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="Opensense" title="Opensense"/></a>
  <a href="https://www.microsoft.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/6154722?v=4&s=100" height="80" style="vertical-align: middle;" alt="Power Pages, Azure API Management developer portal" title="Power Pages, Azure API Management developer portal"/></a>
  <a href="https://docs.github.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/9919?v=4&amp;s=100" height="80" style="vertical-align: middle;" alt="GitHub Docs" title="GitHub Docs"/></a>
  <a href="https://github.com/elastic/kibana" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/6764390?v=4&s=100" height="80" style="vertical-align: middle;" alt="Kibana" title="Kibana"/></a>
  <a href="https://www.shopify.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/8085?v=4&amp;s=100" height="80" style="vertical-align: middle;" alt="Shopify CLI, Checkout Blocks" title="Shopify CLI, Checkout Blocks"/></a>
  <a href="https://customer.io/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/1152079?v=4&s=100" height="80" style="vertical-align: middle;" alt="Customer IO" title="Customer IO"/></a>
  <br/>
  <a href="https://syntax.fm/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/130389858?v=4&s=100" height="80" style="vertical-align: middle;" alt="Syntax Podcast" title="Syntax Podcast"/></a>
  <a href="https://www.testmuai.com/?utm_medium=sponsor&utm_source=liquidjs" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/27130435?s=200&v=4" width="80" style="vertical-align: middle;" alt="TestMu AI" title="TestMu AI"/></a>
  <a href="https://chudovo.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/Chudovo/avatar/256.png?height=100" width="160" style="vertical-align: middle;background: white;padding: 8px 16px;" alt="Chudovo" title="Chudovo"/></a>
  <a href="https://www.pakstyle.pk/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/pakstyle/2b81605/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="PakStyle.pk" title="PakStyle.pk"/></a>
  <a href="https://www.escorta.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/escortacom/avatar/256.png?height=100" height="45" style="vertical-align: middle;" alt="EscortA.com" title="EscortA.com"/></a>
  <a href="https://opencollective.com/touchless" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/touchless/273bc74/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="Touchless" title="Touchless"/></a>
  <br/>
  <a href="https://www.dropkiq.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/1bertlol/43a8ea8/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="Dropkiq" title="Dropkiq"/></a>
  <a href="https://directus.io/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/15967950?v=4&amp;s=100" height="80" style="vertical-align: middle;" alt="Directus" title="Directus"/></a>
  <a href="https://www.builder.io/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://cdn.builder.io/api/v1/image/assets%2FYJIGb4i01jvw0SRdL5Bt%2F51a002f4a17f4fc4a829b8891a1c25ee" height="80" style="vertical-align: middle;" alt="Builder.io, Mitosis" title="Builder.io, Mitosis"/></a>
  <a href="https://patternlab.io/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/4733935?v=4&amp;s=100" height="80" style="vertical-align: middle;" alt="Pattern Lab" title="Pattern Lab"/></a>
  <a href="https://www.rockrms.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://www.rockrms.com/GetImage.ashx?id=72533" height="80" style="vertical-align: middle;" alt="Rock RMS" title="Rock RMS"/></a>
  <a href="https://wismolabs.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://cdn-ldlap.nitrocdn.com/DsLJMZpUUekfsitqBnNmsRAnzbwPoIzE/assets/images/optimized/rev-5df8687/wismolabs.com/wp-content/uploads/2023/03/favicon-300x300.png" height="80" style="vertical-align: middle;" alt="WISMOlabs" title="WISMOlabs"/></a>
  <a href="https://chromewebstore.google.com/detail/freshet/mpclplhdencffbilobpcapccnihpelcg" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://raw.githubusercontent.com/MattAltermatt/freshet/main/public/icon-128.png" height="80" style="vertical-align: middle;" alt="Freshet" title="Freshet"/></a>
</p>
<!-- USED-BY-END -->

Products and projects running on LiquidJS. [Open a PR](https://github.com/harttle/liquidjs/edit/master/README.md) to add yours.

## Financial Support

If you personally love LiquidJS or it's benefiting your business, please consider financially support us via [GitHub Sponsors](https://github.com/sponsors/harttle). Special thanks to our sponsors!

<!-- FINANCIAL-CONTRIBUTORS-BEGIN -->
<p align="center" style="line-height: 2.5;">
  <a href="https://www.11ty.dev/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/35147177?v=4&s=100" height="80" style="vertical-align: middle;" alt="Eleventy" title="Eleventy"/></a>
  <a href="https://www.opensense.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/opensense-inc/bf840ae/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="Opensense Inc." title="Opensense"/></a>
  <a href="https://github.com/microsoft" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/6154722?v=4&s=100" height="80" style="vertical-align: middle;" alt="Microsoft" title="Microsoft"/></a>
  <a href="https://sentry.io/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/1396951?v=4&s=100" height="80" style="vertical-align: middle;" alt="Sentry" title="Sentry"/></a>
  <a href="https://github.com/Checkout-Blocks" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/114603307?v=4&s=100" height="80" style="vertical-align: middle;" alt="Checkout Blocks" title="Checkout Blocks"/></a>
  <a href="https://customer.io/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/1152079?v=4&s=100" height="80" style="vertical-align: middle;" alt="Customer IO" title="Customer IO"/></a>
  <a href="https://syntax.fm/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/130389858?v=4&s=100" height="80" style="vertical-align: middle;" alt="Syntax Podcast" title="Syntax Podcast"/></a>
  <br/>
  <a href="https://www.testmuai.com/?utm_medium=sponsor&utm_source=liquidjs" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/27130435?s=200&v=4" width="80" style="vertical-align: middle;" alt="TestMu AI" title="TestMu AI"/></a>
  <a href="https://github.com/talboren" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/68807791?v=4&s=100" height="80" style="vertical-align: middle;" alt="Tal" title="Tal (@talboren)"/></a>
  <a href="https://chudovo.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/Chudovo/avatar/256.png?height=100" width="160" style="vertical-align: middle;background: white;padding: 8px 16px;" alt="Chudovo" title="Chudovo"/></a>
  <a href="https://dailycontributors.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/dailycontributors/3c2e057/logo/256.png?height=50&width=100" width="120" style="vertical-align: middle;" alt="Dailycontributors" title="Dailycontributors"/></a>
  <a href="https://www.pakstyle.pk/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/pakstyle/2b81605/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="PakStyle.pk" title="PakStyle.pk"/></a>
  <a href="https://www.escorta.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/escortacom/avatar/256.png?height=100" height="45" style="vertical-align: middle;" alt="EscortA.com" title="EscortA.com"/></a>
  <br/>
  <a href="https://opencollective.com/touchless" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/touchless/273bc74/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="Touchless" title="Touchless"/></a>
  <a href="https://www.dropkiq.com/" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/1bertlol/43a8ea8/logo/256.png?height=100" height="80" style="vertical-align: middle;" alt="Dropkiq" title="Dropkiq"/></a>
  <a href="https://about.me/peterdehaan" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars2.githubusercontent.com/u/557895?v=4&s=100" height="80" style="vertical-align: middle;" alt="Peter deHaan" title="Peter deHaan"/></a>
  <a href="https://github.com/coni2k" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars0.githubusercontent.com/u/1284601?v=4&s=100" height="80" style="vertical-align: middle;" alt="Serkan Holat" title="Serkan Holat"/></a>
  <a href="https://github.com/amit777" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars0.githubusercontent.com/u/2703309?v=4&s=100" height="80" style="vertical-align: middle;" alt="amit777" title="amit777"/></a>
  <a href="https://opencollective.com/khaled-salem" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/khaled-salem/avatar/256.png?height=256" height="80" style="vertical-align: middle;" alt="Khaled Salem" title="Khaled Salem"/></a>
  <a href="https://github.com/15fathoms" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://avatars.githubusercontent.com/u/79156039?v=4&s=100" height="80" style="vertical-align: middle;" alt="Emmanuel Cartelli" title="Emmanuel Cartelli"/></a>
  <a href="https://opencollective.com/cartelli-emmanuel" style="display: inline-block; vertical-align: middle; margin: 8px;"><img src="https://images.opencollective.com/cartelli-emmanuel/avatar/256.png?height=100" height="80" style="vertical-align: middle;" alt="Cartelli Emmanuel" title="Cartelli Emmanuel"/></a>
</p>
<!-- FINANCIAL-CONTRIBUTORS-END -->

## Contributors ✨

Want to contribute? see [Contribution Guidelines][contribution]. Thanks goes to these wonderful people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/harttle"><img src="https://avatars3.githubusercontent.com/u/4427974?v=4?s=100" width="100px;" alt="Jun Yang"/><br /><sub><b>Jun Yang</b></sub></a><br /><a href="#maintenance-harttle" title="Maintenance">🚧</a> <a href="https://github.com/harttle/liquidjs/commits?author=harttle" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/chenos"><img src="https://avatars0.githubusercontent.com/u/2993310?v=4?s=100" width="100px;" alt="chenos"/><br /><sub><b>chenos</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=chenos" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://zachleat.com/"><img src="https://avatars2.githubusercontent.com/u/39355?v=4?s=100" width="100px;" alt="Zach Leatherman"/><br /><sub><b>Zach Leatherman</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/issues?q=author%3Azachleat" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/thardy"><img src="https://avatars3.githubusercontent.com/u/120636?v=4?s=100" width="100px;" alt="Tim Hardy"/><br /><sub><b>Tim Hardy</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=thardy" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://paulrobertlloyd.com/"><img src="https://avatars3.githubusercontent.com/u/813383?v=4?s=100" width="100px;" alt="Paul Robert Lloyd"/><br /><sub><b>Paul Robert Lloyd</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=paulrobertlloyd" title="Code">💻</a> <a href="https://github.com/harttle/liquidjs/issues?q=author%3Apaulrobertlloyd" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://twitter.com/alecdotbiz"><img src="https://avatars2.githubusercontent.com/u/1925840?v=4?s=100" width="100px;" alt="Alec Larson"/><br /><sub><b>Alec Larson</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=aleclarson" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/pmalouin"><img src="https://avatars1.githubusercontent.com/u/1411117?v=4?s=100" width="100px;" alt="Patrick Malouin"/><br /><sub><b>Patrick Malouin</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=pmalouin" title="Code">💻</a> <a href="https://github.com/harttle/liquidjs/commits?author=pmalouin" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://jaswrks.com"><img src="https://avatars3.githubusercontent.com/u/1563559?v=4?s=100" width="100px;" alt="jaswrks"/><br /><sub><b>jaswrks</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=jaswrks" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://oott123.com"><img src="https://avatars2.githubusercontent.com/u/905663?v=4?s=100" width="100px;" alt="三三"/><br /><sub><b>三三</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=oott123" title="Code">💻</a> <a href="#ideas-oott123" title="Ideas, Planning, & Feedback">🤔</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ssendev"><img src="https://avatars0.githubusercontent.com/u/450793?v=4?s=100" width="100px;" alt="ssendev"/><br /><sub><b>ssendev</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=ssendev" title="Code">💻</a> <a href="https://github.com/harttle/liquidjs/commits?author=ssendev" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/wojtask9"><img src="https://avatars3.githubusercontent.com/u/6099236?v=4?s=100" width="100px;" alt="wojtask9"/><br /><sub><b>wojtask9</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=wojtask9" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/thelornenelson"><img src="https://avatars3.githubusercontent.com/u/24596583?v=4?s=100" width="100px;" alt="Andrew Barclay"/><br /><sub><b>Andrew Barclay</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=thelornenelson" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.stam.pr/"><img src="https://avatars2.githubusercontent.com/u/142338?v=4?s=100" width="100px;" alt="Cory Mawhorter"/><br /><sub><b>Cory Mawhorter</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=cmawhorter" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/thehappybug"><img src="https://avatars0.githubusercontent.com/u/3393530?v=4?s=100" width="100px;" alt="Mehdi Jaffery"/><br /><sub><b>Mehdi Jaffery</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=thehappybug" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/robinbijlani"><img src="https://avatars0.githubusercontent.com/u/2503108?v=4?s=100" width="100px;" alt="Robin Bijlani"/><br /><sub><b>Robin Bijlani</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=robinbijlani" title="Code">💻</a> <a href="https://github.com/harttle/liquidjs/issues?q=author%3Arobinbijlani" title="Bug reports">🐛</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.rmkennedy.com"><img src="https://avatars3.githubusercontent.com/u/8356669?v=4?s=100" width="100px;" alt="Ryan Kennedy"/><br /><sub><b>Ryan Kennedy</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=ryaninvents" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/strax"><img src="https://avatars2.githubusercontent.com/u/587213?v=4?s=100" width="100px;" alt="Sami Kukkonen"/><br /><sub><b>Sami Kukkonen</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=strax" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://ScottFreeCode.github.io/"><img src="https://avatars3.githubusercontent.com/u/16506071?v=4?s=100" width="100px;" alt="Scott Santucci"/><br /><sub><b>Scott Santucci</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=ScottFreeCode" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://stevenrescigno.com"><img src="https://avatars3.githubusercontent.com/u/8505293?v=4?s=100" width="100px;" alt="Steven "/><br /><sub><b>Steven </b></sub></a><br /><a href="#example-stevenanthonyrevo" title="Examples">💡</a> <a href="https://github.com/harttle/liquidjs/commits?author=stevenanthonyrevo" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://efcl.info/"><img src="https://avatars1.githubusercontent.com/u/19714?v=4?s=100" width="100px;" alt="azu"/><br /><sub><b>azu</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=azu" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/wyozi"><img src="https://avatars3.githubusercontent.com/u/4894573?v=4?s=100" width="100px;" alt="Joonas"/><br /><sub><b>Joonas</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=wyozi" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jamelait"><img src="https://avatars1.githubusercontent.com/u/14369255?v=4?s=100" width="100px;" alt="Jamel A."/><br /><sub><b>Jamel A.</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=jamelait" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://brandonpittman.net"><img src="https://avatars0.githubusercontent.com/u/967145?v=4?s=100" width="100px;" alt="Brandon Pittman"/><br /><sub><b>Brandon Pittman</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=brandonpittman" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/tgrandgent"><img src="https://avatars3.githubusercontent.com/u/17069042?v=4?s=100" width="100px;" alt="tgrandgent"/><br /><sub><b>tgrandgent</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=tgrandgent" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mastodon0"><img src="https://avatars1.githubusercontent.com/u/7924332?v=4?s=100" width="100px;" alt="Martin Schuster"/><br /><sub><b>Martin Schuster</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=mastodon0" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://js.chenlei.me"><img src="https://avatars0.githubusercontent.com/u/6339390?v=4?s=100" width="100px;" alt="Ray"/><br /><sub><b>Ray</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=richardo2016" title="Tests">⚠️</a> <a href="https://github.com/harttle/liquidjs/commits?author=richardo2016" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/CriGoT"><img src="https://avatars0.githubusercontent.com/u/1936786?v=4?s=100" width="100px;" alt="Cristofer Gonzales"/><br /><sub><b>Cristofer Gonzales</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=CriGoT" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.raymondcamden.com"><img src="https://avatars3.githubusercontent.com/u/393660?v=4?s=100" width="100px;" alt="Raymond Camden"/><br /><sub><b>Raymond Camden</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=cfjedimaster" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://stedman.dev"><img src="https://avatars1.githubusercontent.com/u/183122?v=4?s=100" width="100px;" alt="Steve Stedman"/><br /><sub><b>Steve Stedman</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=stedman" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://ciccarello.me"><img src="https://avatars0.githubusercontent.com/u/11273838?v=4?s=100" width="100px;" alt="Anthony Ciccarello"/><br /><sub><b>Anthony Ciccarello</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=aciccarello" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://twitter.com/IAmTrySound"><img src="https://avatars0.githubusercontent.com/u/5635476?v=4?s=100" width="100px;" alt="Bogdan Chadkin"/><br /><sub><b>Bogdan Chadkin</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=TrySound" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://hightouch.io"><img src="https://avatars0.githubusercontent.com/u/5959235?v=4?s=100" width="100px;" alt="Tejas Manohar"/><br /><sub><b>Tejas Manohar</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=tejasmanohar" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://about.me/peterdehaan"><img src="https://avatars2.githubusercontent.com/u/557895?v=4?s=100" width="100px;" alt="Peter deHaan"/><br /><sub><b>Peter deHaan</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=pdehaan" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/amit777"><img src="https://avatars0.githubusercontent.com/u/2703309?v=4?s=100" width="100px;" alt="amit777"/><br /><sub><b>amit777</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=amit777" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.ifi.uzh.ch/en/ce/people/schuldenzucker.html"><img src="https://avatars3.githubusercontent.com/u/1100776?v=4?s=100" width="100px;" alt="Steffen Schuldenzucker"/><br /><sub><b>Steffen Schuldenzucker</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=sschuldenzucker" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/Pixcell"><img src="https://avatars0.githubusercontent.com/u/4005291?v=4?s=100" width="100px;" alt="Pixcell"/><br /><sub><b>Pixcell</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=Pixcell" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://jasonet.co"><img src="https://avatars.githubusercontent.com/u/10660468?v=4?s=100" width="100px;" alt="Jason Etcovitch"/><br /><sub><b>Jason Etcovitch</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=JasonEtco" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/kayuapi"><img src="https://avatars.githubusercontent.com/u/10304328?v=4?s=100" width="100px;" alt="ZC"/><br /><sub><b>ZC</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=kayuapi" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://memmie.lenglet.name"><img src="https://avatars.githubusercontent.com/u/729275?v=4?s=100" width="100px;" alt="Memmie Lenglet"/><br /><sub><b>Memmie Lenglet</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=mems" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ilhamdev0"><img src="https://avatars.githubusercontent.com/u/57636145?v=4?s=100" width="100px;" alt="ilhamdev0"/><br /><sub><b>ilhamdev0</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=ilhamdev0" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/c412216887"><img src="https://avatars.githubusercontent.com/u/29691650?v=4?s=100" width="100px;" alt="一饮一啄皆是人生"/><br /><sub><b>一饮一啄皆是人生</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=c412216887" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://digitalinspiration.com/"><img src="https://avatars.githubusercontent.com/u/1344071?v=4?s=100" width="100px;" alt="Amit Agarwal"/><br /><sub><b>Amit Agarwal</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=labnol" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://n1ru4l.cloud/"><img src="https://avatars.githubusercontent.com/u/14338007?v=4?s=100" width="100px;" alt="Laurin Quast"/><br /><sub><b>Laurin Quast</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=n1ru4l" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mattvague"><img src="https://avatars.githubusercontent.com/u/64985?v=4?s=100" width="100px;" alt="Matt Vague"/><br /><sub><b>Matt Vague</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=mattvague" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/bglw"><img src="https://avatars.githubusercontent.com/u/40188355?v=4?s=100" width="100px;" alt="Liam Bigelow"/><br /><sub><b>Liam Bigelow</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=bglw" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://about.me/jasonkurian"><img src="https://avatars.githubusercontent.com/u/2642545?v=4?s=100" width="100px;" alt="Jason Kurian"/><br /><sub><b>Jason Kurian</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=JaKXz" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/dphm"><img src="https://avatars.githubusercontent.com/u/1707217?v=4?s=100" width="100px;" alt="d pham (they/them)"/><br /><sub><b>d pham (they/them)</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=dphm" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.aleksandrhovhannisyan.com/"><img src="https://avatars.githubusercontent.com/u/19352442?v=4?s=100" width="100px;" alt="Aleksandr Hovhannisyan"/><br /><sub><b>Aleksandr Hovhannisyan</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=AleksandrHovhannisyan" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jg-rp"><img src="https://avatars.githubusercontent.com/u/72664870?v=4?s=100" width="100px;" alt="jg-rp"/><br /><sub><b>jg-rp</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=jg-rp" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/ameyaapte1"><img src="https://avatars.githubusercontent.com/u/16054747?v=4?s=100" width="100px;" alt="Ameya Apte"/><br /><sub><b>Ameya Apte</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=ameyaapte1" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/tbdrz"><img src="https://avatars.githubusercontent.com/u/50599116?v=4?s=100" width="100px;" alt="tbdrz"/><br /><sub><b>tbdrz</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=tbdrz" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://santialbo.com"><img src="https://avatars.githubusercontent.com/u/1557563?v=4?s=100" width="100px;" alt="Santi Albo"/><br /><sub><b>Santi Albo</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=santialbo" title="Documentation">📖</a> <a href="https://github.com/harttle/liquidjs/commits?author=santialbo" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/YahangWu"><img src="https://avatars.githubusercontent.com/u/12295975?v=4?s=100" width="100px;" alt="Yahang Wu"/><br /><sub><b>Yahang Wu</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=YahangWu" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/hongl-1"><img src="https://avatars.githubusercontent.com/u/101576612?v=4?s=100" width="100px;" alt="hongl"/><br /><sub><b>hongl</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=hongl-1" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/zxx-457"><img src="https://avatars.githubusercontent.com/u/114141362?v=4?s=100" width="100px;" alt="zxx-457"/><br /><sub><b>zxx-457</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=zxx-457" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/prassie"><img src="https://avatars.githubusercontent.com/u/1357831?v=4?s=100" width="100px;" alt="prassie"/><br /><sub><b>prassie</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=prassie" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://slavv.com/"><img src="https://avatars.githubusercontent.com/u/713329?v=4?s=100" width="100px;" alt="Slav Ivanov"/><br /><sub><b>Slav Ivanov</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=slavivanov" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://www.orgflow.io/"><img src="https://avatars.githubusercontent.com/u/3889090?v=4?s=100" width="100px;" alt="Daniel Rosenberg"/><br /><sub><b>Daniel Rosenberg</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=DaRosenberg" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/bobgubko"><img src="https://avatars.githubusercontent.com/u/733312?v=4?s=100" width="100px;" alt="bobgubko"/><br /><sub><b>bobgubko</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=bobgubko" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/bangank36"><img src="https://avatars.githubusercontent.com/u/10071857?v=4?s=100" width="100px;" alt="BaNgan"/><br /><sub><b>BaNgan</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=bangank36" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/mahyar-pasarzangene"><img src="https://avatars.githubusercontent.com/u/16485039?v=4?s=100" width="100px;" alt="Mahyar Pasarzangene"/><br /><sub><b>Mahyar Pasarzangene</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=mahyar-pasarzangene" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://hubelbauer.net/"><img src="https://avatars.githubusercontent.com/u/6831144?v=4?s=100" width="100px;" alt="Tomáš Hübelbauer"/><br /><sub><b>Tomáš Hübelbauer</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=TomasHubelbauer" title="Code">💻</a> <a href="https://github.com/harttle/liquidjs/commits?author=TomasHubelbauer" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://sixtwothree.org"><img src="https://avatars.githubusercontent.com/u/73866?v=4?s=100" width="100px;" alt="Jason Garber"/><br /><sub><b>Jason Garber</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=jgarber623" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="http://nickreilingh.com/"><img src="https://avatars.githubusercontent.com/u/2458645?v=4?s=100" width="100px;" alt="Nick Reilingh"/><br /><sub><b>Nick Reilingh</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=NReilingh" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="http://ebobby.org"><img src="https://avatars.githubusercontent.com/u/170356?v=4?s=100" width="100px;" alt="Francisco Soto"/><br /><sub><b>Francisco Soto</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=ebobby" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.davidlj95.com"><img src="https://avatars.githubusercontent.com/u/8050648?v=4?s=100" width="100px;" alt="David LJ"/><br /><sub><b>David LJ</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=davidlj95" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/RasmusWL"><img src="https://avatars.githubusercontent.com/u/1054041?v=4?s=100" width="100px;" alt="Rasmus Wriedt Larsen"/><br /><sub><b>Rasmus Wriedt Larsen</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=RasmusWL" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/brunodccarvalho"><img src="https://avatars.githubusercontent.com/u/24962950?v=4?s=100" width="100px;" alt="Bruno Carvalho"/><br /><sub><b>Bruno Carvalho</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=brunodccarvalho" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/fupengl"><img src="https://avatars.githubusercontent.com/u/20211964?v=4?s=100" width="100px;" alt="傅鹏"/><br /><sub><b>傅鹏</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=fupengl" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/joel-hamilton"><img src="https://avatars.githubusercontent.com/u/12899024?v=4?s=100" width="100px;" alt="Joel Hamilton"/><br /><sub><b>Joel Hamilton</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=joel-hamilton" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/amedve"><img src="https://avatars.githubusercontent.com/u/23156422?v=4?s=100" width="100px;" alt="Max Medve"/><br /><sub><b>Max Medve</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=amedve" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://maizzle.com"><img src="https://avatars.githubusercontent.com/u/1656595?v=4?s=100" width="100px;" alt="Cosmin Popovici"/><br /><sub><b>Cosmin Popovici</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=cossssmin" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/admtnnr"><img src="https://avatars.githubusercontent.com/u/27502?v=4?s=100" width="100px;" alt="Adam Tanner"/><br /><sub><b>Adam Tanner</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=admtnnr" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/GuillermoCasalCaro"><img src="https://avatars.githubusercontent.com/u/18685581?v=4?s=100" width="100px;" alt="Guillermo Casal Caro"/><br /><sub><b>Guillermo Casal Caro</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=GuillermoCasalCaro" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jsoref"><img src="https://avatars.githubusercontent.com/u/2119212?v=4?s=100" width="100px;" alt="Josh Soref"/><br /><sub><b>Josh Soref</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=jsoref" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://vrugtehagel.nl"><img src="https://avatars.githubusercontent.com/u/41021050?v=4?s=100" width="100px;" alt="Koen"/><br /><sub><b>Koen</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=vrugtehagel" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://neamar.fr"><img src="https://avatars.githubusercontent.com/u/536844?v=4?s=100" width="100px;" alt="Matthieu Bacconnier"/><br /><sub><b>Matthieu Bacconnier</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=Neamar" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://tovd.dev"><img src="https://avatars.githubusercontent.com/u/35376389?v=4?s=100" width="100px;" alt="Tim van Dam"/><br /><sub><b>Tim van Dam</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=timvandam" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/edh649"><img src="https://avatars.githubusercontent.com/u/527604?v=4?s=100" width="100px;" alt="Ed Hanton"/><br /><sub><b>Ed Hanton</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=edh649" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://gurdiga.com"><img src="https://avatars.githubusercontent.com/u/53922?v=4?s=100" width="100px;" alt="Vlad GURDIGA"/><br /><sub><b>Vlad GURDIGA</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=gurdiga" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.streakingman.com"><img src="https://avatars.githubusercontent.com/u/30397306?v=4?s=100" width="100px;" alt="裸奔狂甩丁丁"/><br /><sub><b>裸奔狂甩丁丁</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=StreakingMan" title="Documentation">📖</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/skynetigor"><img src="https://avatars.githubusercontent.com/u/20903171?v=4?s=100" width="100px;" alt="Ihor Panasiuk"/><br /><sub><b>Ihor Panasiuk</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=skynetigor" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/rosomri"><img src="https://avatars.githubusercontent.com/u/68001413?v=4?s=100" width="100px;" alt="Omri Rosner"/><br /><sub><b>Omri Rosner</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=rosomri" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/immerrr"><img src="https://avatars.githubusercontent.com/u/579798?v=4?s=100" width="100px;" alt="immerrr again"/><br /><sub><b>immerrr again</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=immerrr" title="Documentation">📖</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/rongjiecomputer"><img src="https://avatars.githubusercontent.com/u/13115060?v=4?s=100" width="100px;" alt="Loo Rong Jie"/><br /><sub><b>Loo Rong Jie</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=rongjiecomputer" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/MorielHarush"><img src="https://avatars.githubusercontent.com/u/93482738?v=4?s=100" width="100px;" alt="MorielHarush"/><br /><sub><b>MorielHarush</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=MorielHarush" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://doruk.ch"><img src="https://avatars.githubusercontent.com/u/77903714?v=4?s=100" width="100px;" alt="Peak Twilight"/><br /><sub><b>Peak Twilight</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=peaktwilight" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/joecottam"><img src="https://avatars.githubusercontent.com/u/44173086?v=4?s=100" width="100px;" alt="Joe Cottam"/><br /><sub><b>Joe Cottam</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=joecottam" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/timbze"><img src="https://avatars.githubusercontent.com/u/35117769?v=4?s=100" width="100px;" alt="Timmy Braun"/><br /><sub><b>Timmy Braun</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=timbze" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/talboren"><img src="https://avatars.githubusercontent.com/u/68807791?v=4?s=100" width="100px;" alt="Tal"/><br /><sub><b>Tal</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=talboren" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://filonov.dev"><img src="https://avatars.githubusercontent.com/u/813224?v=4?s=100" width="100px;" alt="Vladimir Filonov"/><br /><sub><b>Vladimir Filonov</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=VladimirFilonov" title="Code">💻</a></td>
    </tr>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/spokodev"><img src="https://avatars.githubusercontent.com/u/239690017?v=4?s=100" width="100px;" alt="spokodev"/><br /><sub><b>spokodev</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=spokodev" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/YacovGold"><img src="https://avatars.githubusercontent.com/u/8984042?v=4?s=100" width="100px;" alt="YacovGold"/><br /><sub><b>YacovGold</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=YacovGold" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/sarathfrancis90"><img src="https://avatars.githubusercontent.com/u/9289498?v=4?s=100" width="100px;" alt="Sarath Francis"/><br /><sub><b>Sarath Francis</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=sarathfrancis90" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/youdie006"><img src="https://avatars.githubusercontent.com/u/169331997?v=4?s=100" width="100px;" alt="KBS"/><br /><sub><b>KBS</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=youdie006" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/jakezwang"><img src="https://avatars.githubusercontent.com/u/2645794?v=4?s=100" width="100px;" alt="Jake Wang"/><br /><sub><b>Jake Wang</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=jakezwang" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://digitalmonstr.com"><img src="https://avatars.githubusercontent.com/u/115070295?v=4?s=100" width="100px;" alt="web-orbit12"/><br /><sub><b>web-orbit12</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=web-orbit12" title="Code">💻</a></td>
      <td align="center" valign="top" width="14.28%"><a href="https://www.aciragroup.com"><img src="https://avatars.githubusercontent.com/u/1220566?v=4?s=100" width="100px;" alt="Josef Guenther"/><br /><sub><b>Josef Guenther</b></sub></a><br /><a href="https://github.com/harttle/liquidjs/commits?author=josefguenther" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

[MIT](LICENSE) © [Jun Yang](https://github.com/harttle)

[setup]: https://liquidjs.com/tutorials/setup.html
[doc]: https://liquidjs.com
[github]: https://github.com/harttle/liquidjs
[oc]: https://opencollective.com/liquidjs/
[contribution]: https://liquidjs.com/tutorials/contribution-guidelines.html
