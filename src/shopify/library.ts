import { PAYMENT_ICONS } from '../shopify-library'
import { own } from './util/own'

/** `payment_type_svg_tag`'s icon: Shopify's own file for a type of its set, byte for byte as Shopify prints it, and for any other type (an unknown name, the empty string, a capitalised `Visa`) the `generic` icon with nothing written for the type, which is what the parity store printed for each (scenarios `page-home`, `ajax-cart-sections` and `probe-payment-icons`). The set is every file of activemerchant/payment_icons at the pinned commit; the type is looked up exactly as given. https://shopify.dev/docs/api/liquid/filters/payment_type_svg_tag */
export function shopifyPaymentIcon (type: string): string {
  return own(PAYMENT_ICONS, type) ?? PAYMENT_ICONS.generic
}
