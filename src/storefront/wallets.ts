/** Where the wallets module sits below `cdn/shopifycloud/`, as `checkoutHeader` links it. */
const WALLETS_FOLDER = 'portable-wallets/latest'

/** "Buy it now" in the languages a store is most often published in; any other language shows the English words. */
const BUY_IT_NOW: Record<string, string> = {
  en: 'Buy it now',
  fr: 'Acheter maintenant',
  es: 'Comprar ahora',
  de: 'Jetzt kaufen',
  it: 'Acquista ora',
  pt: 'Comprar agora',
  nl: 'Nu kopen'
}

/**
 * The module that fills Shopify's `<shopify-accelerated-checkout>` (product pages) and `<shopify-accelerated-checkout-cart>` (cart) elements. Shopify's own is its wallets library; the storefront has no payment provider, so this one is Debutify's and shows what Shopify shows when no wallet is offered, https://shopify.dev/docs/storefronts/themes/pricing-payments/accelerated-checkout: the markup of the buttons sits in a closed shadow root, and the theme shapes it with the `--shopify-accelerated-checkout-*` custom properties. The element drops its skeleton, shows one button and, pressed, goes to the checkout address (`/checkouts/cn/…`, the notice page); it never adds to the cart and never takes a payment, as Shopify's component opens a checkout of its own. It defines `Shopify.PaymentButton.init()` (every element is upgraded as it is defined or inserted, so `init()` only finds the ones a theme injected before the module ran) and keeps `showBuyerConsent` and `hideBuyerConsent` working for a subscription.
 */
const SCRIPT = String.raw`(function () {
  var script = import.meta.url;
  var base = script.slice(0, script.indexOf('/cdn/shopifycloud/'));
  var path = base.replace(/^[a-z]+:\/\/[^/]*/i, '');
  var label = __LABEL__;
  var CSS = ':host{display:block}button{box-sizing:border-box;display:block;width:100%;min-block-size:var(--shopify-accelerated-checkout-button-block-size,44px);padding:0 16px;border:0;border-radius:var(--shopify-accelerated-checkout-button-border-radius,0px);box-shadow:var(--shopify-accelerated-checkout-button-box-shadow,none);background:#1a1a1a;color:#fff;font:inherit;font-weight:600;cursor:pointer}button:hover{background:#000}button:focus-visible{outline:2px solid currentColor;outline-offset:2px;box-shadow:0 0 0 2px #fff}';
  function consent(element) {
    var form = element.closest('form') || document.querySelector('form[action*="/cart/add"]');
    var plan = form && form.querySelector('[name="selling_plan"]');
    var checked = plan && (plan.type === 'radio' || plan.type === 'checkbox') ? form.querySelector('[name="selling_plan"]:checked') : plan;
    var Button = window.Shopify && window.Shopify.PaymentButton;
    if (!Button) return;
    if (checked && checked.value) {
      if (Button.showBuyerConsent) Button.showBuyerConsent(function (event) { event.preventDefault(); window.location.href = path + '/policies/subscription-policy'; });
    } else if (Button.hideBuyerConsent) {
      Button.hideBuyerConsent();
    }
  }
  function define(name) {
    if (customElements.get(name)) return;
    customElements.define(name, class extends HTMLElement {
      connectedCallback() {
        if (this.__upgraded) return;
        this.__upgraded = true;
        var root = this.attachShadow({ mode: 'closed' });
        var style = document.createElement('style');
        style.textContent = CSS;
        var button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        var element = this;
        button.addEventListener('click', function () {
          var locale = (element.getAttribute('buyer-locale') || 'en') + '-' + (element.getAttribute('buyer-country') || 'US').toLowerCase();
          window.location.href = path + '/checkouts/cn/buy-it-now/' + locale;
        });
        root.append(style, button);
        this.querySelectorAll('.shopify-payment-button__skeleton, .wallet-cart-button__skeleton').forEach(function (skeleton) { skeleton.remove(); });
        var form = this.closest('form');
        if (form) form.addEventListener('change', function () { consent(element); });
        consent(this);
      }
    });
  }
  define('shopify-accelerated-checkout');
  define('shopify-accelerated-checkout-cart');
  window.Shopify = window.Shopify || {};
  window.Shopify.PaymentButton = window.Shopify.PaymentButton || {};
  window.Shopify.PaymentButton.init = function () {
    document.querySelectorAll('shopify-accelerated-checkout, shopify-accelerated-checkout-cart').forEach(function (element) { customElements.upgrade(element); });
  };
  window.Shopify.PaymentButton.init();
})();
`

const STYLES = 'shopify-accelerated-checkout,shopify-accelerated-checkout-cart{display:block}.shopify-payment-button__skeleton{block-size:var(--shopify-accelerated-checkout-button-block-size,44px);border-radius:var(--shopify-accelerated-checkout-button-border-radius,0);background:var(--shopify-accelerated-checkout-skeleton-background-color,#dedede);animation:shopify-accelerated-checkout-skeleton var(--shopify-accelerated-checkout-skeleton-animation-duration,4s) var(--shopify-accelerated-checkout-skeleton-animation-timing-function,ease) infinite}@keyframes shopify-accelerated-checkout-skeleton{0%,100%{opacity:var(--shopify-accelerated-checkout-skeleton-animation-opacity-start,1)}50%{opacity:var(--shopify-accelerated-checkout-skeleton-animation-opacity-end,.5)}}\n'

const FILE = new RegExp(`^${WALLETS_FOLDER}/(?:portable-wallets\\.([a-z]{2,3}(?:-[A-Za-z]{2,4})?)\\.js|(accelerated-checkout\\.css))$`)

/** The answer for `GET <base path>/cdn/shopifycloud/portable-wallets/latest/<file>`, the wallets module for a language (`portable-wallets.fr.js`) or the stylesheet (`accelerated-checkout.css`), or undefined for any other path. */
export function walletsResponse (path: string): Response | undefined {
  const match = FILE.exec(path)
  if (!match) return undefined
  const [, language, css] = match
  const body = css ? STYLES : SCRIPT.replace('__LABEL__', JSON.stringify(BUY_IT_NOW[language.slice(0, 2).toLowerCase()] ?? BUY_IT_NOW.en))
  return new Response(body, { headers: { 'content-type': css ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=604800', 'x-content-type-options': 'nosniff' } })
}
