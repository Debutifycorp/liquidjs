import CoreTablerowTag from '../../tags/tablerow'
import { createScope } from '../../context/scope'
import { TablerowloopDrop } from '../../drop/tablerowloop-drop'
import { isNil, toEnumerable, toValue } from '../../util'
import { evalToken } from '../../render'
import type { Context } from '../../context'
import type { Emitter } from '../../emitters'

/**
 * `{% tablerow %}` with Shopify's line breaks. https://shopify.dev/docs/api/liquid/tags/tablerow prints the first row as `<tr class="row1">`, a line break, then the cells; a closed row is followed by a line break and the next row opens on the same line (`</td></tr>` line break `<tr class="row2"><td class="col1">`); the last row closes with a line break too, and an empty collection still prints `<tr class="row1">`, a line break and `</tr>` and a line break. liquid-spec (`specs/liquid_ruby/specs.yml`, `TableRowTest`) records the same text. The engine's own tag prints no line breaks and nothing for an empty collection, so the root entry keeps it and the preset registers this one. Arguments are read as the engine's tag reads them, except that `cols` which is not a positive number never wraps (liquid-spec `specs/liquid_ruby/specs.yml`, `TableRowTest#test_cols_nil_constant_same_as_evaluated_nil_expression`), and a collection that is nil, a boolean or a number prints nothing.
 */
export class TablerowTag extends CoreTablerowTag {
  public * render (ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
    const value = toValue(yield evalToken(this.collection, ctx))
    // a value that is no collection (nil, a boolean, a number) prints nothing at all, not even an empty row (liquid-spec `specs/liquid_ruby/manual.yml`: "Tablerow renders empty string when collection is false"); an empty collection still prints one
    if (isNil(value) || typeof value === 'boolean' || typeof value === 'number') return
    let collection = toEnumerable(value)
    const args = (yield this.args.render(ctx)) as Record<string, any>
    const offset = args.offset || 0
    const limit = (args.limit === undefined) ? collection.length : args.limit

    collection = collection.slice(offset, offset + limit)
    // `cols` that is not a positive number (nil, false, text) never wraps the row
    const wanted = Math.floor(Number(args.cols))
    const cols = wanted > 0 ? wanted : collection.length

    const renderer = this.liquid.renderer
    const tablerowloop = new TablerowloopDrop(collection.length, cols, this.collection.getText(), this.variable)
    const scope = createScope({ tablerowloop })
    ctx.push(scope)

    emitter.write('<tr class="row1">\n')
    for (let idx = 0; idx < collection.length; idx++, tablerowloop.next()) {
      scope[this.variable] = collection[idx]
      emitter.write(`<td class="col${tablerowloop.col()}">`)
      yield renderer.renderTemplates(this.templates, ctx, emitter)
      emitter.write('</td>')
      if (tablerowloop.col_last() && !tablerowloop.last()) emitter.write(`</tr>\n<tr class="row${tablerowloop.row() + 1}">`)
    }
    emitter.write('</tr>\n')
    ctx.pop()
  }
}
