import { Tag } from '../../template/tag'
import type { Template } from '../../template'
import type { Liquid } from '../../liquid'
import type { Parser } from '../../parser'
import type { Context } from '../../context'
import type { Emitter } from '../../emitters'
import type { TagToken, TopLevelToken } from '../../tokens'
import { isTagToken } from '../../util'

/** `{% style %}`: a `<style data-shopify>` element whose body is rendered as Liquid. https://shopify.dev/docs/api/liquid/tags/style */
export class StyleTag extends Tag {
  private readonly templates: Template[] = []

  public constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser: Parser) {
    super(token, remainTokens, liquid)
    while (remainTokens.length) {
      const next = remainTokens.shift()!
      if (isTagToken(next) && next.name === 'endstyle') return
      this.templates.push(parser.parseToken(next, remainTokens))
    }
    throw new Error(`tag ${token.getText()} not closed`)
  }

  public * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    emitter.write('<style data-shopify>')
    yield this.liquid.renderer.renderTemplates(this.templates, ctx, emitter)
    emitter.write('</style>')
  }

  public * children (): Generator<unknown, Template[]> {
    return this.templates
  }
}
