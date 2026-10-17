/** @jest-environment ./test/support/jsdom-environment.cjs */
import type { JSDOM as JSDOMType, VirtualConsole as VirtualConsoleType } from 'jsdom'
import { renderPage } from './bare-block-ids'
import type { RenderPageOptions } from '../../../src/shopify'

const JSDOM = (globalThis as any).JSDOM as typeof JSDOMType
const VirtualConsole = (globalThis as any).VirtualConsole as typeof VirtualConsoleType

/**
 * A theme shaped like shipped themes (select values in `class`, range values in `style`, URLs in `href`, colour-scheme ids in selectors and class names, `| json` in `<script type="application/json">`) rendered over settings written to break out of them. Without html trust no node of the parsed page may be able to run script, and every value that was held back is in the report.
 */
const HOSTILE_ID = 'x"><img src=x onerror=alert(101)>'
const STYLE_ID = 'y}</style><script>alert(106)</script>'

const files: Record<string, string> = {
  'layout/theme.liquid': '<!doctype html><html><head><style>{% for scheme in settings.color_schemes %}.color-{{ scheme.id }}{--bg:{{ scheme.settings.background }};--text:{{ scheme.settings.text }};--bg-rgb:{{ scheme.settings.background.red }}}{% endfor %}</style></head><body class="color-{{ settings.body_scheme }}" data-scheme="{{ settings.body_scheme.id }}" data-accent="{{ settings.accent }}">{{ content_for_layout }}<script type="application/json" id="g">{{ settings | json }}</script></body></html>',
  'config/settings_schema.json': JSON.stringify([{
    name: 'Colors',
    settings: [
      { type: 'color_scheme_group', id: 'color_schemes', definition: [{ type: 'color', id: 'background', default: '#ffffff' }, { type: 'color', id: 'text', default: '#000000' }], role: { background: 'background', text: 'text' } },
      { type: 'color_scheme', id: 'body_scheme', default: 'scheme-1' },
      { type: 'color', id: 'accent' }
    ]
  }]),
  'config/settings_data.json': JSON.stringify({
    current: {
      color_schemes: {
        'scheme-1': { settings: { background: '#fff', text: '#000' } },
        [HOSTILE_ID]: { settings: { background: 'red;}</style><img src=x onerror=alert(102)>', text: 'red" onmouseover="alert(103)' } },
        [STYLE_ID]: { settings: {} },
        'scheme-2': { settings: { background: 'red;}</style><img src=x onerror=alert(102)>', text: 'red" onmouseover="alert(103)', '</script><img src=x onerror=alert(107)>': 'k' } }
      },
      body_scheme: HOSTILE_ID,
      accent: 'red" autofocus onfocus="alert(104)" tabindex="0',
      '</script><img src=x onerror=alert(105)>': 'k'
    }
  }),
  'templates/index.json': JSON.stringify({
    sections: {
      main: {
        type: 'banner',
        settings: {
          layout: 'x" autofocus onfocus="alert(1)" tabindex="0',
          pad: '1" onmouseover="alert(2)',
          link: 'shopify://products/<img src=x onerror=alert(3)>',
          link2: 'https://x.example/"><script>alert(4)</script>',
          link3: '/a" autofocus onfocus="alert(5)" x="',
          link4: 'https://x.example/" autofocus onfocus="alert(6)" x="',
          video: 'https://www.youtube.com/watch?v=abcdefg"><img src=x onerror=alert(7)>',
          flag: '" autofocus onfocus="alert(8)" x="',
          heading: 'Hi" onmouseover="alert(9)',
          '</script><img src=x onerror=alert(10)>': 'v',
          image: { src: 'https://cdn.example/a.png" onerror="alert(11)', width: 10, height: 10, alt: 'a" onerror="alert(12)' },
          image2: { src: 'https://cdn.example/b.png', width: '10" onload="alert(13)', height: 5, alt: 'b" onerror="alert(14)' }
        }
      }
    },
    order: ['main']
  }),
  'sections/banner.liquid': '<div class="banner banner--{{ section.settings.layout }}" style="--pad: {{ section.settings.pad }}px"><h2 title="{{ section.settings.heading | escape }}">{{ section.settings.heading }}</h2><a href="{{ section.settings.link }}">One</a><a href="{{ section.settings.link2 }}">Two</a><a href="{{ section.settings.link3 }}">Three</a><a href="{{ section.settings.link4 }}">Four</a><a href="{{ section.settings.video }}">V {{ section.settings.video.id }}</a><input type="checkbox" {% if section.settings.flag %}data-flag="{{ section.settings.flag }}"{% endif %}><img src="{{ section.settings.image | image_url: width: 100 }}">{{ section.settings.image | image_url: width: 100 | image_tag }}<img src="{{ section.settings.image.src }}" alt="{{ section.settings.image.alt | escape }}"><img src="{{ section.settings.image2.src }}" width="{{ section.settings.image2.width }}" height="{{ section.settings.image2.height }}" alt="{{ section.settings.image2.alt }}"></div><script type="application/json" id="s">{{ section.settings | json }}</script>{% schema %}' + JSON.stringify({
    name: 'Banner',
    settings: [
      { type: 'select', id: 'layout', options: [{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }], default: 'left' },
      { type: 'range', id: 'pad', min: 0, max: 100, step: 4, default: 36 },
      { type: 'url', id: 'link' },
      { type: 'url', id: 'link2' },
      { type: 'url', id: 'link3' },
      { type: 'url', id: 'link4' },
      { type: 'video_url', id: 'video', accept: ['youtube', 'vimeo'] },
      { type: 'checkbox', id: 'flag', default: false },
      { type: 'text', id: 'heading' },
      { type: 'image_picker', id: 'image' },
      { type: 'image_picker', id: 'image2' }
    ]
  }) + '{% endschema %}'
}

/** The page parsed as a browser does, with no script run and no complaint about the theme's CSS. */
const dom = (html: string) => new JSDOM(html, { virtualConsole: new VirtualConsole() }).window

/** Everything in the parsed page that can run script or load a document: event-handler and `autofocus` attributes, `javascript:` URLs, scripts that are not JSON data, frames and objects, and JSON data blocks that do not parse (a block cut short by `</script>`). */
function scriptCapable (html: string): string[] {
  const found: string[] = []
  const { document } = dom(html)
  for (const element of Array.from(document.querySelectorAll('*'))) {
    const tag = element.tagName.toLowerCase()
    for (const { name, value } of Array.from(element.attributes)) {
      if (/^on/i.test(name) || name === 'autofocus' || /^\s*javascript:/i.test(value)) found.push(`<${tag} ${name}="${value}">`)
    }
    if (['iframe', 'object', 'embed', 'frame', 'base', 'meta'].includes(tag)) found.push(`<${tag}>`)
    if (tag === 'script') {
      const type = element.getAttribute('type')
      if (type !== 'application/json') found.push(`<script type=${type}>`)
      else {
        try {
          JSON.parse(element.textContent ?? '')
        } catch {
          found.push(`json script #${element.id} cut short`)
        }
      }
    }
  }
  return found
}

const render = (options: Partial<RenderPageOptions> = {}, theme = files) => renderPage({ theme: { files: theme }, templateName: 'index', ...options })

describe('shopify/theme settings safety through renderPage', () => {
  it('leaves nothing in the page that can run script when html is not trusted', async () => {
    const { html, report } = await render()
    expect(scriptCapable(html)).toEqual([])
    // the theme's own images are the only ones: image (dropped, so an empty src), image_tag (nothing), image.src (empty), image2 (valid)
    expect(dom(html).document.querySelectorAll('img')).toHaveLength(3)
    expect(report.errors).toEqual([])
  })
  it('reports every value it held back, without the value', async () => {
    const { report } = await render()
    expect(report.unsupported).toEqual(expect.arrayContaining([
      { feature: 'invalid_setting', detail: 'select setting layout has a value that is not one of its options and was replaced by its default' },
      { feature: 'invalid_setting', detail: 'range setting pad has a value that is not a number and was replaced by its default' },
      { feature: 'invalid_setting', detail: 'checkbox setting flag has a value that is not a boolean and was replaced by its default' },
      { feature: 'invalid_setting', detail: 'color setting accent has a value that is not a colour and was replaced by its default' },
      { feature: 'unsafe_url', detail: 'url setting link has a URL with a quote, angle bracket, backtick, space, control character or character reference and was dropped' },
      { feature: 'unsafe_url', detail: 'video_url setting video has a URL with a quote, angle bracket, backtick, space, control character or character reference and was dropped' },
      { feature: 'unsafe_url', detail: 'image_picker setting image has an image whose src is not a safe URL and was dropped' },
      { feature: 'invalid_setting', detail: 'image_picker setting image2 has an image alt with a quote, angle bracket, backtick or control character and the alt was dropped' },
      { feature: 'unsafe_key', detail: 'a stored settings key with a quote, angle bracket, backtick or control character was dropped' },
      { feature: 'color_scheme', detail: 'color_scheme_group setting color_schemes has a color scheme whose id has characters other than letters, digits, - and _ and was dropped' }
    ]))
    expect(report.unsupported.filter(entry => entry.feature === 'unsafe_url').map(entry => entry.detail.split(' ').slice(0, 3).join(' '))).toEqual(['url setting link', 'url setting link2', 'url setting link3', 'url setting link4', 'video_url setting video', 'image_picker setting image'])
    expect(JSON.stringify(report)).not.toContain('onerror')
    expect(JSON.stringify(report)).not.toContain('onfocus')
  })
  it('keeps the page working: defaults take the place of held-back values and clean values pass', async () => {
    const { html } = await render()
    const { document } = dom(html)
    expect(document.querySelector('.banner')?.className).toBe('banner banner--left')
    expect(document.querySelector('.banner')?.getAttribute('style')).toBe('--pad: 36px')
    expect(document.querySelector('h2')?.textContent).toBe('Hi" onmouseover="alert(9)')
    expect(document.body.className).toBe('color-scheme-1')
    expect(document.body.getAttribute('data-scheme')).toBe('scheme-1')
    expect(document.body.getAttribute('data-accent')).toBe('')
    expect(Array.from(document.querySelectorAll('.banner a')).map(a => a.getAttribute('href'))).toEqual(['', '', '', '', ''])
    expect(document.querySelectorAll('style')[0].textContent).toBe('.color-scheme-1{--bg:#fff;--text:#000;--bg-rgb:255}.color-scheme-2{--bg:#ffffff;--text:#000000;--bg-rgb:255}')
    const sectionJson = JSON.parse(document.getElementById('s')?.textContent ?? '')
    expect(Object.keys(sectionJson)).not.toContain('</script><img src=x onerror=alert(10)>')
    expect(sectionJson.heading).toBe('Hi" onmouseover="alert(9)')
    expect(sectionJson.layout).toBe('left')
    expect(sectionJson.pad).toBe(36)
  })
  it('passes the same page with clean values', async () => {
    const template = JSON.parse(files['templates/index.json'])
    template.sections.main.settings = {
      layout: 'right',
      pad: 40,
      link: 'shopify://collections/apparel',
      link2: 'https://x.example/a?b=c&d=e',
      link3: '/pages/about#team',
      link4: 'mailto:hello@x.example',
      video: 'https://www.youtube.com/watch?v=abcdefg',
      flag: true,
      heading: 'Fish & chips',
      image: { src: 'https://cdn.example/a.png', width: 10, height: 10, alt: 'A' },
      image2: { src: '/b.png', width: 8, height: 5, alt: 'B' }
    }
    const clean = { ...files, 'templates/index.json': JSON.stringify(template), 'config/settings_data.json': JSON.stringify({ current: { color_schemes: { 'scheme-1': { settings: { background: '#fff' } } }, body_scheme: 'scheme-1', accent: '#336699' } }) }
    const { html, report } = await render({}, clean)
    const { document } = dom(html)
    expect(report.unsupported).toEqual([])
    expect(document.querySelector('.banner')?.className).toBe('banner banner--right')
    expect(document.querySelector('.banner')?.getAttribute('style')).toBe('--pad: 40px')
    expect(Array.from(document.querySelectorAll('.banner a')).map(a => a.getAttribute('href'))).toEqual(['/collections/apparel', 'https://x.example/a?b=c&d=e', '/pages/about#team', 'mailto:hello@x.example', 'https://www.youtube.com/watch?v=abcdefg'])
    expect(document.querySelector('input')?.getAttribute('data-flag')).toBe('true')
    // `image_url` keeps the width asked for, also past the image's own (recording `page-collections`), and `image_tag` uses that address as its `src`
    expect(Array.from(document.querySelectorAll('img')).map(img => img.getAttribute('src'))).toEqual(['//cdn.example/a.png?width=100', '//cdn.example/a.png?width=100', '//cdn.example/a.png', '/b.png'])
    expect(document.body.getAttribute('data-accent')).toBe('#336699')
  })
  it('is a real check: the same page with html trusted does hold script-capable nodes', async () => {
    const { html } = await render({ trustHtmlSettings: true, trustLiquidSettings: true })
    expect(scriptCapable(html).length).toBeGreaterThan(5)
  })
  it('keeps stored keys intact but harmless in json when html is trusted', async () => {
    const { html } = await render({ trustHtmlSettings: true })
    const { document } = dom(html)
    const globals = JSON.parse(document.getElementById('g')?.textContent ?? '')
    expect(globals['</script><img src=x onerror=alert(105)>']).toBe('k')
    expect(JSON.parse(document.getElementById('s')?.textContent ?? '')['</script><img src=x onerror=alert(10)>']).toBe('v')
    expect(html).not.toContain('</script><img src=x onerror=alert(105)>')
    expect(html).toContain('\\u003c\\/script\\u003e\\u003cimg src=x onerror=alert(105)\\u003e')
  })
})

describe('shopify/theme keys and image alt through renderPage', () => {
  const ATTACKS = {
    section: 'x"><img src=x onerror=alert(20)>',
    block: 'b"><img src=x onerror=alert(21)>',
    blockType: 't"><img src=x onerror=alert(23)>',
    groupType: 'g"><img src=x onerror=alert(24)>',
    groupSection: 'k"><img src=x onerror=alert(25)>',
    styleSection: 'y}</style><script>alert(26)</script>',
    alt: 'a" onerror="alert(12)'
  }
  const theme: Record<string, string> = {
    'layout/theme.liquid': '<!doctype html><html><body>{{ content_for_layout }}{% sections "footer-group" %}{% sections "custom-group" %}</body></html>',
    'templates/index.json': JSON.stringify({
      wrapper: 'div#page[onmouseover=alert(22)]',
      sections: {
        main: { type: 'dawn', settings: { picture: { src: 'https://cdn.example/a.png', width: 10, height: 10, alt: ATTACKS.alt } }, blocks: { heading_aBc123: { type: 'text', settings: { t: 'Hello' } }, [ATTACKS.block]: { type: 'text', settings: { t: 'skipped block' } }, second: { type: ATTACKS.blockType, settings: { t: 'skipped type' } } }, block_order: ['heading_aBc123', ATTACKS.block, 'second'] },
        [ATTACKS.section]: { type: 'dawn', blocks: { inner: { type: 'text', settings: { t: 'skipped section' } } }, block_order: ['inner'] },
        [ATTACKS.styleSection]: { type: 'dawn' },
        '16625_abc-DEF': { type: 'dawn' }
      },
      order: ['main', ATTACKS.section, ATTACKS.styleSection, '16625_abc-DEF']
    }),
    'sections/footer-group.json': JSON.stringify({ type: ATTACKS.groupType, sections: { footer: { type: 'dawn' }, [ATTACKS.groupSection]: { type: 'dawn' } }, order: ['footer', ATTACKS.groupSection] }),
    'sections/custom-group.json': JSON.stringify({ type: 'custom.banner-1', sections: { a: { type: 'dawn' } }, order: ['a'] }),
    'sections/dawn.liquid': '<style>.section-{{ section.id }}-padding{padding:0}</style><div id="Banner-{{ section.id }}" data-location="{{ section.location }}"><img src="{{ section.settings.picture.src }}" alt="{{ section.settings.picture.alt }}">{% for block in section.blocks %}<i id="Block-{{ block.id }}" class="b-{{ block.type }}"></i>{% endfor %}{% content_for "blocks" %}</div>{% schema %}' + JSON.stringify({ name: 'Dawn', settings: [{ type: 'image_picker', id: 'picture' }], blocks: [{ type: 'text', name: 'Text' }] }) + '{% endschema %}',
    'blocks/text.liquid': '<p id="Text-{{ block.id }}">{{ block.settings.t }}</p>{% schema %}' + JSON.stringify({ name: 'Text', settings: [{ type: 'text', id: 't' }] }) + '{% endschema %}'
  }

  it('leaves nothing in the page that can run script when html is not trusted', async () => {
    const { html } = await render({}, theme)
    expect(scriptCapable(html)).toEqual([])
  })
  it('keeps the sections and blocks whose keys are plain and skips the others', async () => {
    const { html, report } = await render({}, theme)
    const { document } = dom(html)
    expect(Array.from(document.querySelectorAll('.shopify-section')).map(element => element.id)).toEqual(['shopify-section-template--index__main', 'shopify-section-template--index__16625_abc-DEF', 'shopify-section-sections--footer-group__footer', 'shopify-section-sections--custom-group__a'])
    expect(Array.from(document.querySelectorAll('[id^="Block-"], [id^="Text-"]')).map(element => element.id)).toEqual(['Block-heading_aBc123', 'Text-heading_aBc123'])
    expect(Array.from(document.querySelectorAll('[data-location]')).map(element => element.getAttribute('data-location'))).toEqual(['template', 'template', 'footer-group', 'custom.banner-1'])
    expect(document.getElementById('page')).toBeNull()
    expect(report.sections.map(entry => entry.id)).toEqual(['template--index__main', 'template--index__16625_abc-DEF', 'sections--footer-group__footer', 'sections--custom-group__a'])
  })
  it('reports each thing it skipped, without the key', async () => {
    const { report } = await render({}, theme)
    expect(report.unsupported).toEqual(expect.arrayContaining([
      { feature: 'unsafe_key', detail: 'a section key with characters other than letters, digits, - and _ was skipped' },
      { feature: 'unsafe_key', detail: 'a block key with characters other than letters, digits, - and _ was skipped' },
      { feature: 'unsafe_key', detail: 'a block type with characters other than letters, digits, - and _ was skipped' },
      { feature: 'unsafe_key', detail: 'sections/footer-group.json has a type with characters other than letters, digits, ., - and _ and was replaced by the group name' },
      { feature: 'wrapper', detail: 'the template wrapper is not a div, main or section with #id, .class and [name=value] parts, or has an event-handler or style attribute the theme is not trusted with, and was not applied' },
      { feature: 'invalid_setting', detail: 'image_picker setting picture has an image alt with a quote, angle bracket, backtick or control character and the alt was dropped' }
    ]))
    expect(JSON.stringify(report)).not.toContain('onerror')
    expect(JSON.stringify(report)).not.toContain('alert')
  })
  it('names a missing section or block type in the report only when it is plain', async () => {
    const hostile = 'x"><img src=x onerror=alert(30)>'
    const files = { ...theme, 'templates/index.json': JSON.stringify({ sections: { a: { type: hostile }, b: { type: 'gone-section' }, c: { type: 'dawn', blocks: { d: { type: 'text' }, e: { type: hostile }, f: { type: 'gone-block' } }, block_order: ['d', 'e', 'f'] } }, order: ['a', 'b', 'c'] }) }
    const { report } = await render({}, files)
    expect(report.missing).toEqual([{ kind: 'section', name: '(unsafe name)' }, { kind: 'section', name: 'gone-section' }, { kind: 'block', name: 'gone-block' }])
    expect(report.sections.filter(entry => entry.status === 'missing').map(entry => entry.type)).toEqual(['(unsafe name)', 'gone-section'])
    expect(JSON.stringify(report)).not.toContain('onerror')
    // a theme trusted with html keeps the block, whose file does not exist, and the report still leaves the type out
    const trusted = await render({ trustHtmlSettings: true }, files)
    expect(trusted.report.missing).toContainEqual({ kind: 'block', name: '(unsafe name)' })
    expect(JSON.stringify(trusted.report.missing)).not.toContain('onerror')
  })
  it('keeps the image when only its alt is dropped', async () => {
    const { html } = await render({}, theme)
    const image = dom(html).document.querySelector('#Banner-template--index__main img')
    expect([image?.getAttribute('src'), image?.getAttribute('alt')]).toEqual(['//cdn.example/a.png', ''])
  })
  it('is a real check: the same page with html trusted does hold script-capable nodes', async () => {
    const { html } = await render({ trustHtmlSettings: true }, theme)
    expect(scriptCapable(html).length).toBeGreaterThan(5)
    const { document } = dom(html)
    expect(document.getElementById('page')?.hasAttribute('onmouseover')).toBe(true)
  })
})

describe('shopify/theme liquid setting depth', () => {
  const theme: Record<string, string> = {
    'layout/theme.liquid': '<body>{{ content_for_layout }}</body>',
    'config/settings_schema.json': JSON.stringify([{ name: 'x', settings: [{ type: 'liquid', id: 'self' }] }]),
    'config/settings_data.json': JSON.stringify({ current: { self: 'x{% render "loop" %}' } }),
    'snippets/loop.liquid': '{{ settings.self }}',
    'templates/index.json': JSON.stringify({ sections: { main: { type: 'echo' } }, order: ['main'] }),
    'sections/echo.liquid': '[{{ settings.self }}]'
  }

  it('stops a liquid setting that renders itself through a snippet, and the page still renders', async () => {
    const started = Date.now()
    const { html, report } = await render({ trustLiquidSettings: true }, theme)
    expect(Date.now() - started).toBeLessThan(2000)
    expect(html).toContain('[xxxxx]')
    expect(report.errors.map(error => error.message)).toEqual(['Liquid error (line 1): liquid setting is nested more than 5 levels deep'])
  })
  it('prints it as escaped text when the theme is not trusted', async () => {
    const { html, report } = await render({}, theme)
    expect(html).toContain('[x{% render &quot;loop&quot; %}]')
    expect(report.errors).toEqual([])
  })
})
