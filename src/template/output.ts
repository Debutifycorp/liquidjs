import { Value } from './value'
import { Arguments, Template, TemplateImpl } from '../template'
import { Context } from '../context/context'
import { Emitter } from '../emitters/emitter'
import { OutputToken } from '../tokens/output-token'
import { Tokenizer } from '../parser'
import { Liquid } from '../liquid'
import { Filter } from './filter'
import { FilterToken } from '../tokens'
import { toValue } from '../util'
import { LiquidFloat } from '../util/liquid-float'

export class Output extends TemplateImpl<OutputToken> implements Template {
  value: Value
  public constructor (token: OutputToken, liquid: Liquid) {
    super(token)
    const tokenizer = new Tokenizer(token.input, liquid.options.operators, token.file, token.contentRange, liquid.options.groupedExpressions, liquid.options.rubyTokenizer)
    this.value = new Value(tokenizer.readFilteredValue(), liquid)
    const filters = this.value.filters
    const outputEscape = liquid.options.outputEscape
    if (!filters[filters.length - 1]?.raw && outputEscape) {
      const token = new FilterToken(toString.call(outputEscape), [], '', 0, 0)
      filters.push(new Filter(token, outputEscape, liquid))
    }
  }
  public * render (ctx: Context, emitter: Emitter): IterableIterator<unknown> {
    // `render` is typed `IterableIterator<unknown>`, so TypeScript types a `yield` result as `undefined`; the cast avoids TS2358 on `instanceof`
    const raw = (yield this.value.value(ctx, false)) as unknown
    // only an object can be a Drop or a decimal; a string or a number is written as it is
    const val = typeof raw !== 'object' || raw instanceof LiquidFloat ? raw : yield toValue(raw)
    emitter.write(val)
  }

  public * arguments (): Arguments {
    yield this.value
  }
}
