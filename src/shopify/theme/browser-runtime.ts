const LOCALES_A = ['bg-BG', 'cs', 'da', 'de', 'el', 'es', 'fi', 'fr', 'hi', 'hr-HR', 'hu', 'id', 'it', 'ja', 'ko', 'lt-LT', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'ro-RO', 'ru', 'sk-SK', 'sl-SI', 'sv', 'th', 'tr', 'vi', 'zh-CN', 'zh-TW']
const LOCALES_B = ['cs', 'da', 'de', 'es', 'fi', 'fr', 'hi', 'it', 'ja', 'ko', 'ms', 'nb', 'nl', 'pl', 'pt-BR', 'pt-PT', 'sv', 'th', 'tr', 'zh-CN', 'zh-TW']

interface FeatureEntry {
  name: string
  version: string
  /** The folder under `shopifycloud/` when it is not the feature's name. */
  baseName?: string
  /** The script's name when it is not the folder's. */
  fileName?: string
  /** The locales the script comes in; the others get `en`. A feature without them has one script for every language. */
  locales?: string[]
  /** The selector of the elements that load the feature on their own. */
  autoLoad?: string
}

/**
 * The features Shopify's feature loader (`load_feature-<hash>.js`) registers when `Shopify.modules` is set, which is every entry the loader holds that is not a `shop-js` one. Read from the loader Shopify served with the parity store's pages (recordings of Horizon 4.3.0 and Dawn 16.0.0, `data-source-attribution="shopify.loadfeatures"`) and fetched from `https://cdn.shopify.com/shopifycloud/storefront/assets/storefront/load_feature-1bd60354.js` on 2026-10-18.
 */
const FEATURES: FeatureEntry[] = [
  ...['0.6', '0.7', '0.8', '1.2', '1.7', '1.9', '1.10', '1.11', '1.12'].map(version => ({ name: 'model-viewer', version, autoLoad: `model-viewer[data-shopify-feature="${version}"]` })),
  { name: 'model-viewer-ui', version: '1.0', locales: LOCALES_A },
  { name: 'shopify-xr', version: '1.0', baseName: 'shopify-xr-js', fileName: 'shopify-xr', locales: LOCALES_A },
  { name: 'video-ui', version: '1.0', baseName: 'shopify-plyr', locales: LOCALES_B },
  { name: 'video-ui', version: '1.1', baseName: 'shopify-plyr', locales: LOCALES_B },
  { name: 'video-ui', version: '2.0', baseName: 'plyr', fileName: 'shopify-plyr', locales: LOCALES_A },
  { name: 'consent-tracking-api', version: '0.1' },
  { name: 'consent-tracking-api', version: '0.2' }
]

/**
 * The inline script that gives a page `Shopify.modules`, `Shopify.loadFeatures` and `Shopify.autoloadFeatures`, which Shopify defines on every page (`content_for_header` queues both calls until its feature loader arrives). It reproduces that loader (`load_feature-<hash>.js`, https://cdn.shopify.com/shopifycloud/storefront/assets/storefront/load_feature-1bd60354.js, fetched 2026-10-18) so the model viewer, Shopify XR, the video player and the consent API start in a preview as on a store:
 *
 * - A registered `{ name, version }` loads `https://cdn.shopify.com/shopifycloud/<baseName or name>/v<version>/<fileName or baseName or name>[.<locale>].js` as a `<script type="module">` (`Shopify.modules` is set, so the loader takes its module scripts), where the locale is the one in `#shopify-features` (else `en`) when the feature is localized and supports it, else `en`. The loader builds the address from `Shopify.cdnHost`, which on a store is the store's own `/cdn` that proxies the same files; a preview's `cdnHost` is not a server, so the files are read from `cdn.shopify.com`, which serves them with `access-control-allow-origin: *`. The loader loads scripts only: a feature's stylesheet is linked by the theme.
 * - `onLoad(null)` runs when the feature's script loaded, `onLoad(error)` with `load error: <address>` when it did not, and the callback receives the list of errors, or `null`. A feature the loader does not register fails with "does not exist" in `onLoad` and the callback, at once; a name loaded at two versions fails with "has already been loaded at version".
 * - `model-viewer[data-shopify-feature="<version>"]` elements load their version by themselves, at `DOMContentLoaded` and whenever nodes are added, which is how Dawn's `<template>` model starts once the theme clones it.
 *
 * The `shop-js` features are left out: the shop's scripts have their own fields in `content_for_header` (`shopScripts`). Debutify's: shopify.dev documents the call and not the loader, whose behaviour is read from its source.
 */
export function featureLoaderScript (): string {
  return `(function(w){var S=w.Shopify=w.Shopify||{};S.modules=true;var R={};var D=w.document;var consumed={};var loaded=[];var failed=[];var autoload={};function noop(){}` +
    `${JSON.stringify(FEATURES)}.forEach(function(e){R[e.name+"@"+e.version]=e;if(e.autoLoad){(autoload[e.autoLoad]=autoload[e.autoLoad]||[]).push({name:e.name,version:e.version})}});` +
    'function locale(){var el=D.getElementById("shopify-features");if(el){try{return JSON.parse(el.textContent).locale||"en"}catch(x){}}return"en"}' +
    'function url(e){var base=e.baseName||e.name;var file=(e.fileName||base).replace(/\\.js$/,"");if(e.locales){var l=locale();file+="."+(e.locales.indexOf(l)>-1?l:"en")}' +
    'var v=e.version!==undefined?"/v"+e.version:"";return"https://cdn.shopify.com/shopifycloud/"+base+v+"/"+file+".js"}' +
    'function entry(f){var e=R[f.name+"@"+(f.version||"latest")];if(!e)throw new Error("The feature { name: \\""+f.name+"\\", version: \\""+f.version+"\\"} does not exist");' +
    'if(consumed[e.name]&&consumed[e.name]!==e.version)throw new Error(f.name+"@"+f.version+" has already been loaded at version "+consumed[e.name]);consumed[e.name]=e.version;return url(e)}' +
    'function tag(src,cb){var s=D.querySelector("script[src=\\""+src+"\\"]");function done(){s.removeEventListener("load",ok);s.removeEventListener("error",bad)}' +
    'function ok(){loaded.push(s);done();cb(null)}function bad(){failed.push(s);done();cb(new Error("load error: "+src))}' +
    'if(s&&loaded.indexOf(s)>-1){ok();return}if(s&&failed.indexOf(s)>-1){bad();return}if(s){s.addEventListener("load",ok);s.addEventListener("error",bad);return}' +
    's=D.createElement("script");s.setAttribute("type","module");s.setAttribute("defer","");s.src=src;s.addEventListener("load",ok);s.addEventListener("error",bad);D.head.appendChild(s)}' +
    'function load(features,callback){var errors=[];var pending=[];features.forEach(function(f){var onLoad=typeof f.onLoad==="function"?f.onLoad:noop;try{pending.push([entry(f),onLoad])}catch(error){onLoad(error);errors.push(error)}});' +
    'var left=pending.length;if(!left){callback(errors.length?errors:null);return}' +
    'pending.forEach(function(p){tag(p[0],function(error){if(error)errors.push(error);p[1](error||null);if(--left===0)callback(errors.length?errors:null)})})}' +
    'function loadFeatures(features,callback){if(!Array.isArray(features))throw new Error("Features should be an Array. Received: "+JSON.stringify(features));' +
    'features.forEach(function(f){if(!(f&&typeof f.name==="string"&&typeof f.version==="string"))throw new Error("Features should be defined as `{ name: \\"name\\", version: \\"version\\" }`. Received: "+JSON.stringify(f))});load(features,typeof callback==="function"?callback:noop)}' +
    'function autoloadFeatures(callback){var found=[];Object.keys(autoload).forEach(function(selector){if(D.querySelector(selector)){found=found.concat(autoload[selector]);delete autoload[selector]}});load(found,typeof callback==="function"?callback:noop)}' +
    'S.loadFeatures=loadFeatures;S.autoloadFeatures=autoloadFeatures;' +
    'function auto(){autoloadFeatures(function(errors){if(errors)throw errors[0]})}' +
    'function ready(){auto();if(w.MutationObserver&&D.body)new w.MutationObserver(function(list){for(var i=0;i<list.length;i++){if(list[i].addedNodes.length){auto();break}}}).observe(D.body,{childList:true,subtree:true})}' +
    'if(D.readyState!=="loading")ready();else D.addEventListener("DOMContentLoaded",ready)})(window);'
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
