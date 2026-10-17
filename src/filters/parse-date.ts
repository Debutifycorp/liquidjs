import { toValue, isString, isNumber, LiquidDate, isNil } from '../util'
import { NormalizedFullOptions } from '../liquid-options'

/** `locale` names the month and day words the date prints; the options' own locale when not given. */
export function parseDate (v: string | Date, opts: NormalizedFullOptions, timezoneOffset?: number | string, localeOverride?: string): LiquidDate | undefined {
  let date: LiquidDate | undefined
  const defaultTimezoneOffset = timezoneOffset ?? opts.timezoneOffset
  const locale = localeOverride ?? opts.locale
  v = toValue(v)
  if (isNil(v)) {
    return undefined
  } else if (v === 'now' || v === 'today') {
    date = new LiquidDate(Date.now(), locale, defaultTimezoneOffset)
  } else if (isNumber(v)) {
    date = new LiquidDate(v * 1000, locale, defaultTimezoneOffset)
  } else if (isString(v)) {
    if (/^\d+$/.test(v)) {
      date = new LiquidDate(+v * 1000, locale, defaultTimezoneOffset)
    } else if (opts.preserveTimezones && timezoneOffset === undefined) {
      date = LiquidDate.createDateFixedToTimezone(v, locale)
    } else {
      date = new LiquidDate(v, locale, defaultTimezoneOffset)
    }
  } else {
    date = new LiquidDate(v, locale, defaultTimezoneOffset)
  }
  return date.valid() ? date : undefined
}
