import { createShopifyLiquid, renderLiquid, Translator } from '../../src/shopify'
import { attribute, escapeHtml, insertAttributes } from '../../src/shopify/util/html'
import { plainValue, splitArgs } from '../../src/shopify/util/args'
import { hasOwn } from '../../src/shopify/util/own'
import { currentFrame, createState, sectionLocales, shopifyState } from '../../src/shopify/state'
import { Liquid, LiquidError, LiquidFloat } from '../../src'
import { errorMessage, ReportCollector } from '../../src/shopify/report'
import { cdnStyleImageUrl, parseFontHandle } from '../../src/shopify/services'

describe('the Shopify layer foundations', () => {
  describe('preset', () => {
    it('prints the zone as UTC', async () => {
      const liquid = createShopifyLiquid()
      expect((await renderLiquid(liquid, "{{ '2024-01-02T03:04:05Z' | date: '%Z %H:%M' }}")).html).toBe('UTC 03:04')
    })
    it('keeps registered tags and filters ahead of the fallbacks', async () => {
      const liquid = createShopifyLiquid()
      const { html, report } = await renderLiquid(liquid, "{% if true %}{{ 'a' | upcase }}{% endif %}{% assign x = 1 %}{{ x }}")
      expect(html).toBe('A1')
      expect(report.unknownTags).toEqual([])
      expect(report.unknownFilters).toEqual([])
    })
    it('gives every render a fresh report', async () => {
      const liquid = createShopifyLiquid()
      const first = await renderLiquid(liquid, '{% frobnicate %}')
      const second = await renderLiquid(liquid, 'plain')
      expect(first.report.unknownTags).toEqual([{ name: 'frobnicate', count: 1, files: [] }])
      expect(second.report.unknownTags).toEqual([])
    })
    it('counts repeated unknown names and keeps the files they came from', async () => {
      const liquid = createShopifyLiquid({ files: { 'snippets/s.liquid': '{{ 1 | nope }}' } })
      const { report } = await renderLiquid(liquid, "{{ 1 | nope }}{% render 's' %}{% render 's' %}")
      expect(report.unknownFilters).toEqual([{ name: 'nope', count: 3, files: ['snippets/s.liquid'] }])
    })
    it('fails the parse on an unknown filter under strictFilters', async () => {
      const strict = createShopifyLiquid({ engine: { strictFilters: true } })
      await expect(renderLiquid(strict, "{{ 'x' | frobnicate }}")).rejects.toThrow('undefined filter: frobnicate')
      expect((await renderLiquid(strict, "{{ 'x' | upcase }}")).html).toBe('X')
      const lax = createShopifyLiquid()
      expect((await renderLiquid(lax, "{{ 'x' | frobnicate }}")).html).toBe('x')
    })
    it('lets the engine option override the preset', () => {
      const liquid = createShopifyLiquid({ engine: { numberSemantics: 'js' } })
      expect(liquid.options.numberSemantics).toBe('js')
    })
    it('is a Liquid', () => expect(createShopifyLiquid()).toBeInstanceOf(Liquid))
  })

  describe('errorMessage', () => {
    it('words a parse error as Shopify does', () => {
      let caught: unknown
      try { createShopifyLiquid({ unknownTags: 'error' }).parse('a\n{% frobnicate %}') } catch (err) { caught = err }
      expect((caught as Error).name).toBe('ParseError')
      expect(errorMessage(caught)).toBe("Liquid syntax error (line 2): Unknown tag 'frobnicate'")
    })
    it('words a tokenization error as Shopify does', () => {
      let caught: unknown
      try { createShopifyLiquid().parse('{% if %}') } catch (err) { caught = err }
      expect(LiquidError.is(caught)).toBe(true)
      expect(errorMessage(caught)).toMatch(/^Liquid syntax error \(line 1\): /)
    })
    it('words a plain error', () => expect(errorMessage(new Error('boom'))).toBe('Liquid error: boom'))
  })

  describe('html helpers', () => {
    it('escapes like CGI.escapeHTML', () => expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'))
    it('writes attributes', () => {
      expect(attribute('class', 'a "b"')).toBe(' class="a &quot;b&quot;"')
      expect(attribute('defer', true)).toBe(' defer="defer"')
      expect(attribute('x', false) + attribute('x', null) + attribute('x', undefined)).toBe('')
      expect(attribute('width', 0)).toBe(' width="0"')
    })
    it('inserts attributes after the first element name', () => {
      expect(insertAttributes('<svg viewBox="0 0 1 1"><path/></svg>', ' class="x"')).toBe('<svg class="x" viewBox="0 0 1 1"><path/></svg>')
      expect(insertAttributes('<svg/>', '')).toBe('<svg/>')
      expect(insertAttributes('<svg/>', ' class="a$&b"')).toBe('<svg class="a$&b"/>')
      expect(insertAttributes('<?xml version="1.0"?><svg viewBox="0 0 1 1"/>', ' class="x"')).toBe('<?xml version="1.0"?><svg class="x" viewBox="0 0 1 1"/>')
    })
  })

  describe('argument helpers', () => {
    it('splits positional and named arguments in order', () => {
      expect(splitArgs([1, ['width', 300], 'x', ['alt', 'y']])).toEqual({ positional: [1, 'x'], named: { width: 300, alt: 'y' }, order: ['width', 'alt'] })
    })
    it('turns Ruby decimals into numbers', () => expect(plainValue(new LiquidFloat(2))).toBe(2))
    it('checks own names', () => {
      const { named } = splitArgs([['width', 1]])
      expect(hasOwn(named, 'width')).toBe(true)
      expect(hasOwn(named, 'toString')).toBe(false)
    })
  })

  describe('services', () => {
    it('merges parameters into the image query with sorted keys', () => {
      expect(cdnStyleImageUrl({ src: '/a/b.jpg?v=1' }, { width: 400, height: 300, crop: 'bottom' })).toBe('/a/b.jpg?crop=bottom&height=300&v=1&width=400')
      expect(cdnStyleImageUrl({ src: '/a/b.jpg' }, {})).toBe('/a/b.jpg')
    })
    it('reads font handles', () => {
      expect(parseFontHandle('assistant_n4')).toMatchObject({ handle: 'assistant_n4', family: 'Assistant', style: 'normal', weight: 400, variants: ['assistant_n4', 'assistant_i4', 'assistant_n7', 'assistant_i7'] })
      expect(parseFontHandle('open_sans_i7')).toMatchObject({ family: 'Open Sans', style: 'italic', weight: 700 })
      expect(parseFontHandle('not a handle')).toBeUndefined()
    })
  })

  describe('Translator', () => {
    const translator = new Translator({
      locale: 'fr-CA',
      defaultLocale: 'en',
      locales: { en: { a: { b: 'english', only: 'default only' } }, fr: { a: { b: 'francais' } } },
      schemaLocales: { en: { sections: { header: { name: 'Header' } } } }
    })
    it('prefers the rendered locale, matching by language', () => expect(translator.lookup('a.b')).toBe('francais'))
    it('falls back to the default locale', () => expect(translator.lookup('a.only')).toBe('default only'))
    it('returns undefined for a missing key', () => expect(translator.lookup('a.nope')).toBeUndefined())
    it('reads section schema locales for sections keys', () => {
      const section = { type: 'header', locales: { en: { title: 'Welcome' } } }
      expect(translator.lookup('sections.header.title', section)).toBe('Welcome')
      expect(translator.lookup('sections.footer.title', section)).toBeUndefined()
    })
    it('resolves schema text', () => {
      expect(translator.schemaText('t:sections.header.name')).toBe('Header')
      expect(translator.schemaText('t:sections.missing.name')).toBe('t:sections.missing.name')
      expect(translator.schemaText('plain')).toBe('plain')
    })
  })

  describe('state', () => {
    it('exposes the innermost frame and its locales', () => {
      const locales = { en: { x: 'y' } }
      const state = createState({ frames: [{ kind: 'section', section: { id: 's', type: 'header', index: 1, locales }, container: {}, sectionObject: {} }] })
      expect(currentFrame(state)?.section.id).toBe('s')
      expect(sectionLocales(state)).toEqual({ type: 'header', locales })
      expect(sectionLocales(createState())).toBeUndefined()
    })
    it('reads the state of a context', async () => {
      const liquid = createShopifyLiquid()
      let seen = false
      liquid.registerFilter('probe', function (value: unknown) { seen = shopifyState(this.context).money.format === '${{amount}}'; return value }) // eslint-disable-line no-template-curly-in-string
      await renderLiquid(liquid, '{{ 1 | probe }}')
      expect(seen).toBe(true)
    })
  })

  describe('ReportCollector', () => {
    it('names a missing asset by its kind', () => {
      const missing = (path: string) => ({ originalError: new Error(`Could not find asset ${path}`), message: 'x' }) as unknown as LiquidError
      const report = new ReportCollector().toReport(['snippets/a.liquid', 'layout/b.liquid', 'sections/c.liquid', 'blocks/d.liquid', 'templates/e.liquid', 'config/f.json', '__proto__/g'].map(missing), 0)
      expect(report.missing).toEqual([
        { kind: 'snippet', name: 'snippets/a.liquid' },
        { kind: 'layout', name: 'layout/b.liquid' },
        { kind: 'section', name: 'sections/c.liquid' },
        { kind: 'block', name: 'blocks/d.liquid' },
        { kind: 'template', name: 'templates/e.liquid' },
        { kind: 'resource', name: 'config/f.json' },
        { kind: 'resource', name: '__proto__/g' }
      ])
    })
    it('deduplicates missing and unsupported entries', () => {
      const report = new ReportCollector()
      report.missing('section', 'a')
      report.missing('section', 'a')
      report.missing('block', 'a')
      report.unsupported('wrapper', 'd')
      report.unsupported('wrapper', 'd')
      report.stubbedFilter('s', 'file.liquid')
      report.section({ id: 'i', type: 't', location: 'l', status: 'rendered', ms: 1 })
      expect(report.toReport([], 5)).toEqual({
        unknownTags: [],
        unknownFilters: [],
        stubbedFilters: [{ name: 's', count: 1, files: ['file.liquid'] }],
        missing: [{ kind: 'section', name: 'a' }, { kind: 'block', name: 'a' }],
        unsupported: [{ feature: 'wrapper', detail: 'd' }],
        errors: [],
        sections: [{ id: 'i', type: 't', location: 'l', status: 'rendered', ms: 1 }],
        timing: { totalMs: 5 }
      })
    })
    it('keeps angle brackets out of names, files and details', async () => {
      const { report } = await renderLiquid(createShopifyLiquid(), '{{ c | color_darken: 10 }}', { c: '"><svg/onload=alert(2)>' })
      expect(report.unsupported).toEqual([{ feature: 'color_darken', detail: 'not a colour: "svg/onload=alert(2)' }])
      const collector = new ReportCollector()
      collector.missing('resource', 'product <img src=x>')
      collector.unknownFilter('<b>', '<f>.liquid')
      expect(collector.toReport([], 0)).toMatchObject({ missing: [{ kind: 'resource', name: 'product img src=x' }], unknownFilters: [{ name: 'b', count: 1, files: ['f.liquid'] }] })
    })
  })
})
