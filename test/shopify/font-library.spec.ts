import { readFileSync } from 'fs'
import { join } from 'path'
import { createShopifyLiquid, defaultServices, isShopifyFontFile, renderLiquid, shopifyFontInfo } from '../../src/shopify'
import { loadFixture } from '../storefront/fixtures'

const ASSISTANT = { woff2: 'assistant/assistant_n4.9120912a469cad1cc292572851508ca49d12e768.woff2', woff: 'assistant/assistant_n4.6e9875ce64e0fefcd3f4446b7ec9036b3ddd2985.woff' }
const page: { library: Array<{ family: string, handles: string[] }>, retired: Array<{ family: string, handles: string[], replacement: string }> } = JSON.parse(readFileSync(join(__dirname, '../storefront/font-page.json'), 'utf8'))
// the retired handles the parity store has no font for: it raises "Font not found" for each
const NO_FONT = ['memphis_i3', 'memphis_i5', 'memphis_i7']

describe("Shopify's font library", () => {
  it('knows every handle shopify.dev lists in the library', () => {
    for (const { handles } of page.library) for (const handle of handles) expect([handle, shopifyFontInfo(handle)?.handle]).toEqual([handle, handle])
  })
  it('reads a font as the parity store prints it', () => {
    expect(shopifyFontInfo('assistant_n4')).toMatchObject({ handle: 'assistant_n4', family: 'Assistant', style: 'normal', weight: 400, system: false, files: ASSISTANT })
    expect([...shopifyFontInfo('assistant_n4')!.variants].sort()).toEqual(['assistant_n2', 'assistant_n3', 'assistant_n4', 'assistant_n5', 'assistant_n6', 'assistant_n7', 'assistant_n8'])
  })
  it('gives a retired handle the font Shopify renders in its place', () => {
    expect(shopifyFontInfo('harmonia_sans_n4')).toMatchObject({ family: 'Poppins' })
  })
  it('knows no other handle', () => {
    for (const handle of ['assistant_i4', 'nope_n4', '__proto__', 'constructor', '']) expect([handle, shopifyFontInfo(handle)]).toEqual([handle, undefined])
  })
  it('has no files for a system font', () => {
    expect(shopifyFontInfo('mono')).toMatchObject({ system: true })
    expect(shopifyFontInfo('mono')!.files).toBeUndefined()
  })
  it('names exactly the library files', () => {
    expect(isShopifyFontFile(ASSISTANT.woff2)).toBe(true)
    expect(isShopifyFontFile(ASSISTANT.woff)).toBe(true)
    for (const path of ['assistant/assistant_n4.woff2', `/${ASSISTANT.woff2}`, `assistant/../${ASSISTANT.woff2}`, `${ASSISTANT.woff2}?x=1`, '']) expect([path, isShopifyFontFile(path)]).toEqual([path, false])
  })
  it('is the default fontInfo, and the default font_url points at the files', async () => {
    expect(defaultServices.fontInfo).toBe(shopifyFontInfo)
    const { html } = await renderLiquid(createShopifyLiquid(), "{{ 'assistant_n4' | font_url }}|{{ 'assistant_n4' | font_url: 'woff' }}")
    expect(html).toBe(`/fonts/${ASSISTANT.woff2}|/fonts/${ASSISTANT.woff}`)
  })
  it('prints nothing for a system font, which has no file', async () => {
    const { html, report } = await renderLiquid(createShopifyLiquid(), "{{ 'mono' | font_url }}|{{ 'mono' | font_url: 'woff' }}|{{ 'sans_serif_n4' | font_url }}|{{ 'system_ui_n4' | font_url: 'woff' }}")
    expect(html).toBe('|||')
    expect(report.unsupported).toEqual([])
  })
  it('asks a custom fontUrl for a font with files, and never for a system font', async () => {
    const asked: string[] = []
    const liquid = createShopifyLiquid({ services: { fontUrl: font => { asked.push(font.handle); return `https://fonts.example/${font.handle}` } } })
    const { html } = await renderLiquid(liquid, "{{ 'assistant_n4' | font_url }}|{{ 'mono' | font_url }}")
    expect(html).toBe('https://fonts.example/assistant_n4|')
    expect(asked).toEqual(['assistant_n4'])
  })
  it('keeps the old default address for a font without files', async () => {
    const liquid = createShopifyLiquid({ services: { fontInfo: handle => ({ handle, family: 'Mine', style: 'normal', weight: 400, fallback_families: 'serif', baseline_ratio: 0, system: false, variants: [handle] }) } })
    expect((await renderLiquid(liquid, "{{ 'mine_n4' | font_url }}|{{ 'mine_n4' | font_url: 'woff' }}")).html).toBe('/fonts/mine_n4.woff2|/fonts/mine_n4.woff')
  })
  it('hands out frozen fonts, one object per handle', () => {
    const font = shopifyFontInfo('assistant_n4')!
    expect(Object.isFrozen(font)).toBe(true)
    expect(Object.isFrozen(font.files)).toBe(true)
    expect(shopifyFontInfo('assistant_n4')).toBe(font)
  })

  // the fixtures are what Shopify printed; the table must give back every font of them
  const printed = (name: string): Array<{ handle: string, font: any }> => {
    const steps = loadFixture(name).steps
    return (steps[steps.length - 1].body as { fonts: Array<{ handle: string, font: any }> }).fonts
  }
  const family = (quoted: string) => /^".*"$/.test(quoted) ? quoted.slice(1, -1).replace(/\\"/g, '"') : quoted
  const same = (info: NonNullable<ReturnType<typeof shopifyFontInfo>>, font: any) => {
    expect({ family: info.family, fallback: info.fallback_families, weight: String(info.weight), style: info.style, system: info.system, ratio: info.baseline_ratio, woff2: info.files ? `/fonts/${info.files.woff2}` : '', woff: info.files ? `/fonts/${info.files.woff}` : '' })
      .toEqual({ family: family(font.family), fallback: font.fallback_families, weight: font.weight, style: font.style, system: font.system, ratio: font.baseline_ratio, woff2: font.woff2, woff: font.woff })
  }
  it('gives back every font of the library fixture, variants included', () => {
    for (const { handle, font } of printed('probe-fonts-library')) {
      same(shopifyFontInfo(handle)!, font)
      expect(shopifyFontInfo(handle)!.variants).toHaveLength(font.variants.length)
      const variants = shopifyFontInfo(handle)!.variants.map(h => shopifyFontInfo(h)!)
      variants.forEach((info, i) => same(info, font.variants[i]))
    }
  })
  it('gives every retired handle the font its fixture printed, and nothing for the three Shopify has no font for', () => {
    const fixtures = ['probe-fonts-retired-1', 'probe-fonts-retired-2', 'probe-fonts-retired-3', 'probe-fonts-retired-4']
    const handles = fixtures.flatMap(printed)
    expect(handles.map(item => item.handle)).toEqual(page.retired.flatMap(row => row.handles))
    for (const { handle, font } of handles) {
      if (font === null) expect([handle, shopifyFontInfo(handle)]).toEqual([handle, undefined])
      else same(shopifyFontInfo(handle)!, font)
    }
    expect(handles.filter(item => item.font === null).map(item => item.handle)).toEqual(NO_FONT)
  })
})
