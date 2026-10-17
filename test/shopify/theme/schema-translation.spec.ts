import { renderPage } from '../../../src/shopify'
import { legacySampleData } from '../legacy-sample'

/** A theme of a layout, one JSON template and whatever else a case adds. */
function themeFiles (extra: Record<string, string>): { files: Record<string, string> } {
  return {
    files: {
      'layout/theme.liquid': '<main>{{ content_for_layout }}</main>',
      'templates/index.json': '{ "sections": { "s": { "type": "text" } }, "order": ["s"] }',
      ...extra
    }
  }
}

// https://shopify.dev/docs/storefronts/themes/architecture/locales/schema-locale-files#content: `default` is translatable on `html`, `inline_richtext`, `liquid`, `richtext`, `text`, `textarea`, `url`, `video` and `video_url`.
describe('shopify/theme/runtime schema translation keys in a setting default', () => {
  const SCHEMA_LOCALE = '{ "settings": { "link": "/collections/all", "movie": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "heading": "Welcome", "intro": "<p>Hi <b>there</b></p>" } }'
  const SECTION = (settings: string) => `{{ section.settings.link }}|{{ section.settings.movie.id }}|{{ section.settings.heading }}|{{ section.settings.intro }}{% schema %}{ "name": "t:sections.text.name", "settings": [${settings}] }{% endschema %}`
  const settings = [
    '{ "type": "url", "id": "link", "label": "t:settings.link", "default": "t:settings.link" }',
    '{ "type": "video_url", "id": "movie", "label": "Movie", "accept": ["youtube"], "default": "t:settings.movie" }',
    '{ "type": "text", "id": "heading", "label": "Heading", "default": "t:settings.heading" }',
    '{ "type": "richtext", "id": "intro", "label": "Intro", "default": "t:settings.intro" }'
  ].join(',')

  it('reads a t: default through the schema locale file for every type shopify.dev lists', async () => {
    const files = { 'locales/en.default.json': '{}', 'locales/en.default.schema.json': SCHEMA_LOCALE, 'sections/text.liquid': SECTION(settings) }
    const { html } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index' })
    expect(html).toContain('/collections/all|dQw4w9WgXcQ|Welcome|<p>Hi <b>there</b></p>')
  })

  it('reads the key from the rendered language, then the default', async () => {
    const files = {
      'locales/en.default.json': '{}',
      'locales/fr.json': '{}',
      'locales/en.default.schema.json': SCHEMA_LOCALE,
      'locales/fr.schema.json': '{ "settings": { "heading": "Bienvenue" } }',
      'sections/text.liquid': SECTION(settings)
    }
    const { html } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index', locale: 'fr' })
    expect(html).toContain('/collections/all|dQw4w9WgXcQ|Bienvenue|<p>Hi <b>there</b></p>')
  })

  it('keeps the t: string when the schema locale files have no such key', async () => {
    const files = { 'locales/en.default.json': '{}', 'locales/en.default.schema.json': '{}', 'sections/text.liquid': SECTION('{ "type": "text", "id": "heading", "label": "H", "default": "t:settings.heading" }') }
    const { html } = await renderPage({ data: legacySampleData, theme: themeFiles(files), templateName: 'index' })
    expect(html).toContain('||t:settings.heading|')
  })
})
