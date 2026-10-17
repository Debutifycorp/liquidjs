import type { GiftCardData } from '../store/types'

/**
 * The gift card both sample stores issue, so that a theme's `gift_card` template has a card to show: $45.00 left of $50.00, enabled, never expiring, in the shop's currency. Its `url` is the path the storefront serves it at, `/gift_cards/<store_id>/<gift_card_token>` (https://shopify.dev/docs/storefronts/themes/architecture/templates/gift-card-liquid; https://shopify.dev/docs/api/liquid/objects/gift_card shows the same path on Shopify's `checkout.shopify.com`), and its `code` and `qr_identifier` take the shapes that page's example shows. The mock.shop catalogue holds no gift card product, so the card names none (`product` and `variant` are nil). The code, token and identifier are made up; no store issued this card.
 */
export const sampleGiftCard: GiftCardData = {
  balance: 4500,
  initial_value: 5000,
  code: 'K4MX 9P2T H7QW 3ZRC',
  currency: 'USD',
  enabled: true,
  expired: false,
  expires_on: null,
  qr_identifier: 'shopify-giftcard-v1-8QH2VN5DCT4YJ6LM',
  url: '/gift_cards/70001/4f9d2a7c1b8e4603a5d7c9e1f0b23a68'
}
