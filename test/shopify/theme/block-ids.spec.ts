import { renderPage } from '../../../src/shopify'

const ID = /A[0-9A-Za-z]{17}__[A-Za-z0-9_-]+/g
const ids = (html: string) => html.match(ID) ?? []
const prefix = (id: string) => id.slice(0, id.indexOf('__'))

const files = (sections: Record<string, object>, extra: Record<string, string> = {}) => ({
  'templates/index.json': JSON.stringify({ layout: false, sections, order: Object.keys(sections) }),
  'sections/s.liquid': "{% content_for 'blocks' %}",
  'blocks/text.liquid': '[{{ block.id }}]{% content_for \'blocks\' %}{% schema %}{ "name": "Text", "blocks": [{ "type": "@theme" }] }{% endschema %}',
  ...extra
})
const render = async (sections: Record<string, object>, extra?: Record<string, string>) => (await renderPage({ theme: { files: files(sections, extra) }, templateName: 'index' })).html

/**
 * The parity store prints the ids of Horizon's theme blocks with a prefix of `A`, 17 letters and digits and `__` before the key (`shopify-block-AYkNMb3hzdThtMXNBZ__header-menu`): one prefix per block of a section, the same on every page, shared by the repeats of a static block and the blocks inside them (recordings `page-home`, `page-product` and `page-blog` of the Horizon theme), while Dawn's section blocks keep their key (`page-article` of Dawn). shopify.dev documents neither the prefix nor how it is made, so the hash is Debutify's and the specs pin its shape and where it is shared, not its letters.
 */
describe('shopify/theme theme block ids', () => {
  it('gives each theme block an id of a prefix and its key, in block.id and in its wrapper', async () => {
    const html = await render({ main: { type: 's', blocks: { text_1: { type: 'text' } }, block_order: ['text_1'] } })
    const [id] = ids(html)
    expect(id).toMatch(/^A[0-9A-Za-z]{17}__text_1$/)
    expect(html).toBe(`<div id="shopify-section-template--index__main" class="shopify-section"><div id="shopify-block-${id}" class="shopify-block">[${id}]</div></div>`)
  })
  it('gives the same key a different prefix in another section and another block, and the same one on every render', async () => {
    const sections = {
      one: { type: 's', blocks: { text_1: { type: 'text' }, text_2: { type: 'text' } }, block_order: ['text_1', 'text_2'] },
      two: { type: 's', blocks: { text_1: { type: 'text' } }, block_order: ['text_1'] }
    }
    const first = await render(sections)
    const [one1, one2, two1] = [...new Set(ids(first))]
    expect([one1, one2, two1].map(id => id.slice(id.indexOf('__')))).toEqual(['__text_1', '__text_2', '__text_1'])
    expect(new Set([one1, one2, two1].map(prefix)).size).toBe(3)
    expect(await render(sections)).toBe(first)
  })
  it('shares the prefix between the repeats of a static block and between the blocks inside them, the number after the key', async () => {
    const html = await render({ main: { type: 'loop', blocks: { card: { type: 'text', static: true, blocks: { t: { type: 'text' } }, block_order: ['t'] } } } }, {
      'sections/loop.liquid': "{% for i in (1..2) %}{% content_for 'block', type: 'text', id: 'card' %}{% endfor %}"
    })
    const found = [...new Set(ids(html))]
    expect(found.map(id => id.slice(id.indexOf('__')))).toEqual(['__card', '__t', '__card-1', '__t-1'])
    expect(prefix(found[0])).toBe(prefix(found[2]))
    expect(prefix(found[1])).toBe(prefix(found[3]))
    expect(prefix(found[0])).not.toBe(prefix(found[1]))
  })
  it('gives an entry of section.blocks the id its block renders with, and leaves the blocks a section defines with their key', async () => {
    const html = await render({
      main: { type: 'list', blocks: { text_1: { type: 'text' }, slide_1: { type: 'slide' } }, block_order: ['text_1', 'slide_1'] }
    }, {
      'sections/list.liquid': '{% for b in section.blocks %}<{{ b.id }}>{% endfor %}{% content_for \'blocks\' %}{% schema %}{ "name": "List", "blocks": [{ "type": "@theme" }, { "type": "slide", "name": "Slide" }] }{% endschema %}'
    })
    const [id] = ids(html)
    expect(html).toContain(`<${id}><slide_1><div id="shopify-block-${id}" class="shopify-block">[${id}]</div>`)
  })
})
