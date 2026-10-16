import { buildStore } from './build'
import type { LiquidObject } from './build'
import { buildCartObject, collectionsOf } from './cart'
import type { CartState } from './cart'
import { applyDiscounts } from './discounts'
import { currencyOf, marketsOf } from './markets'
import { convert } from './pricing'
import type { ShippingRateData, ShippingZoneData, StoreData } from './types'
import { resolveView } from './view'
import type { StoreView } from './view'

/** The address the Cart API's `shipping_address[country]`, `[province]` and `[zip]` parameters give; every part is optional. */
export interface ShippingAddress {
  country?: string
  province?: string
  zip?: string
}

/** One rate as the Cart API answers it. */
export type ShippingRateJson = Record<string, unknown>

/** The answer of `async_shipping_rates.json` and `shipping_rates.json`: the rates, or, for an address no zone covers, the error the storefront answers with status 422. */
export type ShippingRatesAnswer = { shipping_rates: ShippingRateJson[] } | { country: string[], zip?: string[] }

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** The codes `Intl.DisplayNames` names that are no country: ISO 3166-1's deprecated codes (`SU`, `YU`, `ZR`, ...) and its exceptional reservations (`EU`, `UK`, `UN`, ...), several of which share a name with the real country (`UK` and `GB` are both "United Kingdom"), and the pseudo-locales' `XA`, `XB` and `ZZ`. Kosovo's `XK`, which Shopify uses, is kept. */
const NOT_COUNTRIES: ReadonlySet<string> = new Set(['AC', 'AN', 'BU', 'CP', 'CQ', 'CS', 'DD', 'DG', 'DY', 'EA', 'EU', 'EZ', 'FX', 'HV', 'IC', 'NH', 'QO', 'RH', 'SU', 'TA', 'TP', 'UK', 'UN', 'VD', 'XA', 'XB', 'YD', 'YU', 'ZR', 'ZZ'])

interface CountryNames {
  /** The ISO 3166-1 alpha-2 code of each English country name, lower-cased. */
  byName: Map<string, string>
  codes: Set<string>
}

let englishNames: CountryNames | undefined

/** The countries `Intl.DisplayNames` knows, by English name and by code; built on first use. */
function countryNames (): CountryNames {
  if (!englishNames) {
    englishNames = { byName: new Map(), codes: new Set() }
    try {
      const names = new Intl.DisplayNames('en', { type: 'region', fallback: 'none' })
      for (const first of LETTERS) {
        for (const second of LETTERS) {
          const code = first + second
          const known = NOT_COUNTRIES.has(code) ? undefined : names.of(code)
          if (!known) continue
          englishNames.byName.set(known.toLowerCase(), code)
          englishNames.codes.add(code)
        }
      }
    } catch {
      // a runtime without region names knows only the countries of the store's markets and zones
    }
  }
  return englishNames
}

/**
 * The ISO code of the country an address names, given as a code or as an English name, or null when it is no country the engine knows. A code counts when it is one of a market's countries or a zone's, or one `Intl.DisplayNames` names as a country; `UK` is read as `GB` (Shopify's forms use `GB`; no recording settles it). A name is looked up among the names of the store's markets' countries, then in `Intl.DisplayNames`' English names. The Cart API's page gives only `Canada` as an example of the parameter and the recordings send the full name.
 */
function countryCode (data: StoreData, country: string | undefined): string | null {
  const name = country?.trim()
  if (!name) return null
  const marketCountries = marketsOf(data).flatMap(market => market.countries)
  if (/^[A-Za-z]{2}$/.test(name)) {
    const code = name.toUpperCase() === 'UK' ? 'GB' : name.toUpperCase()
    const inZone = (data.shipping_zones ?? []).some(zone => zone.countries !== 'rest_of_world' && zone.countries.some(entry => entry.code === code))
    return inZone || marketCountries.some(entry => entry.iso_code === code) || countryNames().codes.has(code) ? code : null
  }
  const listed = marketCountries.find(entry => entry.name.toLowerCase() === name.toLowerCase())
  return listed?.iso_code ?? countryNames().byName.get(name.toLowerCase()) ?? null
}

/**
 * The zone that ships to a country, the most specific one: a zone that lists the address's province for the country, else a zone that covers the whole country, else the zone of the rest of the world. In Shopify a province listed in one zone is not in the zone that covers the rest of the country, whatever order the zones are in (`ShippingZoneData`: "every province, or the ones named by code").
 */
function zoneFor (zones: ShippingZoneData[], code: string, province: string | undefined): ShippingZoneData | null {
  const entries = (zone: ShippingZoneData) => zone.countries === 'rest_of_world' ? [] : zone.countries.filter(entry => entry.code === code)
  const named = province === undefined ? undefined : zones.find(zone => entries(zone).some(entry => entry.provinces?.some(name => name.toLowerCase() === province.toLowerCase())))
  const whole = () => zones.find(zone => entries(zone).some(entry => !entry.provinces))
  return named ?? whole() ?? zones.find(zone => zone.countries === 'rest_of_world') ?? null
}

const within = (value: number, min?: number, max?: number) => (min === undefined || value >= min) && (max === undefined || value <= max)

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** One rate in the form and the key order of the parity store's recordings (fixtures `ajax-shipping-rates`, `ajax-shipping-rates-en-ca` and `ajax-shipping-rates-en-eu`): `price` a string in the currency's major unit, `code` and `presentment_name` the rate's name, every other field a fixed value. `markup` is `"0.00"` as it is in the shop's currency; in another currency Shopify prints the printed price less the base rate at its live exchange rate, which the engine cannot know (see `shippingRates`). */
function rateJson (name: string, price: number, currency: string): ShippingRateJson {
  return {
    name,
    presentment_name: name,
    code: name,
    price: (price / 100).toFixed(2),
    markup: '0.00',
    source: 'shopify',
    delivery_date: null,
    delivery_range: null,
    delivery_days: [],
    compare_price: null,
    phone_required: false,
    currency,
    carrier_identifier: null,
    delivery_category: null,
    using_merchant_account: null,
    carrier_service_id: null,
    description: null,
    additional_data: null,
    incoterm: null,
    api_client_id: null,
    requested_fulfillment_service_id: null,
    shipment_options: null,
    charge_items: null,
    has_restrictions: null,
    rating_classification: null,
    accepts_instructions: false,
    metafields: null
  }
}

/**
 * The shipping rates for a cart and an address, as the Cart API answers `async_shipping_rates.json` and `shipping_rates.json` (https://shopify.dev/docs/api/ajax/reference/cart: "a `shipping_rates` array", each rate with `name`, `presentment_name`, `code`, `price` as a string such as `"6.00"`, `currency` and the other fields `rateJson` prints; the page documents no status or error). Both endpoints answer alike, the recording of `shipping_rates.json` having every field of the async one (fixture `ajax-shipping-rates`, steps 2, 4, 6 and 8).
 *
 * The zone is the most specific one that names the address's country (a zone that lists the address's province for it, else a zone that covers the whole country), else the zone of the rest of the world (https://help.shopify.com/en/manual/fulfillment/setup/shipping-rates/setting-up-shipping-rates). Its rates are those the cart is inside the ranges of, both ends included: "based on the total value of the order" (the page does not say whether before or after discounts; community answers say Shopify uses the order total after discounts, so the cart's total after its product and order discounts is compared) and the combined weight of the items that ship (grams). Only lines that require shipping count, as the page counts "items shipping from the same location" for the weight; no recording has a line that does not require shipping, so the subtotal following the weight is the engine's own reading. A zone with no rate for the cart answers an empty array: the page says "no rate applies and the customer receives a shipping error at checkout", which the Cart API's recordings do not show.
 *
 * The ranges and a free shipping discount's `max_shipping_price` are in the shop's currency (`ShippingRateData`): the cart is priced in the primary market's view for them, whatever `view` is. `view` gives the currency the rates are printed in, converted like prices at the market's rate, so rounded up where the market rounds: fixtures `ajax-shipping-rates-en-ca` (10.00 USD is 14.00 CAD, 5.00 is 7.00, 15.00 is 21.00, 20.00 is 27.00) and `ajax-shipping-rates-en-eu` (5.00 USD is 4.95 EUR, 15.00 is 13.95, 20.00 is 18.95) record it, and https://help.shopify.com/en/manual/international/pricing/rounding says "you can round your product prices and shipping rates". A free rate stays free. `markup` stays `"0.00"`: in the recordings it is the printed price less the base rate converted at Shopify's live exchange rate (about 1.4175 for CAD and 0.89 for EUR fit every recorded point to a cent, `-0.17` for the Canadian Standard rate), which the dataset does not hold and which changes daily, so the tests mask it (`VOLATILE`) and the README lists it.
 *
 * A free shipping discount that applies (`applyDiscounts`, with the address's country) makes every rate free that is not above the discount's limit. No recording has a free shipping discount, and whether the Cart API's rates already carry one is not recorded; the engine applies it.
 *
 * An address whose country is missing, not a country the engine knows or in no zone gets Shopify's error object, which the storefront answers with status 422 (fixture `ajax-shipping-rates`, step 9: `Atlantis` without a postal code); the postal code is named in it only when none was given. The recording has no case of a known country with no zone, or of a missing country; they answer alike. A supported country without a postal code gets its rates: the message for it is not recorded, and the engine does not know which countries use postal codes.
 */
export function shippingRates (data: StoreData, state: CartState, address: ShippingAddress, view: StoreView = resolveView(data, {})): ShippingRatesAnswer {
  const code = countryCode(data, address.country)
  const province = address.province?.trim() || undefined
  const zone = code ? zoneFor(data.shipping_zones ?? [], code, province) : null
  if (!zone) return { country: ['Country/region not supported'], ...(address.zip?.trim() ? {} : { zip: ['Enter a postal code'] }) }

  const shop = buildStore(data, resolveView(data, {}))
  const cart = buildCartObject(shop, state)
  const shipped = (cart.items as LiquidObject[]).filter(item => item.requires_shipping)
  const subtotal = sum(shipped.map(item => (item.original_line_price as number) - sum((item.discount_allocations as LiquidObject[]).map(entry => entry.amount as number))))
  const weight = sum(shipped.map(item => (item.grams as number) * (item.quantity as number)))
  const { freeShipping } = applyDiscounts(cart.items as LiquidObject[], data.discounts ?? [], state.discountCodes, { collections: collectionsOf(data), currency: shop.currency, shippingCountry: code as string })

  const currency = currencyOf(data, view)
  const rates = shipped.length ? zone.rates.filter((rate: ShippingRateData) => within(subtotal, rate.min_subtotal, rate.max_subtotal) && within(weight, rate.min_weight, rate.max_weight)) : []
  return {
    shipping_rates: rates.map(rate => {
      const free = freeShipping.applies && (freeShipping.maxPrice === undefined || rate.price <= freeShipping.maxPrice)
      return rateJson(rate.name, free ? 0 : convert(rate.price, currency), currency.iso_code)
    })
  }
}
