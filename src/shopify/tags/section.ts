import { Tag } from '../../template/tag'
import type { Liquid } from '../../liquid'
import type { Context } from '../../context'
import type { TagToken, TopLevelToken, ValueToken } from '../../tokens'
import { evalToken } from '../../render'
import { stringify } from '../../util'
import { shopifyState, ThemeHooks } from '../state'

/** A tag that hands one name to a theme runtime hook and prints what the hook returns. `section` and `sections` differ only in the hook and in what they name. Outside `renderPage` there is no runtime, so the tag renders nothing and the report says so. */
abstract class ThemeHookTag extends Tag {
  private readonly value: ValueToken

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, private readonly hook: 'renderStaticSection' | 'renderSectionGroup', subject: string) {
    super(token, remainTokens, liquid)
    const value = this.tokenizer.readValue()
    if (!value) throw new Error(`${this.name} needs a ${subject} name`)
    this.value = value
  }

  public * render (ctx: Context): Generator<unknown, string, unknown> {
    const state = shopifyState(ctx)
    const name = stringify(yield evalToken(this.value, ctx))
    const runtime: ThemeHooks | undefined = state.runtime
    if (!runtime) {
      state.report.unsupported(this.hook === 'renderStaticSection' ? 'section' : 'sections', `{% ${this.name} '${name}' %} outside renderPage`)
      return ''
    }
    return (yield runtime[this.hook](name, ctx)) as string
  }
}

/** `{% section 'header' %}`: renders a static section through the theme runtime. https://shopify.dev/docs/api/liquid/tags/section */
export class SectionTag extends ThemeHookTag {
  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid, 'renderStaticSection', 'section')
  }
}

/** `{% sections 'header-group' %}`: renders a section group through the theme runtime. https://shopify.dev/docs/api/liquid/tags/sections */
export class SectionsTag extends ThemeHookTag {
  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid, 'renderSectionGroup', 'section group')
  }
}
