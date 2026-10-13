/** The value stored under `key` in a plain object, or undefined when `key` is not one of its own properties. Plain `record[key]` also reads `Object.prototype`, so a key such as `constructor` in data from a person or a model would return a function. */
export function own<T> (record: Record<string, T> | undefined | null, key: string): T | undefined {
  return record && Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined
}
