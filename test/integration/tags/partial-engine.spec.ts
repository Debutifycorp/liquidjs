import { Context, Liquid, IncludeTag, RenderTag } from '../../../src'
import { mock, restore } from '../../stub/mockfs'

/** The hook a subclass of `render` and `include` may override to look the snippet up with another engine. */
describe('tags/partialEngine', function () {
  afterEach(restore)
  let other: Liquid

  class RenderThroughOther extends RenderTag {
    protected partialEngine (ctx: Context) {
      return other
    }
  }
  class IncludeThroughOther extends IncludeTag {
    protected partialEngine (ctx: Context) {
      return other
    }
  }

  beforeEach(function () {
    other = new Liquid({ root: '/other', extname: '.html' })
    mock({
      '/main/snippet.html': 'main snippet',
      '/other/snippet.html': 'other snippet'
    })
  })

  it('looks a snippet up with the engine that parsed the tag by default', async function () {
    const main = new Liquid({ root: '/main', extname: '.html' })
    expect(await main.parseAndRender('{% render "snippet" %}|{% include "snippet" %}')).toBe('main snippet|main snippet')
  })
  it('looks a render snippet up with the engine the hook answers', async function () {
    const main = new Liquid({ root: '/main', extname: '.html' })
    main.registerTag('render', RenderThroughOther)
    expect(await main.parseAndRender('{% render "snippet" %}')).toBe('other snippet')
    expect(main.renderSync(main.parse('{% render "snippet" %}'))).toBe('other snippet')
  })
  it('looks an include snippet up with the engine the hook answers', async function () {
    const main = new Liquid({ root: '/main', extname: '.html' })
    main.registerTag('include', IncludeThroughOther)
    expect(await main.parseAndRender('{% include "snippet" %}')).toBe('other snippet')
  })
})
