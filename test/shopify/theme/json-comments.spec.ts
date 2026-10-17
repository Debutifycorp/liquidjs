import { renderPage } from '../../../src/shopify'
import { parseJsonc } from '../../../src/shopify/util/jsonc'
import { parseThemeJson } from '../../../src/shopify/theme/json'
import { legacySampleData } from '../legacy-sample'

/** A theme of a layout, one JSON template and whatever else a case adds. */
function themeFiles (extra: Record<string, string>): { files: Record<string, string> } {
  return {
    files: {
      'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
      'templates/index.json': '{ "sections": { "s": { "type": "text" } }, "order": ["s"] }',
      'sections/text.liquid': '<p>{{ "general.greeting" | t: name: "Ada" }}</p><p>{{ "general.items" | t: count: 1 }}</p><p>{{ "general.items" | t: count: 3 }}</p><p>{{ "general.nope" | t }}</p>',
      ...extra
    }
  }
}

// https://shopify.dev/docs/storefronts/themes/architecture#json-with-comments: "Theme files with JSON support comments and trailing commas."
describe('shopify/util/jsonc comments and trailing commas', () => {
  it('reads plain JSON as JSON.parse does', () => {
    expect(parseJsonc('{ "a": [1, 2.5e3, true, null, "x"], "b": { "c": "d" } }')).toEqual({ a: [1, 2500, true, null, 'x'], b: { c: 'd' } })
  })
  it('skips a // comment to the end of the line, before, between and after the properties', () => {
    const source = `// before
{ // after the brace
  "a": 1, // after a value
  // between keys
  "b": 2 // after the last property
}
// after the object`
    expect(parseJsonc(source)).toEqual({ a: 1, b: 2 })
  })
  it('skips a /* */ comment anywhere, on one line or over several', () => {
    const source = `/*
 * IMPORTANT: auto-generated
 */
{ /* open */ "a" /* key */ : /* colon */ 1 /* value */ , /* comma */ "b": [ /* in array */ 2, 3 /* last */ ] /* before brace */ } /* end */`
    expect(parseJsonc(source)).toEqual({ a: 1, b: [2, 3] })
  })
  it('reads a // or /* inside a string as text, URLs included', () => {
    expect(parseJsonc('{ "url": "https://x.example/a//b", "c": "a /* not */ b", "d": "// nor this" }'))
      .toEqual({ url: 'https://x.example/a//b', c: 'a /* not */ b', d: '// nor this' })
  })
  it('keeps an escaped quote and an escaped backslash inside a string from ending it', () => {
    expect(parseJsonc('{ "a": "say \\"hi\\" // still text", "b": "ends with a backslash \\\\", // a comment\n "c": 1 }'))
      .toEqual({ a: 'say "hi" // still text', b: 'ends with a backslash \\', c: 1 })
  })
  it('reads a string that holds a quote then a comment-like text after an escaped backslash', () => {
    // the string is `a\` and what follows the closing quote is a real comment
    expect(parseJsonc('{ "a": "a\\\\" /* real comment */, "b": 2 }')).toEqual({ a: 'a\\', b: 2 })
  })
  it('reads a comment-only line inside an array', () => {
    expect(parseJsonc('[\n  1,\n  // two is next\n  2\n]')).toEqual([1, 2])
  })
  it('accepts trailing commas in objects and arrays, also before a comment', () => {
    expect(parseJsonc('{ "a": [1, 2,], "b": { "c": 3, }, }')).toEqual({ a: [1, 2], b: { c: 3 } })
    expect(parseJsonc('{ "a": 1, // some useful context\n }')).toEqual({ a: 1 })
    expect(parseJsonc('[ 1, /* last */ ]')).toEqual([1])
    expect(parseJsonc('{ "a": [ { "b": 1, }, ], }')).toEqual({ a: [{ b: 1 }] })
  })
  it('reads a comma inside a string followed by a closer as text', () => {
    expect(parseJsonc('{ "a": "x,}", "b": ",]" }')).toEqual({ a: 'x,}', b: ',]' })
  })
  it('still rejects a comma that is not trailing', () => {
    expect(() => parseJsonc('[,]')).toThrow()
    expect(() => parseJsonc('{,}')).toThrow()
    expect(() => parseJsonc('[1,,2]')).toThrow()
    expect(() => parseJsonc('[1,,]')).toThrow()
    expect(() => parseJsonc('{ "a": , }')).toThrow()
    expect(() => parseJsonc('{ "a" , }')).toThrow()
    expect(() => parseJsonc('{ "a": 1 "b": 2 }')).toThrow()
  })
  it('rejects a comment that never ends and text after the value', () => {
    expect(() => parseJsonc('{ "a": 1 } /* open')).toThrow(/unterminated comment/i)
    expect(() => parseJsonc('{ "a": 1 } // fine\n x')).toThrow()
    expect(() => parseJsonc('{ "a": "open')).toThrow()
  })
  it('does not take a lone slash for a comment', () => {
    expect(() => parseJsonc('{ "a": 1 / 2 }')).toThrow()
  })
  it('keeps every other character of the file at its position, so an error points at the original text', () => {
    // the error is the missing comma before `"b"` on line 4, after a block comment that spans two lines and a line comment
    const source = '// one\n/* two\n three */\n{ "a": 1 "b": 2 }'
    const position = source.indexOf('"b"')
    expect(() => parseJsonc(source)).toThrow(new RegExp(`position ${position} \\(line 4 column 10\\)`))
  })
  it('parses a large file with comments and an unusual number of them', () => {
    const rows = Array.from({ length: 20000 }, (_, i) => `  // key ${i}\n  "k${i}": "v${i} // not a comment",`).join('\n')
    const parsed = parseJsonc(`{\n${rows}\n}`) as Record<string, string>
    expect(Object.keys(parsed)).toHaveLength(20000)
    expect(parsed.k19999).toBe('v19999 // not a comment')
  })
})

describe('shopify/theme/json parseThemeJson', () => {
  it('names the file in the error and keeps the original position', () => {
    expect(() => parseThemeJson('// c\n{ "a": 1 "b": 2 }', 'locales/en.default.json')).toThrow(/^locales\/en\.default\.json: .*position 14 \(line 2 column 10\)/)
  })
  it('names the file when a comment never ends', () => {
    expect(() => parseThemeJson('{} /* open', 'config/settings_data.json')).toThrow(/^config\/settings_data\.json: .*unterminated comment/i)
  })
})

describe('shopify/theme/runtime JSON files with comments', () => {
  const EDITOR_NOTICE = '/*\n * ------------------------------------------------------------\n * IMPORTANT: The contents of this file are auto-generated.\n * ------------------------------------------------------------\n */\n'

  // a storefront locale file as Horizon ships it: the editor notice, then `//` comments between keys, and plural keys that interpolate `count`
  const LOCALE = `${EDITOR_NOTICE}{
  "general": {
    "greeting": "Hello, {{ name }}!",
    // This is a comment between keys
    "items": {
      "one": "{{ count }} item", // after a value
      "other": "{{ count }} items"
    },
    "url": "https://example.com/a//b"
    // a comment after the last property
  }
}`

  it('translates from a locale file with comments through t, with interpolation and plurals', async () => {
    const { html, report } = await renderPage({ data: legacySampleData, theme: themeFiles({ 'locales/en.default.json': LOCALE }), templateName: 'index' })
    expect(html).toContain('<p>Hello, Ada!</p><p>1 item</p><p>3 items</p><p>translation missing: en.general.nope</p>')
    expect(report.unsupported).toEqual([])
    expect(report.missing).toEqual([{ kind: 'translation', name: 'general.nope' }])
  })

  it('reads a locale file with trailing commas', async () => {
    const locale = '{ "general": { "greeting": "Hello, {{ name }}!", "items": { "one": "{{ count }} item", "other": "{{ count }} items", }, }, }'
    const { html, report } = await renderPage({ data: legacySampleData, theme: themeFiles({ 'locales/en.default.json': locale }), templateName: 'index' })
    expect(html).toContain('<p>Hello, Ada!</p><p>1 item</p><p>3 items</p>')
    expect(report.unsupported).toEqual([])
  })

  it('translates a schema default through a schema locale file with comments', async () => {
    const schemaLocale = `${EDITOR_NOTICE}{
  "settings": {
    // the heading's default
    "heading": "Welcome"
  }
}`
    const files = {
      'locales/en.default.json': '{}',
      'locales/en.default.schema.json': schemaLocale,
      'sections/text.liquid': '<h1>{{ section.settings.heading }}</h1>{% schema %}{ "name": "Text", "settings": [{ "type": "text", "id": "heading", "label": "Heading", "default": "t:settings.heading" }] }{% endschema %}'
    }
    const { html, report } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index' })
    expect(html).toContain('<h1>Welcome</h1>')
    expect(report.unsupported).toEqual([])
  })

  it('reads a {% schema %} body with comments and trailing commas', async () => {
    const schema = `{
  "name": "Text", // the section's name
  /* the settings */
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "https://x.example/a", }, // a URL in a value
  ],
}`
    const files = { 'sections/text.liquid': `<h1>{{ section.settings.heading }}</h1>{% schema %}${schema}{% endschema %}` }
    const { html, report } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index' })
    expect(html).toContain('<h1>https://x.example/a</h1>')
    expect(report.unsupported).toEqual([])
  })

  it('reads templates, section groups and settings files with comments', async () => {
    const files = {
      'templates/index.json': `${EDITOR_NOTICE}{
  "sections": {
    // the only section
    "s": { "type": "text", "settings": { "heading": "From the template" } }, /* trailing */
  },
  "order": ["s"], // one
}`,
      'sections/text.liquid': '<h1>{{ section.settings.heading }}</h1><i>{{ settings.accent_name }}</i>{% sections "footer-group" %}{% schema %}{ "name": "Text", "settings": [{ "type": "text", "id": "heading", "label": "Heading" }] }{% endschema %}',
      'sections/footer-group.json': `${EDITOR_NOTICE}{
  "type": "footer", // group type
  "sections": { "f": { "type": "foot" } }, // one section
  "order": ["f"],
}`,
      'sections/foot.liquid': '<footer>foot</footer>',
      'config/settings_schema.json': `[
  // the theme's own settings
  { "name": "theme_info", "theme_name": "T" },
  { "name": "Colors", "settings": [ { "type": "text", "id": "accent_name", "label": "Accent", "default": "teal", }, ], },
]`,
      'config/settings_data.json': `${EDITOR_NOTICE}{
  "current": {
    // saved
    "accent_name": "navy"
  }
}`
    }
    const { html, report } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index' })
    expect(html).toContain('<h1>From the template</h1><i>navy</i>')
    expect(html).toContain('<footer>foot</footer>')
    expect(report.unsupported).toEqual([])
  })

  it('reports a locale file that does not parse once, with its file name and position', async () => {
    const broken = '{\n  "general": {\n    "greeting": "Hi" "oops": 1\n  }\n}'
    const { html, report } = await renderPage({ data: legacySampleData, theme: themeFiles({ 'locales/en.default.json': broken }), templateName: 'index' })
    expect(html).toContain('<p>translation missing: en.general.greeting</p>')
    expect(report.unsupported).toEqual([{ feature: 'locale_file', detail: expect.stringMatching(/^locales\/en\.default\.json: .*\(line 3 column 22\)/) }])
  })

  it('reports a schema locale file that does not parse once, with its file name', async () => {
    const files = {
      'locales/en.default.schema.json': '{ "settings": { "heading": "Welcome" ',
      'sections/text.liquid': '<h1>{{ section.settings.heading }}</h1><h2>{{ section.settings.sub }}</h2>{% schema %}{ "name": "Text", "settings": [{ "type": "text", "id": "heading", "label": "H", "default": "t:settings.heading" }, { "type": "text", "id": "sub", "label": "S", "default": "t:settings.sub" }] }{% endschema %}'
    }
    const { report } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index' })
    expect(report.unsupported.filter(entry => entry.feature === 'locale_file')).toEqual([{ feature: 'locale_file', detail: expect.stringMatching(/^locales\/en\.default\.schema\.json: /) }])
  })
})
