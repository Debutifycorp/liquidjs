/** Whether `key` is one of the object's own properties. `key in record` and `record[key]` also read `Object.prototype`, so a key such as `constructor` in data from a person or a model would be found there. */
export function hasOwn (record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

/** The value stored under `key` in a plain object, or undefined when `key` is not one of its own properties (see `hasOwn`). */
export function own<T> (record: Record<string, T> | undefined | null, key: string): T | undefined {
  return record && hasOwn(record, key) ? record[key] : undefined
}

/** Whether `value` is a record: an object that is neither null nor an array, as a JSON object parses. */
export function isRecord (value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** What a section key, a block key and a colour-scheme id may hold when the theme is not trusted with html: letters, digits, `-` and `_`. Shopify's own are of that form (`main`, `image_banner`, `heading_aBc123`, `scheme-1`), and themes such as Dawn print them in ids, class names, `data-` attributes and CSS selectors. */
export const PLAIN_ID = /^[A-Za-z0-9_-]+$/
