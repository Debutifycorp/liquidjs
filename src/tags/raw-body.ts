import { Liquid, TagToken, TopLevelToken, Tag } from '..'
import { isTagToken } from '../util'

/**
 * A tag whose body is everything up to `end<name>`, as text. List the tag's name in the `rawTags` option so the tokenizer never parses the body. `render` returns the body; subclasses override it (Shopify's `schema` renders nothing, `javascript` wraps it).
 */
export class RawBodyTag extends Tag {
  protected body = ''

  constructor (tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    const end = `end${tagToken.name}`
    const parts: string[] = []
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (isTagToken(token) && token.name === end) {
        this.body = parts.join('')
        return
      }
      parts.push(token.getText())
    }
    throw new Error(`tag ${tagToken.getText()} not closed`)
  }

  render (): unknown {
    return this.body
  }

  /** Ruby Liquid's `Raw#blank?`: a raw tag with nothing in it prints nothing, so an error in a block that holds only that is recorded without being written (`inlineErrors`). A subclass can override it. */
  blank (): boolean {
    return this.body === ''
  }
}
