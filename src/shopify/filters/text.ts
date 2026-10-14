import type { FilterImpl } from '../../template/filter-impl-options'
import { date as engineDate } from '../../filters/date'
import { isNil, LiquidDate, strftime, stringify, toEnumerable, toValue } from '../../util'
import { getDateTimeFormat } from '../../util/intl'
import { attribute, escapeChar, escapeHtml } from '../util/html'
import { SafeHtmlDrop } from '../objects/safe-html'
import { namedForDisplay, plainValue, splitArgs } from '../util/args'
import { hasOwn } from '../util/own'
import { shopifyState } from '../state'
import type { ShopifyFilterSet } from './types'

const ESCAPE_ONCE = /["><']|&(?!([a-zA-Z]+|(#\d+));)/g

/** Ruby Liquid's `escape` (`CGI.escapeHTML`): `"` becomes `&quot;`, where the engine writes `&#34;`. https://shopify.dev/docs/api/liquid/filters/escape ("Escapes special characters in HTML, such as `<>`, `'`, and `&`"; its example prints `&lt;p&gt;Text to be escaped.&lt;/p&gt;`). The page does not name the entity written for `"` or `'`, so `&quot;` and `&#39;` follow Ruby and are not pinned by shopify.dev. Markup a filter wrote as HTML-safe (`SafeHtmlDrop`, from `image_tag`) is left as it is, as on Shopify. */
function escape (this: FilterImpl, input: unknown) {
  if (input instanceof SafeHtmlDrop) return input
  const text = stringify(input)
  this.context.memoryLimit.use(text.length)
  return escapeHtml(text)
}

/** Ruby Liquid's `escape_once`: escapes what is not already an entity. https://shopify.dev/docs/api/liquid/filters/escape_once ("Escapes a string without changing characters that have already been escaped"; its examples show no output). Which entities count as already escaped is not pinned by shopify.dev: named (`&amp;`) and decimal (`&#39;`) ones here, as in Ruby Liquid. */
function escapeOnce (this: FilterImpl, input: unknown) {
  const text = stringify(input)
  this.context.memoryLimit.use(text.length)
  return text.replace(ESCAPE_ONCE, escapeChar)
}

/** Lower-case, quotes and brackets dropped, other non-word runs as single hyphens, no leading or trailing hyphen: the reference algorithm in liquid-spec's docs/implementers/shopify-theme-filters.md. https://shopify.dev/docs/api/liquid/filters/handleize only shows `Health potion` becoming `health-potion`; it does not state the rules for other characters, so they (and non-ASCII text, which this drops to hyphens) are not pinned by shopify.dev. */
export function handleize (input: unknown): string {
  return stringify(input).toLowerCase().replace(/['"()[\]]/g, '').replace(/[^a-z0-9_]+/g, '-').replace(/^-+|-+$/g, '')
}

/** The singular for a count of 1, the plural otherwise. https://shopify.dev/docs/api/liquid/filters/pluralize ("applies English pluralization rules"; its example prints `2 items`). The count is read as Ruby's `to_i` does (`1.5` is 1, so it is singular), following liquid-spec's reference `count.to_i == 1` (docs/implementers/shopify-theme-filters.md at the ref pinned in spec/liquid-spec/Gemfile); shopify.dev does not pin a fractional, negative or non-numeric count. */
function pluralize (count: unknown, singular: unknown, plural: unknown) {
  return Math.trunc(Number(plainValue(toValue(count)))) === 1 ? singular : plural
}

/** Matches both examples on https://shopify.dev/docs/api/liquid/filters/link_to: `title=""` when nothing else is given, extra attributes before `href`, `rel="nofollow"` last. The page does not explain `title=""` or `rel="nofollow"`; they are copied from its two outputs, and whether `rel="nofollow"` is dropped for links to the shop's own pages is not pinned by shopify.dev. */
function linkTo (text: unknown, url: unknown, ...args: unknown[]) {
  const { positional, order } = splitArgs(args)
  const display = namedForDisplay(args)
  const extra = order.map(name => attribute(name, display[name])).join('')
  const title = positional.length ? attribute('title', positional[0]) : extra ? '' : ' title=""'
  return `<a${extra} href="${escapeHtml(url)}"${title} rel="nofollow">${stringify(text)}</a>`
}

/** A product URL under a collection's URL, https://shopify.dev/docs/api/liquid/filters/within (`/products/draught-of-immortality` within a collection prints `/collections/sale-potions/products/draught-of-immortality`). The page does not say what a collection without a URL does; the URL is returned unchanged here. */
function within (url: unknown, collection: unknown) {
  const target = toValue(collection) as Record<string, unknown> | undefined
  const base = target && typeof target === 'object' ? stringify(target.url) : ''
  return base ? `${base}${stringify(url)}` : url
}

/**
 * Shopify's built-in `format:` names. https://shopify.dev/docs/api/liquid/filters/date and https://shopify.dev/docs/api/liquid/filters/time_tag list `abbreviated_date`, `basic`, `date`, `date_at_time`, `default`, `on_date` and the deprecated `short` and `long`, but describe none of them: only `abbreviated_date` has an output (`Apr 14, 2022`), and the two tables https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files links for them (`/docs/api/liquid/filters/date-format` and `/docs/api/liquid/filters/time_tag-format`) returned 404 on 2026-10-13. The other strings follow Shopify's English storefront formats as best known and are not pinned by shopify.dev; each goes on the "confirm on a development store" list before any is marked exact. A theme's own `date_formats` in its locale file win over these.
 */
const DATE_FORMATS: Record<string, string> = {
  abbreviated_date: '%b %d, %Y',
  basic: '%m/%d/%Y',
  date: '%B %d, %Y',
  date_at_time: '%B %d, %Y at %-l:%M %P',
  default: '%a, %b %d, %Y, %-l:%M %P %z',
  on_date: 'on %b %d, %Y',
  short: '%d %b %H:%M',
  long: '%B %d, %Y %H:%M'
}

/** A string that names its zone: it ends in a time followed by `Z`, a numeric offset, or a zone name JavaScript's date parser knows. */
const ZONED = /\d{1,2}:\d{2}(?::\d{2}(?:[.,]\d+)?)?\s*(?:Z|[+-]\d{2}(?::?\d{2})?|(?:UTC|GMT|UT|[ECMP][SD]T)(?:[+-]\d{2}(?::?\d{2})?)?)$/i
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/i
const ALL_DIGITS = /^\d+$/

const zoneFormats = new Map<string, Intl.DateTimeFormat>()

/** How far `zone` (a name, or an offset in minutes behind UTC as `LiquidDate` takes it) is ahead of UTC at `instant`, in milliseconds. Read through `Intl` without involving the machine's zone; undefined for a zone `Intl` does not know. */
function zoneOffset (zone: number | string, instant: number): number | undefined {
  if (typeof zone === 'number') return -zone * 60000
  try {
    let format = zoneFormats.get(zone)
    if (!format) {
      const DateTimeFormat = getDateTimeFormat()
      if (!DateTimeFormat) return undefined
      if (zoneFormats.size >= 16) zoneFormats.clear()
      format = new DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      zoneFormats.set(zone, format)
    }
    const seconds = Math.floor(instant / 1000) * 1000
    const part: Record<string, number> = {}
    for (const { type, value } of format.formatToParts(seconds)) part[type] = Number(value)
    return Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second) - seconds
  } catch (err) {
    return undefined
  }
}

/** The instant whose wall-clock time in `zone` is `wall` (given as if UTC). A wall time a forward transition skips is read with the offset from before it, so it lands after the gap (02:30 on a spring-forward day reads as 03:30); one a backward transition repeats is read as its first occurrence. Neither is pinned by shopify.dev. */
function wallToInstant (wall: number, zone: number | string): number | undefined {
  const before = zoneOffset(zone, wall)
  if (before === undefined) return undefined
  const first = wall - before
  const at = zoneOffset(zone, first)
  if (at === before || at === undefined) return first
  const second = wall - at
  return zoneOffset(zone, second) === at ? second : first
}

/**
 * The instant a string without a zone names when its wall-clock time is read in `zone` (a name such as `UTC`, or an offset in minutes behind UTC), or undefined when the string carries its own zone, is a timestamp, is a date only, or does not parse.
 *
 * The engine's `date` hands a zone-less string such as `2024-01-02 03:04:05` to `new Date`, which reads it in the machine's zone, so the output depends on where the code runs. The preset reads it in its own zone (UTC) instead, as a Shopify store reads it in the shop's zone. https://shopify.dev/docs/api/liquid/filters/date does not pin this: its only input is `2022-04-14 16:56:02 -0400`, it never says how a string without a zone is read, and it never names the zone it renders in, so this is Debutify's choice and goes on the "confirm on a development store" list. A configured zone with daylight saving time is applied at the instant the wall-clock time names (`wallToInstant`), whatever the machine's zone.
 */
function zoneLessInstant (value: string, zone: number | string | undefined): number | undefined {
  if (zone === undefined) return undefined
  const text = value.trim()
  if (ALL_DIGITS.test(text) || ISO_DATE_ONLY.test(text) || ZONED.test(text)) return undefined
  const asUtc = Date.parse(ISO_DATE_TIME.test(text) ? `${text}Z` : `${text} UTC`)
  return isNaN(asUtc) ? undefined : wallToInstant(asUtc, zone)
}

/** What the engine's date code should read for `input`: the clock service's time for `now` and `today`, an instant for a zone-less string (see `zoneLessInstant`), and `input` itself otherwise. */
function readable (filter: FilterImpl, input: unknown, timezone?: number | string): unknown {
  const value = toValue(input)
  if (value === 'now' || value === 'today') return shopifyState(filter.context).services.currentTime()
  if (typeof value !== 'string') return input
  const instant = zoneLessInstant(value, timezone ?? filter.context.opts.timezoneOffset)
  return instant === undefined ? input : new Date(instant)
}

function resolveDate (filter: FilterImpl, input: unknown): LiquidDate | undefined {
  const value = toValue(readable(filter, input))
  if (isNil(value) || value === '') return undefined
  if (typeof value === 'string') filter.context.memoryLimit.use(value.length)
  const init = typeof value === 'number' || (typeof value === 'string' && ALL_DIGITS.test(value)) ? Number(value) * 1000 : value as string | Date
  const date = new LiquidDate(init, filter.context.opts.locale, filter.context.opts.timezoneOffset)
  return date.valid() ? date : undefined
}

function namedFormat (filter: FilterImpl, name: string): string {
  const state = shopifyState(filter.context)
  const fromLocale = state.translator.lookup(`date_formats.${name}`)
  if (typeof fromLocale === 'string') return fromLocale
  if (hasOwn(DATE_FORMATS, name)) return DATE_FORMATS[name]
  // https://shopify.dev/docs/storefronts/themes/architecture/locales/storefront-locale-files: "If a custom format is missing in the locale file of the active language, then a Liquid error is rendered." The page gives no message; this wording is Debutify's and not pinned.
  state.report.unsupported('date_format', name)
  throw new Error(`invalid date format '${name}': it is not a built-in format and the locale file has no date_formats.${name}`)
}

/**
 * The engine's `date`, with `now` and `today` read from the `currentTime` service, Shopify's `format:` names, and zone-less strings read in the preset's zone. https://shopify.dev/docs/api/liquid/filters/date: strftime formats, `'now'` and `'today'` output the current timestamp, `format:` takes a name or a `date_formats` key of the theme's locale file. The page has no timezone argument; the engine's optional second positional one is kept and not pinned by shopify.dev.
 */
function date (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const { positional, named } = splitArgs(args)
  const timezone = positional[1] as number | string | undefined
  const format = named.format !== undefined ? namedFormat(this, stringify(named.format)) : positional[0] as string | undefined
  return engineDate.call(this, readable(this, input, timezone) as string | Date, format, timezone)
}

/** https://shopify.dev/docs/api/liquid/filters/time_tag: a `<time>` tag whose `datetime` is UTC `YYYY-MM-DDThh:mm:ssZ` by default (`2022-04-14 16:56:02 -0400` prints `2022-04-14T20:56:02Z`; the page infers UTC from its examples only), `datetime:` takes a strftime format, `format:` a name or `date_formats` key. Zone-less strings are read as `date` reads them. */
function timeTag (this: FilterImpl, input: unknown, ...args: unknown[]) {
  const when = resolveDate(this, input)
  if (!when) return ''
  const { positional, named } = splitArgs(args)
  const format = positional.length ? stringify(positional[0]) : named.format !== undefined ? namedFormat(this, stringify(named.format)) : '%B %d, %Y'
  const utc = new LiquidDate(when.dateValue(), this.context.opts.locale, 0)
  const datetime = named.datetime !== undefined ? strftime(when, stringify(named.datetime)) : strftime(utc, '%Y-%m-%dT%H:%M:%SZ')
  return `<time datetime="${escapeHtml(datetime)}">${escapeHtml(strftime(when, format))}</time>`
}

/** Name, company, street lines, `city province zip`, country, as in the examples on https://shopify.dev/docs/api/liquid/filters/format_address. The name is the address's `name` ("a combination of the first and last names", https://shopify.dev/docs/api/liquid/objects/address), or its first and last name when there is no `name`. The page says the components follow the address's locale; that order is not modelled, and where the company goes is not pinned. */
function formatAddress (input: unknown) {
  const address = toValue(input) as Record<string, unknown> | undefined
  if (!address || typeof address !== 'object') return ''
  const field = (key: string) => stringify(toValue(address[key])).trim()
  const name = field('name') || [field('first_name'), field('last_name')].filter(Boolean).join(' ')
  const cityLine = [field('city'), field('province_code') || field('province'), field('zip')].filter(Boolean).join(' ')
  const lines = [name, field('company'), field('address1'), field('address2'), cityLine, field('country')].filter(Boolean)
  return lines.length ? `<p>${lines.map(escapeHtml).join('<br>')}</p>` : ''
}

/** https://shopify.dev/docs/api/liquid/filters/item_count_for_variant */
function itemCountForVariant (cart: unknown, variantId: unknown) {
  const items = toEnumerable((toValue(cart) as Record<string, unknown> | undefined)?.items)
  const id = String(toValue(variantId))
  return items.reduce((sum: number, item: any) => (String(toValue(item?.variant_id)) === id ? sum + (Number(item.quantity) || 0) : sum), 0)
}

/** Nothing is posted in a preview, so `form.errors` is empty and there is nothing to list. https://shopify.dev/docs/api/liquid/filters/default_errors */
function defaultErrors () {
  return ''
}

/** Gift card codes in groups of four (`ABCD EFGH IJKL MNOP`). Not in Shopify's filter docs; confirm on the dev store. */
function formatCode (input: unknown) {
  const code = stringify(input).replace(/\s+/g, '')
  return code.replace(/(.{4})(?=.)/g, '$1 ')
}

export const textFilters: ShopifyFilterSet = {
  escape: { status: 'approx', handler: escape },
  escape_once: { status: 'approx', handler: escapeOnce },
  handleize: { status: 'approx', handler: handleize },
  handle: { status: 'approx', handler: handleize },
  pluralize: { status: 'approx', handler: pluralize },
  link_to: { status: 'approx', handler: linkTo },
  within: { status: 'approx', handler: within },
  date: { status: 'approx', handler: date },
  time_tag: { status: 'approx', handler: timeTag },
  format_address: { status: 'approx', handler: formatAddress },
  item_count_for_variant: { status: 'approx', handler: itemCountForVariant },
  default_errors: { status: 'approx', handler: defaultErrors },
  format_code: { status: 'approx', handler: formatCode }
}
