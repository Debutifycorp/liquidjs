import { Context } from '../../src'
import { createShopifyLiquid, renderLiquid, shopifyState, STATE, Translator } from '../../src/shopify'
import type { ShopifyLiquidOptions, ShopifyState, ThemeHooks } from '../../src/shopify'
import { currentFrame, engineState } from '../../src/shopify/state'

const frame = (id: string) => ({ kind: 'section' as const, section: { id, type: 'header', index: 1 }, container: {}, sectionObject: {} })
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const readStream = (stream: NodeJS.ReadableStream) => new Promise<string>((resolve, reject) => {
  let out = ''
  stream.on('data', chunk => { out += chunk })
  stream.on('end', () => resolve(out))
  stream.on('error', reject)
})
const unknownTagNames = (state: ShopifyState) => state.report.toReport([], 0).unknownTags.map(entry => entry.name)
const unknownFilterNames = (state: ShopifyState) => state.report.toReport([], 0).unknownFilters.map(entry => entry.name)

/** An engine whose `probe` filter records the state of the render that calls it, `slowprobe` does so after a delay, and `leak` prints how many frames the state held and then pushes one. */
function probed (options: ShopifyLiquidOptions = {}) {
  const liquid = createShopifyLiquid({
    files: { 'snippets/inner.liquid': '{{ 1 | probe }}', 'templates/page.liquid': '{{ 1 | probe }}', 'templates/sync.liquid': '{{ 1 | probe }}', 'templates/stream.liquid': '{{ 1 | probe }}' },
    ...options
  })
  const seen: ShopifyState[] = []
  liquid.registerFilter('probe', function (value: unknown) {
    seen.push(shopifyState(this.context))
    return value
  })
  liquid.registerFilter('slowprobe', async function (value: unknown) {
    await delay(10)
    seen.push(shopifyState(this.context))
    return value
  })
  liquid.registerFilter('leak', function () {
    const state = shopifyState(this.context)
    const held = state.frames.length
    state.frames.push(frame('leaked'))
    return held
  })
  return { liquid, seen }
}

describe('the state of a render', () => {
  describe('direct renders on the preset engine', () => {
    it('gives two sequential renders their own report and frames', async () => {
      const { liquid, seen } = probed()
      expect(await liquid.parseAndRender('{% frobnicate %}{{ 1 | probe }}')).toBe('1')
      expect(await liquid.parseAndRender('{{ 1 | probe }}')).toBe('1')
      expect(seen[0]).not.toBe(seen[1])
      expect(unknownTagNames(seen[0])).toEqual(['frobnicate'])
      expect(unknownTagNames(seen[1])).toEqual([])
      expect(await liquid.parseAndRender('{{ 1 | leak }}')).toBe('0')
      expect(await liquid.parseAndRender('{{ 1 | leak }}')).toBe('0')
    })
    it('leaves the engine state alone', async () => {
      const { liquid, seen } = probed()
      const defaults = engineState(liquid.options.globals)!
      await liquid.parseAndRender('{% frobnicate %}{{ 1 | nope }}{{ 1 | leak }}{{ 1 | probe }}')
      expect(seen[0]).not.toBe(defaults)
      expect(unknownTagNames(defaults)).toEqual([])
      expect(unknownFilterNames(defaults)).toEqual([])
      expect(defaults.frames).toEqual([])
    })
    it('gives two concurrent renders their own state', async () => {
      const { liquid, seen } = probed()
      const [a, b] = await Promise.all([
        liquid.parseAndRender('{% frobnicate %}{{ 1 | slowprobe }}'),
        liquid.parseAndRender('{{ 1 | nope }}{{ 1 | slowprobe }}')
      ])
      expect([a, b]).toEqual(['1', '11'])
      expect(seen[0]).not.toBe(seen[1])
      expect(seen.map(unknownTagNames).sort()).toEqual([[], ['frobnicate']])
      expect(seen.map(unknownFilterNames).sort()).toEqual([[], ['nope']])
    })
    it('gives a snippet the state of the render that spawned it', async () => {
      const { liquid, seen } = probed()
      expect(await liquid.parseAndRender("{{ 1 | probe }}{% render 'inner' %}{% include 'inner' %}")).toBe('111')
      expect(seen).toHaveLength(3)
      expect(seen[1]).toBe(seen[0])
      expect(seen[2]).toBe(seen[0])
      expect(seen[0]).not.toBe(engineState(liquid.options.globals))
    })
    it('shows a snippet the frames its parent pushed', async () => {
      const { liquid } = probed({ files: { 'snippets/count.liquid': '{{ 1 | leak }}' } })
      expect(await liquid.parseAndRender("{{ 1 | leak }}{% render 'count' %}")).toBe('01')
    })
    it('covers every way to render', async () => {
      const { liquid, seen } = probed()
      const tpl = liquid.parse('{{ 1 | probe }}')
      const outputs = [
        await liquid.parseAndRender('{{ 1 | probe }}'),
        liquid.parseAndRenderSync('{{ 1 | probe }}'),
        await liquid.render(tpl),
        liquid.renderSync(tpl),
        await liquid.renderFile('templates/page'),
        liquid.renderFileSync('templates/sync'),
        await readStream(liquid.renderToNodeStream(tpl)),
        await readStream(await liquid.renderFileToNodeStream('templates/stream')),
        String(await liquid.evalValue('1 | probe')),
        String(liquid.evalValueSync('1 | probe'))
      ]
      expect(outputs).toEqual(Array(10).fill('1'))
      expect(seen).toHaveLength(10)
      expect(new Set(seen).size).toBe(10)
    })
  })

  describe('globals', () => {
    it('keeps the state when a render passes its own globals', async () => {
      const { liquid, seen } = probed()
      expect(await liquid.parseAndRender('{{ g }}{{ 1 | probe }}', {}, { globals: { g: 'G' } })).toBe('G1')
      expect(seen[0]).not.toBe(engineState(liquid.options.globals))
      expect(seen[0].money.format).toBe(engineState(liquid.options.globals)!.money.format)
    })
    it('keeps an explicit state in the globals', async () => {
      const { liquid, seen } = probed()
      const mine = engineState(probed({ moneyFormat: 'mine' }).liquid.options.globals)!
      expect(await liquid.parseAndRender('{{ 1 | probe }}', {}, { globals: { [STATE]: mine } })).toBe('1')
      expect(seen[0]).toBe(mine)
    })
    it('keeps the engine defaults when the engine option brings globals', async () => {
      const { liquid, seen } = probed({ moneyFormat: '{{amount}} EUR', engine: { globals: { shopName: 'Shop' } } })
      expect(await liquid.parseAndRender('{{ shopName }}{{ 1 | probe }}')).toBe('Shop1')
      expect(seen[0].money.format).toBe('{{amount}} EUR')
      expect((await renderLiquid(liquid, '{{ shopName }}')).html).toBe('Shop')
    })
    it('says what is missing when a Context has no Shopify state', async () => {
      const { liquid } = probed()
      const ctx = new Context({}, liquid.options, { globals: {} }, { liquid })
      const html = await liquid.render(liquid.parse('{% frobnicate %}'), ctx)
      expect(html).toMatch(/^Liquid error \(line 1\): this render has no Shopify state: /)
    })
  })

  describe('runtime', () => {
    const runtime: ThemeHooks = { renderStaticSection: function * () { return '' }, renderSectionGroup: function * () { return '' }, renderBlocks: function * () { return '' }, renderStaticBlock: function * () { return '' } }
    it('reaches every kind of render', async () => {
      const { liquid, seen } = probed({ runtime })
      await renderLiquid(liquid, '{{ 1 | probe }}')
      await liquid.parseAndRender('{{ 1 | probe }}')
      expect(seen.map(state => state.runtime)).toEqual([runtime, runtime])
    })
    it('is overridden by the one renderLiquid is given', async () => {
      const other: ThemeHooks = { renderStaticSection: function * () { return 'other' }, renderSectionGroup: function * () { return '' }, renderBlocks: function * () { return '' }, renderStaticBlock: function * () { return '' } }
      const { liquid, seen } = probed({ runtime })
      await renderLiquid(liquid, '{{ 1 | probe }}', {}, { runtime: other })
      expect(seen[0].runtime).toBe(other)
    })
  })

  describe('renderLiquid', () => {
    const engineOptions: ShopifyLiquidOptions = {
      moneyFormat: '{{amount}} EUR',
      moneyWithCurrencyFormat: '{{amount}} EUR!',
      services: { assetUrl: path => `/engine/${path}`, shopifyAssetUrl: path => `/engine-shopify/${path}` },
      translator: new Translator({ locale: 'fr', defaultLocale: 'fr', locales: {} })
    }

    function describing () {
      const { liquid } = probed({ ...engineOptions })
      liquid.registerFilter('describe', function () {
        const state = shopifyState(this.context)
        return JSON.stringify({
          money: state.money.format,
          withCurrency: state.money.withCurrencyFormat,
          asset: state.services.assetUrl('a.css'),
          shopifyAsset: state.services.shopifyAssetUrl('b.js'),
          locale: state.translator.locale,
          frame: currentFrame(state)?.section.id,
          path: state.request.path
        })
      })
      return liquid
    }

    it('starts from the engine defaults', async () => {
      const { html } = await renderLiquid(describing(), '{{ 1 | describe }}')
      expect(JSON.parse(html)).toEqual({ money: '{{amount}} EUR', withCurrency: '{{amount}} EUR!', asset: '/engine/a.css', shopifyAsset: '/engine-shopify/b.js', locale: 'fr', path: '/' })
    })
    it('puts the init argument over the engine defaults, field by field', async () => {
      const init = {
        moneyFormat: '{{amount}} GBP',
        translator: new Translator({ locale: 'de', defaultLocale: 'de', locales: {} }),
        services: { shopifyAssetUrl: (path: string) => `/init-shopify/${path}` },
        request: { path: '/products' },
        frames: [frame('init-frame')]
      }
      const { html } = await renderLiquid(describing(), '{{ 1 | describe }}', {}, init)
      expect(JSON.parse(html)).toEqual({ money: '{{amount}} GBP', withCurrency: '{{amount}} EUR!', asset: '/engine/a.css', shopifyAsset: '/init-shopify/b.js', locale: 'de', frame: 'init-frame', path: '/products' })
    })
  })
})
