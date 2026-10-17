import { Drop } from './drop'

const PARENT = Symbol('parentloop')

export class ForloopDrop extends Drop {
  protected i = 0
  public name: string
  public length: number
  private readonly [PARENT]: ForloopDrop | null
  public constructor (length: number, collection: string, variable: string, parentloop: ForloopDrop | null = null) {
    super()
    this.length = length
    this.name = `${variable}-${collection}`
    this[PARENT] = parentloop
  }
  /** The `forloop` of the `for` loop this one is nested in, nil at the outermost; https://shopify.dev/docs/api/liquid/objects/forloop#forloop-parentloop. */
  public parentloop () {
    return this[PARENT]
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
