import { join } from 'path'
import { renderPage, renderSection } from '../../../src/shopify'
import { loadTheme } from './load-fixture'

const theme = loadTheme(join(__dirname, '../fixtures/theme'))

/**
 * https://shopify.dev/docs/storefronts/themes/architecture/settings/input-settings#color_scheme: a `color_scheme` setting returns "the selected `color_scheme` object from `color_scheme_group`"; with no or an invalid value "the default value from `color_scheme` is returned", then "the first `color_scheme` from `color_scheme_group`"; and "If the theme doesn't have `color_scheme_group` data in `settings_data.json`, then nil is returned". The group itself is `settings.color_schemes` (https://shopify.dev/docs/api/liquid/objects/color_scheme_group), each scheme a https://shopify.dev/docs/api/liquid/objects/color_scheme.
 */
describe('shopify/theme colour schemes', () => {
  const banner = '<div class="banner" style="background: #336699; color: #f4f4f4">scheme-2|scheme-2|#121212|#ffffff</div>'
  // t1 saves scheme-1, t2 saves an id no scheme has and t3 saves nothing, so t2 and t3 read the tile setting's default, scheme-2
  const tiles = '<div id="shopify-block-t1" class="shopify-block"><span class="tile" style="color: #121212">scheme-1:#ffffff</span></div><div id="shopify-block-t2" class="shopify-block"><span class="tile" style="color: #f4f4f4">scheme-2:#336699</span></div><div id="shopify-block-t3" class="shopify-block"><span class="tile" style="color: #f4f4f4">scheme-2:#336699</span></div>'
  // banner.liquid ends `{% content_for 'blocks' %}`, a newline and `{%- schema -%}`: the storefront's bug-compatible trimming keeps that newline
  const section = `<div id="shopify-section-template--schemes__banner" class="shopify-section">${banner}${tiles}\n</div>`

  it('gives a section and its blocks the scheme settings_data.json holds, through renderPage', async () => {
    const { html, report } = await renderPage({ theme, templateName: 'schemes' })
    expect(html).toBe(section)
    expect(report.unsupported).toEqual([])
    expect(report.errors).toEqual([])
  })
  it('does the same through renderSection', async () => {
    const { html, report } = await renderSection({ theme, templateName: 'schemes', section: 'banner' })
    expect(html).toBe(section)
    expect(report.unsupported).toEqual([])
  })
  it('falls back to the first scheme when the setting default is no scheme either', async () => {
    const files = { ...theme.files, 'blocks/tile.liquid': theme.files['blocks/tile.liquid'].replace('"default": "scheme-2"', '"default": "scheme-404"') }
    const { html } = await renderPage({ theme: { files }, templateName: 'schemes' })
    const first = '<span class="tile" style="color: #121212">scheme-1:#ffffff</span>'
    expect(html).toContain(`<div id="shopify-block-t2" class="shopify-block">${first}</div><div id="shopify-block-t3" class="shopify-block">${first}</div>`)
  })
  it('gives a statically rendered section the saved scheme, or the setting default without a saved entry', async () => {
    const files = {
      ...theme.files,
      'templates/static.liquid': "{% layout none %}{% section 'banner' %}",
      'config/settings_data.json': theme.files['config/settings_data.json'].replace('"sections": {', '"sections": { "banner": { "type": "banner", "settings": { "color_scheme": "scheme-2" } },')
    }
    const saved = await renderPage({ theme: { files }, templateName: 'static' })
    expect(saved.html).toContain('<div class="banner" style="background: #336699; color: #f4f4f4">scheme-2|scheme-2|#121212|</div>')
    const unsaved = await renderPage({ theme: { files: { ...files, 'config/settings_data.json': theme.files['config/settings_data.json'] } }, templateName: 'static' })
    expect(unsaved.html).toContain('<div class="banner" style="background: #ffffff; color: #121212">scheme-1|scheme-1|#121212|</div>')
  })
  it('reads settings.color_schemes by scheme id, and nil for an id no scheme has', async () => {
    const files = { ...theme.files, 'templates/lookup.liquid': "{% layout none %}{{ settings.color_schemes['scheme-1'].settings.text }}|{{ settings.color_schemes['scheme-2'].settings.background }}|[{{ settings.color_schemes['scheme-9'].settings.text }}]|{{ settings.color_schemes.size }}" }
    const { html } = await renderPage({ theme: { files }, templateName: 'lookup' })
    expect(html).toBe('#121212|#336699|[]|2')
  })
  it('reads nil and reports it when the theme has no color_scheme_group data', async () => {
    const schema = [{ name: 'theme_info', theme_name: 'Fixture', theme_version: '1.0.0' }]
    const data = { current: { accent: '#334fb4', sections: {} } }
    const files = { ...theme.files, 'config/settings_schema.json': JSON.stringify(schema), 'config/settings_data.json': JSON.stringify(data) }
    const { html, report } = await renderPage({ theme: { files }, templateName: 'schemes' })
    expect(html).toContain('<div class="banner" style="background: ; color: ">|||</div>')
    expect(html).toContain('<span class="tile" style="color: ">:</span>')
    expect(report.unsupported).toEqual([{ feature: 'color_scheme', detail: 'color_scheme has no color_scheme_group data' }])
  })
})
