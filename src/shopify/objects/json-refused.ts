/** What Shopify's `json` prints in place of an object it will not print. */
export const JSON_NOT_ALLOWED = 'json not allowed for this object'

/** The answer `json` gives for an object it will not print: `{"error":"json not allowed for this object"}`. A new object each time, so no caller can change the others'. */
export const jsonRefused = (): { error: string } => ({ error: JSON_NOT_ALLOWED })

/**
 * Marks `target` as an object `json` does not print: `{{ target | json }}` writes `jsonRefused()` where the object stands, in a list or inside another object too. The scenarios `probe-product-video-media`, `probe-product-model-media` and `probe-product-extras-unit-price` record the objects Shopify refuses: a video's and a 3D model's sources, a product's `metafields` (also when empty, scenarios `probe-product-extras-gift-card` and `probe-product-extras-pickup`), a rating, and a variant's unit price measurement. The mark is a `toJSON` that is not enumerable, so `for`, the engine's property reads and spreading do not see it. Returns `target`.
 */
export function refuseJson<T extends object> (target: T): T {
  Object.defineProperty(target, 'toJSON', { value: jsonRefused, enumerable: false, configurable: true })
  return target
}
