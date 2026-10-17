import { ColorDrop, createShopifyLiquid, FontDrop, renderLiquid } from '../../../src/shopify'
import type { FontInfo } from '../../../src/shopify'
import { parseFontHandle } from '../../../src/shopify/services'

async function render (source: string, scope: object = {}, liquid = createShopifyLiquid()) {
  return (await renderLiquid(liquid, source, scope)).html
}

describe('shopify/filters/color', () => {
  // Each pair is the example on the filter's shopify.dev page (https://shopify.dev/docs/api/liquid/filters/<name>).
  const examples: Array<[string, string]> = [
    ["{{ '#EA5AB9' | color_brightness }}", '143.89'],
    ["{{ '#E800B0' | color_contrast: '#D9D8FF' }}", '3.0'],
    ["{{ '#EA5AB9' | color_darken: 30 }}", '#98136b'],
    ["{{ '#EA5AB9' | color_desaturate: 30 }}", '#ce76b0'],
    ["{{ '#720955' | color_difference: '#FFF3F9' }}", '539'],
    ["{{ '#EA5AB9' | color_extract: 'red' }}", '234'],
    ["{{ '#EA5AB9' | color_lighten: 30 }}", '#fbe2f3'],
    ["{{ '#E800B0' | color_mix: '#00936F', 50 }}", '#744a90'],
    ["{{ 'rgba(232, 0, 176, 0.75)' | color_mix: '#00936F', 50 }}", 'rgba(116, 74, 144, 0.88)'],
    ["{{ '#EA5AB9' | color_modify: 'red', 255 }}", '#ff5ab9'],
    ["{{ '#EA5AB9' | color_modify: 'alpha', 0.85 }}", 'rgba(234, 90, 185, 0.85)'],
    ["{{ '#EA5AB9' | color_saturate: 30 }}", '#ff45c0'],
    ["{{ 'rgb(234, 90, 185)' | color_to_hex }}", '#ea5ab9'],
    ["{{ '#EA5AB9' | color_to_hsl }}", 'hsl(320, 77%, 64%)'],
    ["{{ '#EA5AB9' | color_to_oklch }}", 'oklch(68% 0.2 343 / 1.0)'],
    ["{{ '#EA5AB9' | color_to_rgb }}", 'rgb(234, 90, 185)'],
    ["{{ '#E800B0' | brightness_difference: '#FECEE9' }}", '134'],
    ["{{ '#EA5AB9' | hex_to_rgba }}", 'rgba(234,90,185,1)'],
    ["{{ '#EA5AB9' | hex_to_rgba: 0.5 }}", 'rgba(234,90,185,0.5)']
  ]
  it.each(examples)('%s', async (source, expected) => {
    expect(await render(source)).toBe(expected)
  })
  it('renders empty and reports a value that is not a colour', async () => {
    const { html, report } = await renderLiquid(createShopifyLiquid(), "[{{ 'blue-ish' | color_darken: 10 }}][{{ '' | color_to_rgb }}]")
    expect(html).toBe('[][]')
    expect(report.unsupported).toEqual([{ feature: 'color_darken', detail: 'not a colour: blue-ish' }])
  })
  // https://shopify.dev/docs/api/liquid/objects/color
  it('the color object', async () => {
    const color = ColorDrop.from('#334fb4')
    const source = '{{ c }}|{{ c.red }} {{ c.green }} {{ c.blue }} {{ c.alpha }}|{{ c.hue }} {{ c.saturation }} {{ c.lightness }}|{{ c.rgb }}|{{ c.rgba }}|{{ c.oklch }}|{{ c.oklcha }}|{{ c.chroma }}|{{ c | color_darken: 10 }}'
    expect(await render(source, { c: color })).toBe('#334fb4|51 79 180 1.0|227 56 45|51 79 180|51 79 180 / 1.0|47% 0.16 268|47% 0.16 268 / 1.0|0.16|#283e8c')
    expect(ColorDrop.from('')).toBeUndefined()
  })
  // Dawn's layout/theme.liquid assigns `background | color_darken: 25` and prints its `.red`, `.green` and `.blue`; the parity store prints `191,191,191` for white
  it('returns a colour object from color_darken, color_lighten, color_saturate, color_desaturate, color_modify and color_mix', async () => {
    const source = [
      "{% assign c = '#ffffff' | color_darken: 25 %}{{ c }} {{ c.red }},{{ c.green }},{{ c.blue }}",
      "{% assign c = '#000000' | color_lighten: 50 %}{{ c }} {{ c.red }},{{ c.green }},{{ c.blue }}",
      "{% assign c = '#EA5AB9' | color_saturate: 30 %}{{ c.red }}",
      "{% assign c = '#EA5AB9' | color_desaturate: 30 %}{{ c.green }}",
      "{% assign c = '#EA5AB9' | color_modify: 'red', 255 %}{{ c }} {{ c.red }}",
      "{% assign c = '#EA5AB9' | color_modify: 'alpha', 0.85 %}{{ c }} {{ c.alpha }}",
      "{% assign c = '#E800B0' | color_mix: '#00936F', 50 %}{{ c }} {{ c.blue }}",
      "{{ '#ffffff' | color_darken: 25 | json }}"
    ].join('|')
    expect(await render(source)).toBe('#bfbfbf 191,191,191|#808080 128,128,128|255|118|#ff5ab9 255|rgba(234, 90, 185, 0.85) 0.85|#744a90 144|"#bfbfbf"')
  })
})

describe('shopify/filters/color: forms the pages describe but give no example for', () => {
  const cases: Array<[string, string]> = [
    // https://shopify.dev/docs/api/liquid/filters/color_to_rgb: "Converts a CSS color string to RGB format"; a translucent colour becomes RGBA.
    ["{{ '#EA5AB980' | color_to_rgb }}", 'rgba(234, 90, 185, 0.5)'],
    ["{{ 'rgba(234, 90, 185, 0.5)' | color_to_rgb }}", 'rgba(234, 90, 185, 0.5)'],
    // https://shopify.dev/docs/api/liquid/filters/color_to_hsl: a translucent colour becomes HSLA.
    ["{{ '#EA5AB980' | color_to_hsl }}", 'hsla(320, 77%, 64%, 0.5)'],
    // https://shopify.dev/docs/api/liquid/filters/color_to_hex: the alpha channel is dropped.
    ["{{ 'rgba(234, 90, 185, 0.5)' | color_to_hex }}", '#ea5ab9'],
    ["{{ '#EA5AB980' | color_to_hex }}", '#ea5ab9'],
    // https://shopify.dev/docs/api/liquid/filters/color_to_oklch keeps the alpha after the slash.
    ["{{ 'rgba(234, 90, 185, 0.5)' | color_to_oklch }}", 'oklch(68% 0.2 343 / 0.5)'],
    // Three-digit hex: https://shopify.dev/docs/api/liquid/filters/hex_to_rgba shows `#fff`-style input.
    ["{{ '#abc' | hex_to_rgba }}", 'rgba(170,187,204,1)'],
    ["{{ '#f80' | color_to_hex }}", '#ff8800'],
    ["{{ '#f808' | color_to_rgb }}", 'rgba(255, 136, 0, 0.53)'],
    // hsl() input.
    ["{{ 'hsl(240, 100%, 50%)' | color_to_hex }}", '#0000ff'],
    // color_mix at a weight other than 50. The tip on the page pins the ends ("A percentage factor of 100 returns the color being filtered. A percentage factor of 0 returns the color supplied to the filter."), so 25 is 25% of the first colour; the page's example shows only 50, so the values between the ends are not pinned.
    ["{{ '#EA5AB9' | color_mix: '#00936F', 25 }}", '#3b8582'],
    ["{{ '#EA5AB9' | color_mix: '#00936F', 100 }}", '#ea5ab9'],
    ["{{ '#EA5AB9' | color_mix: '#00936F', 0 }}", '#00936f']
  ]
  it.each(cases)('%s', async (source, expected) => {
    expect(await render(source)).toBe(expected)
  })
  it('the color object reads rgba() input', async () => {
    const color = ColorDrop.from('rgba(51, 79, 180, 0.5)')!
    expect(await render('{{ c.alpha }} {{ c.rgba }} {{ c.oklcha }}', { c: color })).toBe('0.5 51 79 180 / 0.5 47% 0.16 268 / 0.5')
  })

  // A missing or unusable argument returns the input unchanged and is reported (shopify.dev does not pin the error case); it never writes NaN.
  const bad: Array<[string, string, string]> = [
    ["{{ '#EA5AB9' | color_darken }}", 'color_darken', 'missing argument'],
    ["{{ '#EA5AB9' | color_lighten: 'abc' }}", 'color_lighten', 'not a number: abc'],
    ["{{ '#EA5AB9' | color_saturate: '30%' }}", 'color_saturate', 'not a number: 30%'],
    ["{{ '#EA5AB9' | color_desaturate: nothing }}", 'color_desaturate', 'missing argument'],
    ["{{ '#EA5AB9' | color_modify: 'red' }}", 'color_modify', 'missing argument'],
    ["{{ '#EA5AB9' | color_modify: 'red', 'x' }}", 'color_modify', 'not a number: x'],
    ["{{ '#EA5AB9' | color_modify: 'shade', 10 }}", 'color_modify', 'not a colour component: shade'],
    ["{{ '#EA5AB9' | color_modify }}", 'color_modify', 'missing argument'],
    ["{{ '#EA5AB9' | color_mix }}", 'color_mix', 'missing argument'],
    ["{{ '#EA5AB9' | color_mix: 'nope', 50 }}", 'color_mix', 'not a colour: nope'],
    ["{{ '#EA5AB9' | color_mix: '#00936F' }}", 'color_mix', 'missing argument'],
    ["{{ '#EA5AB9' | color_mix: '#00936F', 'half' }}", 'color_mix', 'not a number: half'],
    ["{{ '#EA5AB9' | hex_to_rgba: 'half' }}", 'hex_to_rgba', 'not a number: half'],
    ["{{ '#EA5AB9' | color_extract: 'shade' }}", 'color_extract', 'not a colour component: shade'],
    ["{{ '#EA5AB9' | color_extract }}", 'color_extract', 'missing argument'],
    ["{{ '#EA5AB9' | color_contrast }}", 'color_contrast', 'missing argument'],
    ["{{ '#EA5AB9' | color_difference: 'x' }}", 'color_difference', 'not a colour: x'],
    ["{{ '#EA5AB9' | brightness_difference }}", 'brightness_difference', 'missing argument']
  ]
  it.each(bad)('%s', async (source, feature, detail) => {
    const { html, report } = await renderLiquid(createShopifyLiquid(), source)
    expect(html).toBe('#EA5AB9')
    expect(report.unsupported).toEqual([{ feature, detail }])
  })
})

describe('shopify/filters/font', () => {
  // The URLs Shopify's font CDN gives Assistant regular on https://shopify.dev/docs/api/liquid/filters/font_face.
  const urls: Record<string, string> = {
    woff2: '//polinas-potent-potions.myshopify.com/cdn/fonts/assistant/assistant_n4.9120912a469cad1cc292572851508ca49d12e768.woff2',
    woff: '//polinas-potent-potions.myshopify.com/cdn/fonts/assistant/assistant_n4.6e9875ce64e0fefcd3f4446b7ec9036b3ddd2985.woff'
  }
  const library: Record<string, FontInfo> = {
    assistant_n4: { ...parseFontHandle('assistant_n4')!, variants: ['assistant_n4', 'assistant_n7'] },
    assistant_n7: { ...parseFontHandle('assistant_n7')!, variants: ['assistant_n4', 'assistant_n7'] }
  }
  const liquid = createShopifyLiquid({ services: { fontUrl: (_font, format) => urls[format], fontInfo: handle => library[handle] } })
  const assistant = new FontDrop(library.assistant_n4, handle => library[handle])
  const settings = { type_header_font: assistant, type_body_font: assistant }

  // https://shopify.dev/docs/api/liquid/filters/font_face; the rule ends with a line break, as the parity store prints it (scenario `page-home`: the last rule of the font block is followed by `\n:root`, so the storefront's `}:root {` was `} :root {` on Shopify)
  it('font_face', async () => {
    expect(await render('{{ settings.type_header_font | font_face }}', { settings }, liquid)).toBe(`@font-face {\n  font-family: Assistant;\n  font-weight: 400;\n  font-style: normal;\n  src: url("${urls.woff2}") format("woff2"),\n       url("${urls.woff}") format("woff");\n}\n`)
    expect(await render("{{ settings.type_header_font | font_face: font_display: 'swap' }}", { settings }, liquid)).toBe(`@font-face {\n  font-family: Assistant;\n  font-weight: 400;\n  font-style: normal;\n  font-display: swap;\n  src: url("${urls.woff2}") format("woff2"),\n       url("${urls.woff}") format("woff");\n}\n`)
    expect(await render('{{ settings.type_header_font | font_face }}:root', { settings }, liquid)).toContain('format("woff");\n}\n:root')
  })
  // https://shopify.dev/docs/api/liquid/filters/font_url
  it('font_url', async () => {
    expect(await render('{{ settings.type_header_font | font_url }}', { settings }, liquid)).toBe(urls.woff2)
    expect(await render("{{ settings.type_header_font | font_url: 'woff' }}", { settings }, liquid)).toBe(urls.woff)
  })
  // https://shopify.dev/docs/api/liquid/filters/font_modify
  it('font_modify, including variants the family lacks', async () => {
    const source = [
      "{%- assign bold_font = settings.type_body_font | font_modify: 'weight', 'bold' -%}",
      "{%- assign italic_font = settings.type_body_font | font_modify: 'style', 'italic' -%}",
      "{%- assign heavy_font = settings.type_body_font | font_modify: 'weight', '900' | default: bold_font -%}",
      "{%- assign oblique_font = settings.type_body_font | font_modify: 'style', 'oblique' | default: italic_font -%}",
      'h2 {\n  font-style: {{ heavy_font.weight }};\n}\n.italic {\n  {% if oblique_font -%}\n    font-style: {{ oblique_font.style }};\n  {%- else -%}\n    font-style: {{ italic_font.style }};\n  {%- endif %}\n}'
    ].join('\n')
    expect(await render(source, { settings }, liquid)).toBe('h2 {\n  font-style: 700;\n}\n.italic {\n  font-style: ;\n}')
    expect(await render("{{ settings.type_body_font | font_modify: 'weight', '+300' | font_url }}", { settings }, liquid)).toBe(urls.woff2)
  })
  // https://shopify.dev/docs/api/liquid/objects/font
  it('the font object', async () => {
    const font = new FontDrop({ handle: 'open_sans_n4', family: 'Open Sans', style: 'normal', weight: 400, fallback_families: 'sans-serif', baseline_ratio: 0.133, system: false, variants: [] }, () => undefined)
    expect(await render('{{ f.family }}, {{ f.fallback_families }}|{{ f.weight }}|{{ f.style }}|{{ f.baseline_ratio }}|{{ f.system? }}|{{ f.variants | size }}', { f: font })).toBe('"Open Sans", sans-serif|400|normal|0.133|false|0')
  })
})

describe('shopify/filters/font: a font library that knows the family', () => {
  const handles = ['assistant_n3', 'assistant_n4', 'assistant_n7', 'assistant_i4', 'assistant_i7']
  const library: Record<string, FontInfo> = {}
  for (const handle of handles) library[handle] = { ...parseFontHandle(handle)!, variants: handles }
  library.mono_n4 = { ...parseFontHandle('mono_n4')!, system: true, variants: ['mono_n4'] }
  const services = {
    fontUrl: (font: FontInfo, format: 'woff2' | 'woff') => `/fonts/${font.handle}.${format}`,
    fontInfo: (handle: string) => library[handle]
  }
  const liquid = createShopifyLiquid({ services })
  const lookup = (handle: string) => library[handle]
  const regular = new FontDrop(library.assistant_n4, lookup)
  const bold = new FontDrop(library.assistant_n7, lookup)

  // https://shopify.dev/docs/api/liquid/filters/font_modify: its table of properties and modification values.
  const modify: Array<[string, string, string]> = [
    ['regular', "'weight', '+300'", 'assistant_n7'],
    ['bold', "'weight', '-300'", 'assistant_n4'],
    ['regular', "'weight', 'bolder'", 'assistant_n7'],
    ['bold', "'weight', 'lighter'", 'assistant_n4'],
    ['regular', "'weight', 'bold'", 'assistant_n7'],
    ['bold', "'weight', 'normal'", 'assistant_n4'],
    ['regular', "'weight', '300'", 'assistant_n3'],
    ['regular', "'style', 'italic'", 'assistant_i4'],
    ['bold', "'style', 'italic'", 'assistant_i7'],
    ['bold', "'style', 'normal'", 'assistant_n7']
  ]
  it.each(modify)('%s | font_modify: %s', async (which, args, handle) => {
    const source = `{{ f | font_modify: ${args} | font_url }}`
    expect(await render(source, { f: which === 'regular' ? regular : bold }, liquid)).toBe(`/fonts/${handle}.woff2`)
  })
  it('font_modify keeps the style when it changes the weight, and returns nil for a variant the family lacks', async () => {
    const italic = new FontDrop(library.assistant_i4, lookup)
    expect(await render("{{ f | font_modify: 'weight', 'bolder' | font_url }}", { f: italic }, liquid)).toBe('/fonts/assistant_i7.woff2')
    const { html, report } = await renderLiquid(liquid, "[{{ f | font_modify: 'style', 'oblique' }}][{{ f | font_modify: 'weight', '+500' }}][{{ f | font_modify: 'weight', '-300' }}]", { f: regular })
    expect(html).toBe('[][][]')
    expect(report.unsupported).toEqual([])
  })
  it('font_modify reports an unusable property or value and returns nil', async () => {
    const { html, report } = await renderLiquid(liquid, "[{{ f | font_modify: 'size', '2' }}][{{ f | font_modify: 'weight', 'toString' }}][{{ f | font_modify: 'weight', '+50' }}][{{ f | font_modify: 'style', 'slanted' }}]", { f: regular })
    expect(html).toBe('[][][][]')
    expect(report.unsupported).toEqual([
      { feature: 'font_modify', detail: 'unknown property: size' },
      { feature: 'font_modify', detail: 'not a font weight: toString' },
      { feature: 'font_modify', detail: 'not a font weight: +50' },
      { feature: 'font_modify', detail: 'not a font style: slanted' }
    ])
  })
  it('the filters accept a font handle the library knows', async () => {
    expect(await render("{{ 'assistant_n7' | font_url }}|{{ 'assistant_n7' | font_url: 'woff' }}", {}, liquid)).toBe('/fonts/assistant_n7.woff2|/fonts/assistant_n7.woff')
    expect(await render("{{ 'assistant_n4' | font_modify: 'weight', 'bold' | font_url }}", {}, liquid)).toBe('/fonts/assistant_n7.woff2')
  })
  it('an unknown font, or format, renders as before and is reported', async () => {
    const { html, report } = await renderLiquid(liquid, "[{{ 'nope_n4' | font_url }}][{{ 'nope_n4' | font_face }}][{{ 'nope_n4' | font_modify: 'weight', 'bold' }}][{{ blank | font_url }}][{{ f | font_url: 'ttf' }}]", { f: regular })
    expect(html).toBe('[][][][][/fonts/assistant_n4.woff2]')
    expect(report.unsupported).toEqual([
      { feature: 'font_url', detail: 'unknown font: nope_n4' },
      { feature: 'font_face', detail: 'unknown font: nope_n4' },
      { feature: 'font_modify', detail: 'unknown font: nope_n4' },
      { feature: 'font_url', detail: 'unknown format: ttf' }
    ])
  })
  it('font_face uses a fontFace service when there is one, and writes nothing for a system font', async () => {
    const custom = createShopifyLiquid({ services: { ...services, fontFace: (font, options) => `FACE ${font.handle} ${options.fontDisplay}` } })
    expect(await render("{{ f | font_face: font_display: 'swap' }}", { f: regular }, custom)).toBe('FACE assistant_n4 swap')
    const system = new FontDrop(library.mono_n4, lookup)
    expect(await render('[{{ f | font_face }}]', { f: system }, liquid)).toBe('[]')
    expect(await render('[{{ f | font_face }}]', { f: system }, custom)).toBe('[]')
    expect(await render('{{ f.system? }}', { f: system }, liquid)).toBe('true')
  })
  it('FontDrop.variants and variant()', () => {
    expect(regular.variants.map(font => font.info.handle)).toEqual(handles)
    expect(regular.variants.includes(regular)).toBe(true)
    expect(regular.variant('normal', 400)).toBe(regular)
    expect(regular.variant('italic', 700)!.info.handle).toBe('assistant_i7')
    expect(regular.variant('oblique', 400)).toBeUndefined()
    expect(regular.variant('normal', 500)).toBeUndefined()
  })
})
