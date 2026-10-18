/**
 * The versions of the features Shopify's feature loader (`load_feature-<hash>.js`, the script `Shopify.loadFeatures` queues for on every page) registers, by name: a `loadFeatures` call for one of them goes to its script on Shopify's CDN, and for anything else answers "does not exist". Read from the loader Shopify served with the parity store's pages (recordings of Horizon 4.3.0 and Dawn 16.0.0, `data-source-attribution="shopify.loadfeatures"`).
 */
const FEATURES: Record<string, string[]> = {
  'model-viewer': ['0.6', '0.7', '0.8', '1.2', '1.7', '1.9', '1.10', '1.11', '1.12'],
  'model-viewer-ui': ['1.0'],
  'shopify-xr': ['1.0'],
  'video-ui': ['1.0', '1.1', '2.0'],
  'consent-tracking-api': ['0.1', '0.2']
}

/**
 * The inline script that gives a page `Shopify.modules`, `Shopify.loadFeatures` and `Shopify.autoloadFeatures`, which Shopify defines on every page (`content_for_header` queues both calls until its feature loader arrives). The functions check their arguments and answer as the loader does (https://shopify.dev/docs/api/customer-privacy loads `consent-tracking-api` through `Shopify.loadFeatures([{ name, version }], callback)`): a feature that is not one of the loader's registered ones fails with "does not exist", and a registered one fails to load, since the scripts on Shopify's CDN (the model viewer, Shopify XR, the video player, the consent API) are not part of a preview and its content security policy admits no other script. Each feature's `onLoad` receives the error and the callback the list of errors, after the current task as a script load is, so a theme that returns on an error (every theme here does: `if (errors) return`) goes on without a model viewer, as it does on a store whose CDN is out of reach. Debutify's: shopify.dev documents the call and not the loader's answers, which are read from the loader's source.
 */
export function featureLoaderScript (): string {
  return `(function(w){var S=w.Shopify=w.Shopify||{};S.modules=true;var F=${JSON.stringify(FEATURES)};function noop(){}function later(fn){setTimeout(fn,0)}` +
    'function loadFeatures(features,callback){var done=typeof callback==="function"?callback:noop;' +
    'if(!Array.isArray(features))throw new Error("Features should be an Array. Received: "+JSON.stringify(features));' +
    'features.forEach(function(f){if(!(f&&typeof f.name==="string"&&typeof f.version==="string"))throw new Error("Features should be defined as `{ name: \\"name\\", version: \\"version\\" }`. Received: "+JSON.stringify(f))});' +
    'later(function(){var errors=[];features.forEach(function(f){var known=Object.prototype.hasOwnProperty.call(F,f.name)&&F[f.name].indexOf(f.version)>-1;' +
    'var error=new Error(known?"load error: the feature { name: \\""+f.name+"\\", version: \\""+f.version+"\\"} is not available in the preview":"The feature { name: \\""+f.name+"\\", version: \\""+f.version+"\\"} does not exist");' +
    'errors.push(error);(typeof f.onLoad==="function"?f.onLoad:noop)(error)});done(errors.length?errors:null)})}' +
    'function autoloadFeatures(callback){var done=typeof callback==="function"?callback:noop;later(function(){done(null)})}' +
    'S.loadFeatures=loadFeatures;S.autoloadFeatures=autoloadFeatures})(window);'
}

/** The shadow root's styles of the account stand-in: the host sits inline and holds the link at the size Shopify's avatar button has (`--shopify-account-avatar-size`, else 1.57 times the avatar size clamped between 24 and 32 pixels), in the page's text colour. */
const ACCOUNT_STYLES = ':host{display:inline-block;vertical-align:middle;contain:layout}' +
  '.account-button{display:flex;justify-content:center;align-items:center;min-width:var(--shopify-account-avatar-size,calc(clamp(24px,var(--shopify-account-signed-in-avatar-size,28px),32px)*1.57));min-height:var(--shopify-account-avatar-size,calc(clamp(24px,var(--shopify-account-signed-in-avatar-size,28px),32px)*1.57));color:currentColor;text-decoration:none;cursor:pointer;line-height:inherit;visibility:inherit;direction:inherit}' +
  '.account-button__icon{width:15px;height:17px}.account-button__icon-path{stroke:currentColor;stroke-linejoin:round;stroke-width:1.5}'

const ACCOUNT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 17" fill="none" class="account-button__icon"><path class="account-button__icon-path" d="M10.375 3.813a3.063 3.063 0 1 1-6.125 0 3.063 3.063 0 0 1 6.125 0ZM7.313 9.5c-3.667 0-6.24 2.691-6.563 6.125h13.125C13.552 12.191 10.979 9.5 7.312 9.5Z"/></svg>'

/**
 * The inline script that defines `<shopify-store>` (inert) and `<shopify-account>`, which Shopify's `account.js` defines on every page whose theme prints them (https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component). Shopify's element renders, in an open shadow root, a button (`part="signed-out-avatar"`, `aria-haspopup="dialog"`) around the theme's `slot="signed-out-avatar"` children, or the shop's icon when it has none, and a dialog (`part="dialog"`) that signed-out shoppers sign in with; a shop with legacy customer accounts gets a link to the sign-in page in its place (`a.account-button.legacy`, same part). It has `showModal()` and `close()` and fires `open` and `close` on itself (not bubbling, composed), which Horizon's `header.js` listens for.
 *
 * A preview takes no one's sign-in, so the stand-in is the link: the same shadow structure, with the link on `loginUrl` (`routes.account_login_url`, the address the storefront answers with the account notice). `showModal()` fires `open` and goes there; `close()` fires nothing, as nothing is open. Debutify's: `account.js` is not served to a preview, whose content security policy admits no other script, and its dialog needs Shopify's customer account services. The label is "Account", the text Shopify's component takes from the shop's translations (`account_menu.aria_labels.account`).
 */
export function accountElementsScript (loginUrl: string): string {
  return '(function(){if(!window.customElements)return;' +
    'if(!customElements.get("shopify-store"))customElements.define("shopify-store",class extends HTMLElement{});' +
    `var login=${JSON.stringify(loginUrl).replace(/</g, '\\u003c')};` +
    'if(!customElements.get("shopify-account"))customElements.define("shopify-account",class extends HTMLElement{' +
    'constructor(){super();this.attachShadow({mode:"open"})}' +
    'connectedCallback(){if(this.shadowRoot.firstChild)return;' +
    `this.shadowRoot.innerHTML=${JSON.stringify(`<style>${ACCOUNT_STYLES}</style><div id="shopify-element-wrapper"><div class="wrapper"><a href="" class="account-button legacy" part="signed-out-avatar" aria-label="Account"><slot name="signed-out-avatar">${ACCOUNT_ICON}</slot></a></div></div>`).replace(/</g, '\\u003c')};` +
    'this.shadowRoot.querySelector("a").href=login}' +
    'showModal(){this.dispatchEvent(new CustomEvent("open",{bubbles:false,composed:true}));window.location.assign(login);return Promise.resolve(this)}' +
    'close(){return this}})})();'
}
