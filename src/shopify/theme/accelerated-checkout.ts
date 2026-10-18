import { createHash } from 'crypto'
import { escapeHtml } from '../util/html'

/** The folder of Shopify's `cdn/shopifycloud` the wallets module and its stylesheet are served from. */
export const WALLETS_FOLDER = 'portable-wallets/latest'

/** The flags Shopify's dynamic checkout prints on the parity store's product pages (`enabled-flags`). They name features of Shopify's own wallets module, so they are copied as recorded. */
const ENABLED_FLAGS = ['1172c16a', 'a1d1f9a1', 'f5afabb3', '370070f3', 'b311f899']

/** What the `fallback` attribute holds on the parity store: the unbranded "Buy it now" button the component shows when no wallet is offered. */
const FALLBACK = { supports_subs: true, supports_def_opts: true, name: 'buy_it_now', wallet_params: {} }

/** The shop's storefront access token and shop id as the markup prints them. Shopify prints the shop's own; the store data has neither, so a store gets a stable pair made from its domain, of the same shapes (32 hex digits, 11 digits). */
export function shopIdentity (domain: string): { token: string, shopId: number } {
  const token = createHash('md5').update(domain, 'utf8').digest('hex')
  return { token, shopId: 10_000_000_000 + parseInt(token.slice(0, 10), 16) % 90_000_000_000 }
}

export interface CheckoutButtonInput {
  variants: Array<{ id: unknown, requiresShipping: boolean }>
  country: string
  locale: string
  currency: string
  domain: string
  /** The product is sold with a selling plan, so the buyer consent text follows the component. */
  subscription: boolean
}

const json = (value: unknown) => escapeHtml(JSON.stringify(value))

/**
 * The dynamic checkout button of a product form, as Shopify prints it for `{{ form | payment_button }}` (the parity store's product pages of Horizon 4.3.0 and Dawn 16.0.0, recorded identically): a `<div data-shopify="payment-button">` around a `<shopify-accelerated-checkout>` element whose attributes carry the buyer's country, language and currency, one `{id, requiresShipping}` for each variant and the shop's token and id, and a skeleton the element's script replaces once it loads. For a product sold with a selling plan, a hidden `<small id="shopify-buyer-consent">` with the consent text follows the element (English only: no other language is recorded).
 */
export function paymentButtonHtml (input: CheckoutButtonInput): string {
  const { token, shopId } = shopIdentity(input.domain)
  const variants = input.variants.map(variant => ({ id: variant.id, requiresShipping: variant.requiresShipping }))
  const consent = input.subscription
    ? ' <small id="shopify-buyer-consent" class="hidden" aria-hidden="true" data-consent-type="subscription"> This item is a deferred, subscription, or recurring purchase. By continuing, I agree to the <span id="shopify-subscription-policy-button">cancellation policy</span> and authorize you to charge my payment method at the prices, frequency and dates listed on this page until my order is fulfilled or I cancel, if permitted. </small>'
    : ''
  return '<div data-shopify="payment-button" class="shopify-payment-button"> ' +
    `<shopify-accelerated-checkout recommended="null" fallback="${json(FALLBACK)}" access-token="${token}" buyer-country="${escapeHtml(input.country)}" buyer-locale="${escapeHtml(input.locale)}" buyer-currency="${escapeHtml(input.currency)}" variant-params="${json(variants)}" shop-id="${shopId}" enabled-flags="${json(ENABLED_FLAGS)}" disable-compat > ` +
    '<div class="shopify-payment-button__button" role="button" disabled aria-hidden="true" style="background-color: transparent; border: none"> <div class="shopify-payment-button__skeleton">&nbsp;</div> </div> ' +
    `</shopify-accelerated-checkout>${consent} </div>`
}

/**
 * The scripts and styles Shopify adds to `content_for_header` for dynamic checkout, in the order and with the text of the parity store's pages (Horizon 4.3.0 and Dawn 16.0.0). Every page has `Shopify.PaymentButton` (`dynamic.init`, whose `init()` loads the wallets module) and the buyer consent helpers; a page with a button adds the cleanup helper, the module itself with its `nomodule` twin and the stylesheet, and any other page the observer that calls `init()` as soon as a `shopify-accelerated-checkout` or `shopify-accelerated-checkout-cart` element appears (the cart, or a product injected later). `walletsUrl` is where the module is served: Shopify's own `cdn/shopifycloud/portable-wallets/latest/portable-wallets.<language>.js` is on its CDN, so the storefront serves its own file at the same path under its base path.
 */
export function checkoutHeader (page: { button: boolean, walletsUrl: (file: string) => string, language: string }): string {
  const module = page.walletsUrl(`portable-wallets.${page.language}.js`)
  let header = `<script data-source-attribution="shopify.dynamic_checkout.dynamic.init">var Shopify=Shopify||{};Shopify.PaymentButton=Shopify.PaymentButton||{isStorefrontPortableWallets:!0,init:function(){window.Shopify.PaymentButton.init=function(){};var t=document.createElement("script");t.src=${JSON.stringify(module)},t.type="module",document.head.appendChild(t)}};\n</script>\n` +
    '<script data-source-attribution="shopify.dynamic_checkout.buyer_consent">\n  function portableWalletsHideBuyerConsent(e){var t=document.getElementById("shopify-buyer-consent"),n=document.getElementById("shopify-subscription-policy-button");t&&n&&(t.classList.add("hidden"),t.setAttribute("aria-hidden","true"),n.removeEventListener("click",e))}function portableWalletsShowBuyerConsent(e){var t=document.getElementById("shopify-buyer-consent"),n=document.getElementById("shopify-subscription-policy-button");t&&n&&(t.classList.remove("hidden"),t.removeAttribute("aria-hidden"),n.addEventListener("click",e))}window.Shopify?.PaymentButton&&(window.Shopify.PaymentButton.hideBuyerConsent=portableWalletsHideBuyerConsent,window.Shopify.PaymentButton.showBuyerConsent=portableWalletsShowBuyerConsent);\n</script>\n'
  if (!page.button) {
    return header + '<script data-source-attribution="shopify.dynamic_checkout.cart.bootstrap">document.addEventListener("DOMContentLoaded",(function(){function t(){return document.querySelector("shopify-accelerated-checkout-cart, shopify-accelerated-checkout")}if(t())Shopify.PaymentButton.init();else{new MutationObserver((function(e,n){t()&&(Shopify.PaymentButton.init(),n.disconnect())})).observe(document.body,{childList:!0,subtree:!0})}}));\n</script>\n'
  }
  header += '<script>\n  function portableWalletsCleanup(e){e&&e.src&&console.error("Failed to load portable wallets script "+e.src);var t=document.querySelectorAll("shopify-accelerated-checkout .shopify-payment-button__skeleton, shopify-accelerated-checkout-cart .wallet-cart-button__skeleton"),e=document.getElementById("shopify-buyer-consent");for(let e=0;e<t.length;e++)t[e].remove();e&&e.remove()}function portableWalletsNotLoadedAsModule(e){e instanceof ErrorEvent&&"string"==typeof e.message&&e.message.includes("import.meta")&&"string"==typeof e.filename&&e.filename.includes("portable-wallets")&&(window.removeEventListener("error",portableWalletsNotLoadedAsModule),window.Shopify.PaymentButton.failedToLoad=e,"loading"===document.readyState?document.addEventListener("DOMContentLoaded",window.Shopify.PaymentButton.init):window.Shopify.PaymentButton.init())}window.addEventListener("error",portableWalletsNotLoadedAsModule);\n</script>\n\n' +
    `<script type="module" src="${escapeHtml(module)}" onError="portableWalletsCleanup(this)" crossorigin="anonymous"></script>\n` +
    '<script nomodule>\n  document.addEventListener("DOMContentLoaded", portableWalletsCleanup);\n</script>\n\n'
  return header + `<link id="shopify-accelerated-checkout-styles" rel="stylesheet" media="screen" href="${escapeHtml(page.walletsUrl('accelerated-checkout.css'))}" crossorigin="anonymous">\n` +
    '<style id="shopify-accelerated-checkout-cart">\n        #shopify-buyer-consent {\n  margin-top: 1em;\n  display: inline-block;\n  width: 100%;\n}\n\n#shopify-buyer-consent.hidden {\n  display: none;\n}\n\n#shopify-subscription-policy-button {\n  background: none;\n  border: none;\n  padding: 0;\n  text-decoration: underline;\n  font-size: inherit;\n  cursor: pointer;\n}\n\n#shopify-subscription-policy-button::before {\n  box-shadow: none;\n}\n\n      </style>\n'
}
