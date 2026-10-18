import { isNil, isString, toValue } from '../util'
import { EmptyDrop } from '../drop'

export class BlankDrop extends EmptyDrop {
  public * equals (value: any): Generator<unknown, boolean, any> {
    // a value that was assigned `blank` is blank, which Shopify's themes rely on: `{% assign rating = blank %}` and then `{% if rating == blank %}` runs the branch (our theme's review snippet, scenario `page-product-unit-price`: the storefront left out `aggregateRating` without it). Unlike `empty == empty`, which stays false.
    if (value instanceof BlankDrop) return true
    if (value === false) return true
    if (isNil(yield toValue(value))) return true
    if (isString(value)) return /^\s*$/.test(value)
    return yield super.equals(value)
  }
  static is (value: unknown): boolean {
    return value instanceof BlankDrop
  }
}
