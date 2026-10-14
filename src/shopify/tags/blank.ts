import type { Liquid } from '../../liquid'
import type { Context } from '../../context'
import type { Tag, TagClass, TagRenderReturn } from '../../template/tag'
import { Emitter, SimpleEmitter } from '../../emitters'
import { isBlank } from '../../util/inline-error'

/** The block tags whose blank bodies lose their text in Ruby Liquid: `parse` in Shopify/liquid lib/liquid/tags/if.rb (which `unless` extends), for.rb and case.rb calls `remove_blank_strings` when every branch is blank. `tablerow` does not. */
export const BLANK_TEXT_TAGS: readonly string[] = Object.freeze(['if', 'unless', 'case', 'for'])

/** `Base`, printing nothing when every branch is blank: such a body holds only whitespace and tags that print nothing, so dropping its output is dropping its text, while its `assign` and `capture` still run. Shopify does not document blankness. */
function dropsBlankText (Base: BlockTagClass): TagClass {
  const render = Base.prototype.render
  return class extends Base {
    private readonly blankBody = isBlank(this)

    public * render (ctx: Context, emitter: Emitter): Generator<unknown, unknown, unknown> {
      if (!this.blankBody) return yield render.call(this, ctx, emitter)
      yield render.call(this, ctx, new SimpleEmitter())
    }
  }
}

type BlockTagClass = TagClass & { prototype: { render (this: Tag, ctx: Context, emitter: Emitter): TagRenderReturn } }

export function registerBlankText (liquid: Liquid) {
  for (const name of BLANK_TEXT_TAGS) liquid.registerTag(name, dropsBlankText(liquid.tags[name] as BlockTagClass))
}
