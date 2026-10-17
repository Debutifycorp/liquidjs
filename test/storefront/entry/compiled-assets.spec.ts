import { compileTheme, storefrontSampleData as data } from '../../../src/shopify'
import type { StoreData, ThemeInput } from '../../../src/shopify'
import { harness, harnessTheme, VISITOR } from './harness'

// The storefront links the theme's compiled `{% stylesheet %}` and `{% javascript %}` files from `content_for_header` and serves them itself, as Shopify does from `compiled_assets/` (https://shopify.dev/docs/storefronts/themes/best-practices/javascript-and-stylesheet-tags; the parity store's recordings of Horizon 4.3.0 and Dawn 16.0.0).

function styledTheme (): ThemeInput {
  const base = harnessTheme()
  return {
    files: {
      ...base.files,
      'templates/index.json': '{"sections":{"hero":{"type":"hero"}},"order":["hero"]}',
      'sections/hero.liquid': '<h1>Hero</h1>{% stylesheet %}.hero { color: red; }{% endstylesheet %}{% javascript %}hero(){% endjavascript %}'
    }
  }
}

describe('the compiled asset files', () => {
  it('links them from the page and serves them, with their type and a validator that follows the bodies', async () => {
    const theme = styledTheme()
    const { styles, scripts } = compileTheme(theme).compiledAssets()
    const { send } = harness({ theme })
    const page = await send('GET', '/')
    expect(page.text).toContain(`<link rel="stylesheet" media="screen" href="/compiled_assets/styles.css?v=${styles!.version}"><script id="sections-script" data-sections="hero" defer="defer" src="/compiled_assets/scripts.js?v=${scripts!.version}"></script>`)
    // Shopify answers `text/css` and `text/javascript`, cached for a year under the versioned address
    const css = await send('GET', `/compiled_assets/styles.css?v=${styles!.version}`)
    expect([css.status, css.headers.get('content-type'), css.headers.get('cache-control'), css.headers.get('etag')]).toEqual([200, 'text/css', 'public, max-age=31536000, immutable', `"${styles!.version}"`])
    expect(css.text).toBe(styles!.body)
    expect(css.headers.get('set-cookie')).toBeNull()
    const js = await send('GET', `/compiled_assets/scripts.js?v=${scripts!.version}`)
    expect([js.status, js.headers.get('content-type'), js.text]).toEqual([200, 'text/javascript', scripts!.body])
    // without the version, or with an old one, the answer is revalidated each time
    const stale = await send('GET', '/compiled_assets/styles.css?v=old')
    expect([stale.status, stale.headers.get('cache-control'), stale.text]).toEqual([200, 'no-cache', styles!.body])
    const unchanged = await send('GET', '/compiled_assets/styles.css', undefined, { 'if-none-match': `"${styles!.version}"` })
    expect([unchanged.status, unchanged.text, unchanged.headers.get('etag')]).toEqual([304, '', `"${styles!.version}"`])
    const head = await send('HEAD', '/compiled_assets/styles.css')
    expect([head.status, head.text]).toEqual([200, ''])
  })

  it('serves them under the base path, to a sandboxed page, and to a visitor who has not passed the password', async () => {
    const theme = styledTheme()
    const { styles } = compileTheme(theme).compiledAssets()
    const { send } = harness({ theme, data: { ...data, shop: { ...data.shop, password_enabled: true } } as StoreData }, { visitor: VISITOR, basePath: '/p/tok', sandbox: true })
    const css = await send('GET', '/p/tok/compiled_assets/styles.css')
    expect([css.status, css.headers.get('access-control-allow-origin'), css.text]).toEqual([200, '*', styles!.body])
    const unlocked = harness({ theme }, { visitor: VISITOR, basePath: '/p/tok' })
    expect((await unlocked.send('GET', '/p/tok/')).text).toContain(`href="/p/tok/compiled_assets/styles.css?v=${styles!.version}"`)
  })

  it('answers 404 for a file the theme does not have, and for another method', async () => {
    const { send } = harness()
    expect((await send('GET', '/compiled_assets/styles.css')).status).toBe(404)
    expect((await send('GET', '/compiled_assets/other.css')).status).toBe(404)
    const styled = harness({ theme: styledTheme() })
    expect((await styled.send('POST', '/compiled_assets/styles.css', 'a=b')).status).toBe(404)
  })
})
