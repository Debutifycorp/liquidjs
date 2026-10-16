import { productJson, sampleStoreData, storefrontSampleData as data } from '../../src/shopify'
import type { RequestInput, SellingPlanPriceAdjustmentData, StoreData } from '../../src/shopify'
import { ReportCollector } from '../../src/shopify/report'
import { buildStore, selectSellingPlan } from '../../src/shopify/store/build'
import { buildGlobals } from '../../src/shopify/store/globals'
import { planPrice } from '../../src/shopify/store/pricing'
import { loadFixture } from './fixtures'
import { ajaxProductImages, maskVolatile, probeMatches } from './expect-probe'

/** Three variants (11, 12, 13) of one product with two groups: A offers 12 and 13 (one 50% plan), B offers all three (a $1.00 off and a fixed price plan). */
const twoGroups = (): StoreData => {
  const first = sampleStoreData.products![0]
  const base = first.variants[0]
  const plan = (id: number, adjustment: SellingPlanPriceAdjustmentData) => ({ id, name: `Plan ${id}`, options: [`Option ${id}`], recurring_deliveries: false, price_adjustments: [adjustment] })
  return {
    ...sampleStoreData,
    products: [{
      ...first,
      variants: [11, 12, 13].map(id => ({ ...base, id, available: true, price: 1000 })),
      selling_plan_groups: [
        { id: 'a', name: 'A', variant_ids: [12, 13], options: [{ name: 'Every', values: ['Option 1'] }], selling_plans: [plan(1, { value_type: 'percentage', value: 50 })] },
        { id: 'b', name: 'B', options: [{ name: 'Every', values: ['Option 2', 'Option 3'] }], selling_plans: [plan(2, { value_type: 'fixed_amount', value: 100 }), plan(3, { value_type: 'price', value: 500 })] }
      ]
    }]
  }
}

const eur = { rate: 0.92, adjustment: 0, rounding: 0.95, own: false, iso_code: 'EUR' } as any

const pick = (b: any) => ({
  requires_selling_plan: b.requires_selling_plan,
  selected_selling_plan: b.selected_selling_plan,
  selected_or_first_available_selling_plan_allocation: b.selected_or_first_available_selling_plan_allocation,
  selling_plan_groups: b.selling_plan_groups,
  variants: b.variants.map((v: any) => ({ id: v.id, requires_selling_plan: v.requires_selling_plan, selected_selling_plan_allocation: v.selected_selling_plan_allocation, allocations: v.allocations }))
})

describe('selling plans', () => {
  describe('planPrice', () => {
    it('prices the three adjustment kinds', () => {
      expect(planPrice(2500, { value_type: 'percentage', value: 10 })).toBe(2250)
      expect(planPrice(2500, { value_type: 'fixed_amount', value: 200 })).toBe(2300)
      expect(planPrice(20000, { value_type: 'price', value: 2500 })).toBe(2500)
      expect(planPrice(100, { value_type: 'fixed_amount', value: 200 })).toBe(0)
    })
    it('prints a half minor unit of a percentage up, as the parity store does', () => {
      // fixture `probe-product-en-eu`: 2395 less 10% is 2155.5, printed 2156 (the only fraction the fixtures hold)
      expect(planPrice(2395, { value_type: 'percentage', value: 10 })).toBe(2156)
    })
    it('rounds the other fractions of a percentage to the nearest, the engine\'s own choice, and stops at zero', () => {
      // no fixture pins these: 999 less 33% is 669.33 (not 670) and 999 less 66.7% is 332.667 (not 332)
      expect(planPrice(999, { value_type: 'percentage', value: 33 })).toBe(669)
      expect(planPrice(999, { value_type: 'percentage', value: 66.7 })).toBe(333)
      expect(planPrice(100, { value_type: 'percentage', value: 150 })).toBe(0)
    })
    it('converts a fixed amount or price to the view currency without rounding it up', () => {
      // fixture `probe-product-en-eu`: the $2.00 off plan is 1.84 EUR off (200 x 0.92), not 1.95
      expect(planPrice(2395, { value_type: 'fixed_amount', value: 200 }, eur)).toBe(2211)
      expect(planPrice(2395, { value_type: 'percentage', value: 10 }, eur)).toBe(2156)
      expect(planPrice(23000, { value_type: 'price', value: 2500 }, eur)).toBe(2300)
    })
  })

  for (const name of ['probe-product-plans', 'probe-product-plan-selected', 'probe-product-plan-second', 'probe-product-plan-variant', 'probe-product-requires-plan', 'probe-product-en-eu', 'probe-product-fr-eu', 'probe-product-default']) {
    it(`matches ${name}`, async () => {
      const { actual, expected } = await probeMatches(name, pick)
      expect(actual).toEqual(expected)
    })
  }
  for (const name of ['probe-product-plans', 'probe-product-plan-selected', 'probe-product-requires-plan', 'probe-product-en-eu', 'probe-product-fr-eu']) {
    it(`prints the product through the json filter as ${name} does, plans included`, async () => {
      const { actual, expected } = await probeMatches(name, (b: any) => b.ajax)
      expect(actual).toEqual(expected)
      expect(Object.keys((actual as any).selling_plan_groups[0])).toEqual(Object.keys((expected as any).selling_plan_groups[0]))
      expect(Object.keys((actual as any).selling_plan_groups[0].selling_plans[0])).toEqual(Object.keys((expected as any).selling_plan_groups[0].selling_plans[0]))
      expect(Object.keys((actual as any).selling_plan_groups[0].selling_plans[0].price_adjustments[0])).toEqual(Object.keys((expected as any).selling_plan_groups[0].selling_plans[0].price_adjustments[0]))
      expect(Object.keys((actual as any).variants[0].selling_plan_allocations[0])).toEqual(Object.keys((expected as any).variants[0].selling_plan_allocations[0]))
    })
  }
  it('prints the product JSON of a product with selling plans as /products/<handle>.js does', () => {
    const recorded = loadFixture('ajax-product-js').steps[1].body as any
    const answer = productJson(data, 'slides') as any
    expect(maskVolatile(answer)).toEqual(maskVolatile(ajaxProductImages(recorded)))
    expect(Object.keys(answer.selling_plan_groups[0])).toEqual(Object.keys(recorded.selling_plan_groups[0]))
    expect(Object.keys(answer.selling_plan_groups[0].selling_plans[0])).toEqual(Object.keys(recorded.selling_plan_groups[0].selling_plans[0]))
    expect(Object.keys(answer.variants[0].selling_plan_allocations[0])).toEqual(Object.keys(recorded.variants[0].selling_plan_allocations[0]))
  })

  describe('the objects a template reads', () => {
    const store = buildStore(data)
    const slides = () => (store.products as any as { liquidMethodMissing: (key: string) => any }).liquidMethodMissing('slides')
    const page = (handle: string, request: RequestInput = {}) => buildGlobals({ store, data, templateName: 'product', request: { resource: handle, ...request }, locale: 'en', report: new ReportCollector() }).globals.product as any

    it('builds the groups of the data, ids and all', () => {
      const [group] = slides().selling_plan_groups
      expect(group).toMatchObject({ id: 'gid-70001', name: 'Subscribe and save', app_id: null, selling_plan_selected: false })
      expect(group.options).toEqual([{ name: 'Delivery every', position: 1, values: ['2 weeks', 'Month'], selected_value: null }])
      expect(group.selling_plans.map((p: any) => [p.id, p.group_id, p.selected, p.description, p.recurring_deliveries])).toEqual([[71001, 'gid-70001', false, null, true], [71002, 'gid-70001', false, null, true]])
      expect(group.selling_plans[0].options).toEqual([{ name: 'Delivery every', position: 1, value: '2 weeks' }])
      expect(group.selling_plans[0].price_adjustments).toEqual([{ order_count: null, position: 1, value: 10, value_type: 'percentage' }])
      expect(group.selling_plans[0].checkout_charge).toEqual({ value_type: 'percentage', value: 100 })
    })
    it('gives every variant an allocation per plan, pointing at the group\'s own plans', () => {
      const product = slides()
      for (const variant of product.variants) {
        expect(variant.selling_plan_allocations.map((a: any) => [a.selling_plan.id, a.selling_plan_group_id, a.price, a.compare_at_price, a.per_delivery_price])).toEqual([[71001, 'gid-70001', 2250, 2500, 2250], [71002, 'gid-70001', 2300, 2500, 2300]])
        expect(variant.selling_plan_allocations[0].selling_plan).toBe(product.selling_plan_groups[0].selling_plans[0])
        expect(variant.selected_selling_plan_allocation).toBeNull()
        expect(variant.requires_selling_plan).toBe(false)
      }
      expect(product.requires_selling_plan).toBe(false)
      expect(product.selected_selling_plan).toBeNull()
      expect(product.selected_selling_plan_allocation).toBeNull()
      expect(product.selected_or_first_available_selling_plan_allocation).toBe(product.variants[0].selling_plan_allocations[0])
    })
    it('gives a product with no groups nothing', () => {
      const hoodie = (buildStore(data).products as any).liquidMethodMissing('hoodie')
      expect(hoodie.selling_plan_groups).toEqual([])
      expect(hoodie.requires_selling_plan).toBe(false)
      expect(hoodie.selected_or_first_available_selling_plan_allocation).toBeNull()
      expect(hoodie.variants[0]).toMatchObject({ selling_plan_allocations: [], requires_selling_plan: false, selected_selling_plan_allocation: null })
    })
    it('takes the first allocation of the first variant when no variant is available', () => {
      const soldOut = { ...data, products: [{ ...data.products![0], variants: data.products![0].variants.map(v => ({ ...v, available: false })), selling_plan_groups: [{ id: 'g', name: 'G', options: [{ name: 'Every', values: ['Week'] }], selling_plans: [{ id: 1, name: 'Weekly', options: ['Week'], recurring_deliveries: true, price_adjustments: [] }] }] }] }
      const product = (buildStore(soldOut).products as any).liquidMethodMissing(soldOut.products[0].handle)
      expect(product.selected_or_first_available_selling_plan_allocation).toBe(product.variants[0].selling_plan_allocations[0])
      // a plan with no price adjustment leaves the price alone
      expect(product.variants[0].selling_plan_allocations[0]).toMatchObject({ price: product.variants[0].price, compare_at_price: product.variants[0].price, price_adjustments: [] })
    })
    it('offers a group only to the variants it names', () => {
      const first = sampleStoreData.products![0]
      const only = { ...sampleStoreData, products: [{ ...first, variants: [{ ...first.variants[0], id: 11 }, { ...first.variants[0], id: 12 }], selling_plan_groups: [{ id: 'g', name: 'G', variant_ids: [12], options: [{ name: 'Every', values: ['Week'] }], selling_plans: [{ id: 1, name: 'Weekly', options: ['Week'], recurring_deliveries: false, price_adjustments: [{ value_type: 'percentage' as const, value: 50 }] }] }] }] }
      const product = (buildStore(only).products as any).liquidMethodMissing(first.handle)
      expect(product.variants.map((v: any) => v.selling_plan_allocations.length)).toEqual([0, 1])
      expect(product.selling_plan_groups).toHaveLength(1)
    })
    it('lists a group only when it offers some variant of the product', () => {
      // shopify.dev: product.selling_plan_groups are "the selling plan groups that the variants of the product are included in"
      const first = sampleStoreData.products![0]
      const group = (id: string, variantIds?: number[]) => ({ id, name: id, ...(variantIds ? { variant_ids: variantIds } : {}), options: [{ name: 'Every', values: ['Week'] }], selling_plans: [{ id: 1, name: 'Weekly', options: ['Week'], recurring_deliveries: false, price_adjustments: [] }] })
      const listed = { ...sampleStoreData, products: [{ ...first, selling_plan_groups: [group('none', []), group('absent', [999999]), group('all'), group('some', [first.variants[0].id])] }] }
      const product = (buildStore(listed).products as any).liquidMethodMissing(first.handle)
      expect(product.selling_plan_groups.map((g: any) => g.id)).toEqual(['all', 'some'])
      expect(product.variants[0].selling_plan_allocations.map((a: any) => a.selling_plan_group_id)).toEqual(['all', 'some'])
    })
    it('requires a plan when the data says so, on the product and on every variant', () => {
      const frontpack = (buildStore(data).products as any).liquidMethodMissing('frontpack')
      expect(frontpack.requires_selling_plan).toBe(true)
      expect(frontpack.variants.every((v: any) => v.requires_selling_plan)).toBe(true)
      expect(frontpack.selected_or_first_available_selling_plan_allocation.selling_plan.id).toBe(71003)
    })
    it('converts a fixed price plan to the market\'s currency like a fixed amount, unrounded (the engine\'s choice: no fixture records it)', () => {
      const store = buildStore(data, { market: 'eu', language: 'en', prefix: '/en-eu' } as any)
      const frontpack = (store.products as any).liquidMethodMissing('frontpack')
      expect(frontpack.selling_plan_groups[0].selling_plans[0].price_adjustments[0]).toEqual({ order_count: null, position: 1, value: 2300, value_type: 'price' })
      const [variant] = frontpack.variants
      expect(variant.selling_plan_allocations[0]).toMatchObject({ price: 2300, per_delivery_price: 2300, compare_at_price: variant.price, price_adjustments: [{ position: 1, price: 2300 }] })
      expect(variant.price).toBeGreaterThan(2300)
    })
    it('prices the plans in the view currency of a market', () => {
      const store = buildStore(data, { market: 'eu', language: 'en', prefix: '/en-eu' } as any)
      const product = (store.products as any).liquidMethodMissing('slides')
      expect(product.selling_plan_groups[0].selling_plans[1].price_adjustments[0]).toEqual({ order_count: null, position: 1, value: 184, value_type: 'fixed_amount' })
      expect(product.variants[0].selling_plan_allocations.map((a: any) => a.price)).toEqual([2156, 2211])
    })

    describe('a selected plan', () => {
      it('selects the plan, its group and the group option\'s value, and nothing else', () => {
        const product = page('slides', { sellingPlan: 71002 })
        const [group] = product.selling_plan_groups
        expect(product.selected_selling_plan).toBe(group.selling_plans[1])
        expect(group.selling_plans.map((p: any) => p.selected)).toEqual([false, true])
        expect(group.selling_plan_selected).toBe(true)
        expect(group.options[0].selected_value).toBe('Month')
        expect(product.selected_selling_plan.id).toBe(71002)
      })
      it('is a copy: the product every other request shares keeps selecting nothing', () => {
        const shared = slides()
        const chosen = page('slides', { sellingPlan: 71001 })
        expect(chosen).not.toBe(shared)
        expect(shared.selected_selling_plan).toBeNull()
        expect(shared.selling_plan_groups[0].selling_plan_selected).toBe(false)
        expect(shared.selling_plan_groups[0].selling_plans.every((p: any) => !p.selected)).toBe(true)
        expect(shared.selling_plan_groups[0].options[0].selected_value).toBeNull()
        expect(String(chosen)).toBe('slides')
      })
      it('is the one object everywhere the copy points at it', () => {
        const product = page('slides', { sellingPlan: 71001 })
        const plan = product.selling_plan_groups[0].selling_plans[0]
        expect(plan.selected).toBe(true)
        for (const variant of product.variants) {
          expect(variant.selling_plan_allocations[0].selling_plan).toBe(plan)
          expect(variant.selling_plan_allocations[0].selling_plan.selected).toBe(true)
          expect(variant.product).toBe(product)
        }
        expect(product.first_available_variant).toBe(product.variants[0])
        expect(product.selected_or_first_available_variant).toBe(product.variants[0])
        expect(product.selected_variant).toBeNull()
      })
      it('gives a variant its selected allocation only when it is the selected variant', () => {
        // fixture `probe-product-plan-selected`: with no variant in the address no variant has one; shopify.dev ties product.selected_selling_plan_allocation to "the currently selected variant"
        const bare = page('slides', { sellingPlan: 71002 })
        expect(bare.variants.map((v: any) => v.selected_selling_plan_allocation)).toEqual([null, null, null])
        expect(bare.selected_selling_plan_allocation).toBeNull()
        const chosen = page('slides', { sellingPlan: 71002, variant: 43695710404630 })
        expect(chosen.variants.map((v: any) => v.selected_selling_plan_allocation?.selling_plan.id ?? null)).toEqual([null, 71002, null])
        expect(chosen.selected_variant.selected_selling_plan_allocation).toBe(chosen.selected_variant.selling_plan_allocations[1])
        expect(chosen.selected_selling_plan_allocation).toBe(chosen.selected_variant.selling_plan_allocations[1])
        expect(chosen.selected_or_first_available_selling_plan_allocation).toBe(chosen.selected_selling_plan_allocation)
      })
      it('leaves the first available allocation as it was when no variant is selected', () => {
        const product = page('slides', { sellingPlan: 71002 })
        expect(product.selected_or_first_available_selling_plan_allocation).toBe(product.variants[0].selling_plan_allocations[0])
        expect(product.selected_or_first_available_selling_plan_allocation.selling_plan.id).toBe(71001)
      })
      it('keeps the selected variant a request chose beside it', () => {
        const product = page('slides', { variant: 43695710404630, sellingPlan: 71001 })
        expect(product.selected_variant.id).toBe(43695710404630)
        expect(product.variants.filter((v: any) => v.selected).map((v: any) => v.id)).toEqual([43695710404630])
        expect(product.options_with_values[0].selected_value).toBe('Medium')
        expect(product.selected_or_first_available_variant).toBe(product.selected_variant)
      })
      it('leaves the first available allocation alone when only a variant is chosen', () => {
        const product = page('slides', { variant: 43695710404630 })
        expect(product.selected_variant.id).toBe(43695710404630)
        expect(product.selected_selling_plan).toBeNull()
        expect(product.selected_selling_plan_allocation).toBeNull()
        expect(product.selected_or_first_available_selling_plan_allocation).toBe(product.variants[0].selling_plan_allocations[0])
      })
      describe('with two groups, one of which does not offer every variant', () => {
        const custom = twoGroups()
        const customStore = buildStore(custom)
        const shared = () => (customStore.products as any).liquidMethodMissing(custom.products![0].handle)
        const choose = (request: RequestInput) => buildGlobals({ store: customStore, data: custom, templateName: 'product', request: { resource: custom.products![0].handle, ...request }, locale: 'en', report: new ReportCollector() }).globals.product as any

        it('offers each variant its own plans', () => {
          expect(shared().variants.map((v: any) => v.selling_plan_allocations.map((a: any) => a.selling_plan.id))).toEqual([[2, 3], [1, 2, 3], [1, 2, 3]])
          expect(shared().variants[1].selling_plan_allocations.map((a: any) => a.price)).toEqual([500, 900, 500])
        })
        it('selects a plan of one group and leaves the other group, and the plans its allocations hold, as they were', () => {
          const product = choose({ sellingPlan: 1 })
          const [a, b] = product.selling_plan_groups
          expect([a.selling_plan_selected, b.selling_plan_selected]).toEqual([true, false])
          expect(b).toBe(shared().selling_plan_groups[1])
          expect(a).not.toBe(shared().selling_plan_groups[0])
          const [fromA, fromB] = [product.variants[1].selling_plan_allocations[0].selling_plan, product.variants[1].selling_plan_allocations[1].selling_plan]
          expect(fromA).toBe(a.selling_plans[0])
          expect(fromA.selected).toBe(true)
          expect(fromB).toBe(b.selling_plans[0])
          expect(fromB.selected).toBe(false)
          expect(product.selected_selling_plan).toBe(a.selling_plans[0])
        })
        it('gives a selected variant that the plan\'s group does not offer no selected allocation, and the first available one instead', () => {
          // shopify.dev: the selected allocation is returned "if a variant and selling plan are selected"; variant 11 has no allocation for plan 1
          const product = choose({ variant: 11, sellingPlan: 1 })
          expect(product.selected_variant.id).toBe(11)
          expect(product.selected_selling_plan.id).toBe(1)
          expect(product.selected_variant.selected_selling_plan_allocation).toBeNull()
          expect(product.selected_selling_plan_allocation).toBeNull()
          expect(product.selected_or_first_available_selling_plan_allocation).toBe(product.variants[0].selling_plan_allocations[0])
          expect(product.selected_or_first_available_selling_plan_allocation.selling_plan.id).toBe(2)
        })
        it('gives a selected variant that the group offers the allocation for the plan', () => {
          const product = choose({ variant: 13, sellingPlan: 3 })
          expect(product.selected_variant.selected_selling_plan_allocation.selling_plan.id).toBe(3)
          expect(product.selected_selling_plan_allocation).toBe(product.selected_variant.selected_selling_plan_allocation)
          expect(product.selected_selling_plan_allocation.price).toBe(500)
          expect(product.selected_or_first_available_selling_plan_allocation).toBe(product.selected_selling_plan_allocation)
        })
      })
      it('selects nothing for an id no group of the product has', () => {
        const shared = slides()
        expect(selectSellingPlan(shared, 99999)).toBe(shared)
        expect(selectSellingPlan(shared, undefined)).toBe(shared)
        expect(page('slides', { sellingPlan: 71003 })).toBe(shared)
        expect(page('hoodie', { sellingPlan: 71001 }).selected_selling_plan).toBeNull()
      })
    })
  })
})
