import { Drop } from '../../drop'
import { own } from '../util/own'

/** The resource types `closest` holds besides metaobjects, https://shopify.dev/docs/api/liquid/objects/closest. */
export const CLOSEST_TYPES: readonly string[] = ['product', 'collection', 'article', 'blog', 'page']

/** What `closest` holds at one place of the render tree: a resource by type, and metaobjects by definition type. A key that is present and nil is a resource some place set to nothing (an empty product setting, `closest.product: null`), which hides the ones further up; an absent key is one nothing set. */
export interface ClosestScope {
  readonly resources: Readonly<Record<string, unknown>>
  readonly metaobjects: Readonly<Record<string, unknown>>
}

export const NO_CLOSEST: ClosestScope = { resources: {}, metaobjects: {} }

/** `base` with what `over` sets laid over it. */
export function layerClosest (base: ClosestScope, over?: ClosestScope): ClosestScope {
  if (!over) return base
  return { resources: { ...base.resources, ...over.resources }, metaobjects: { ...base.metaobjects, ...over.metaobjects } }
}

const SCOPE = Symbol('scope')

/**
 * Shopify's `closest` object, https://shopify.dev/docs/api/liquid/objects/closest: `closest.product`, `closest.collection`, `closest.article`, `closest.blog`, `closest.page`, and `closest.metaobject.<definition_type>`, each nil when nothing near holds one. The scope is read when a property is, so the page's global `closest` follows the section or block being rendered.
 */
export class ClosestDrop extends Drop {
  private readonly [SCOPE]: () => ClosestScope

  public constructor (scope: () => ClosestScope) {
    super()
    this[SCOPE] = scope
  }

  public liquidMethodMissing (key: string | number): unknown {
    const scope = this[SCOPE]()
    if (key === 'metaobject') return Object.freeze({ ...scope.metaobjects })
    return CLOSEST_TYPES.includes(String(key)) ? own(scope.resources, String(key)) ?? null : undefined
  }
}
