import { Drop } from './drop'

export class ForloopDrop extends Drop {
  protected i = 0
  public name: string
  public length: number
  /** `parentloop` is the `forloop` of the enclosing loop, `null` at the outermost; without it (`undefined`) the drop has no `parentloop`, as in upstream LiquidJS. https://shopify.dev/docs/api/liquid/objects/forloop#forloop-parentloop */
  public constructor (length: number, collection: string, variable: string, parentloop?: ForloopDrop | null) {
    super()
    this.length = length
    this.name = `${variable}-${collection}`
    if (parentloop !== undefined) Object.defineProperty(this, 'parentloop', { value: () => parentloop })
  }
  public next () {
    this.i++
  }
  public index0 () {
    return this.i
  }
  public index () {
    return this.i + 1
  }
  public first () {
    return this.i === 0
  }
  public last () {
    return this.i === this.length - 1
  }
  public rindex () {
    return this.length - this.i
  }
  public rindex0 () {
    return this.length - this.i - 1
  }
  public valueOf () {
    return JSON.stringify(this)
  }
}
