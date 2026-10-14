import { Drop } from './drop'
import { Comparable } from './comparable'
import { isObject, isString, isArray, isFunction, isNil, toValue } from '../util'

const EMPTY = 'empty?'

/** Whether `value` answers `empty?` itself: a method or property of a Drop, or an own key of any other object. */
function hasOwnEmpty (value: object): boolean {
  return value instanceof Drop ? EMPTY in value : Object.prototype.hasOwnProperty.call(value, EMPTY)
}

export class EmptyDrop extends Drop implements Comparable {
  /** A value that has its own `empty?` is empty when that is truthy, as Ruby Liquid's condition calls `empty?` on a value that responds to it; otherwise strings, arrays and objects are empty when they have no length or keys. */
  public * equals (value: any): Generator<unknown, boolean, any> {
    if (value instanceof EmptyDrop) return false
    value = yield toValue(value)
    if (isString(value) || isArray(value)) return value.length === 0
    if (isObject(value) && hasOwnEmpty(value)) {
      const own = (value as Record<string, unknown>)[EMPTY]
      const result = toValue(yield (isFunction(own) ? own.call(value) : own))
      return result !== false && !isNil(result)
    }
    if (isObject(value)) return Object.keys(value).length === 0
    return false
  }
  public gt () {
    return false
  }
  public geq () {
    return false
  }
  public lt () {
    return false
  }
  public leq () {
    return false
  }
  public valueOf () {
    return ''
  }
  static is (value: unknown): boolean {
    return value instanceof EmptyDrop
  }
}
