import { Liquid, TopLevelToken, Emitter, Value, TagToken, Context, Tag } from '..'
import { Arguments } from '../template'
import { toValue } from '../util'
import { LiquidFloat } from '../util/liquid-float'

export default class extends Tag {
  private value?: Value

  constructor (token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid) {
    super(token, remainTokens, liquid)
    this.tokenizer.skipBlank()
    if (!this.tokenizer.end()) {
      this.value = new Value(this.tokenizer.readFilteredValue(), this.liquid)
    }
  }
  * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    if (!this.value) return
    const raw = yield this.value.value(ctx, false)
    const val = raw instanceof LiquidFloat ? raw : yield toValue(raw)
    emitter.write(val)
  }

  public * arguments (): Arguments {
    if (this.value) {
      yield this.value
    }
  }
}
