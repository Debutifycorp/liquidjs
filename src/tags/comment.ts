import { Liquid, TopLevelToken, TagToken, Tag } from '..'
import { isTagToken } from '../util'

export default class extends Tag {
  constructor (tagToken: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(tagToken, remainTokens, liquid)
    // the tokenizer nests top-level comments when `rawTags` lists `comment`; inside a `liquid` tag the nesting is left to the tag tokens
    const nests = liquid.options.rawTags.includes('comment')
    let depth = 0
    while (remainTokens.length) {
      const token = remainTokens.shift()!
      if (!isTagToken(token)) continue
      if (nests && token.name === 'comment') depth++
      else if (token.name === 'endcomment') {
        if (depth === 0) return
        depth--
      }
    }
    throw new Error(`tag ${tagToken.getText()} not closed`)
  }
  render () {}
}
