import { ColorDrop, createShopifyLiquid, FontDrop, parseFontHandle, renderLiquid } from '../../../src/shopify'
import type { FontInfo } from '../../../src/shopify'

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

  // https://shopify.dev/docs/api/liquid/filters/font_face
  it('font_face', async () => {
    expect(await render('{{ settings.type_header_font | font_face }}', { settings }, liquid)).toBe(`@font-face {\n  font-family: Assistant;\n  font-weight: 400;\n  font-style: normal;\n  src: url("${urls.woff2}") format("woff2"),\n       url("${urls.woff}") format("woff");\n}`)
    expect(await render("{{ settings.type_header_font | font_face: font_display: 'swap' }}", { settings }, liquid)).toBe(`@font-face {\n  font-family: Assistant;\n  font-weight: 400;\n  font-style: normal;\n  font-display: swap;\n  src: url("${urls.woff2}") format("woff2"),\n       url("${urls.woff}") format("woff");\n}`)
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
