/**
 * The script a sandboxed storefront page runs first. Under `Content-Security-Policy: sandbox` the page has an opaque origin: storage and cookies throw or vanish, and its requests carry no cookies. The script gives the page in-memory `localStorage`, `sessionStorage` and `document.cookie`; adds the base path and the locale prefix (from `Shopify.routes.root`, once the header sets it) to root-relative addresses given to `fetch`, `XMLHttpRequest`, links and forms that lack them; and sends the page's own path in `X-Storefront-Page` on the store's own requests, which the storefront reads as the context of bundled sections, and names it as `storefront_page` in the address of a form posted to the store (a sandboxed document sends no `Referer`, so this is how the storefront knows where to send the visitor back to). Plain ES5, so it runs before any theme code on every browser the theme supports.
 *
 * No shopify.dev page describes a sandboxed preview: this is Debutify's own, from the storefront spec's "Sandboxed pages". What it relies on is the platform's: a document's origin under `sandbox` is opaque (https://html.spec.whatwg.org/multipage/browsers.html#sandboxed-origin-browsing-context-flag), so `location.origin` reads `"null"` while `location.protocol` and `location.host` still name the host that served the page, which is what "the store's own host" means here; and the page's own path is the one in `location`, read when a request is made, since a theme moves the page's address with `history.replaceState` when a variant is picked.
 *
 * Limits, on purpose: the in-memory storage is an object with the `Storage` methods, so `localStorage.key = value` as a property is not storage; a cookie is removed by `max-age=0` (or negative) or an `expires` in 1970, and no other expiry, `path` or `domain` is read; links are fixed when clicked (`click`, not `auxclick` or a hover), and a form's `action` when it is submitted (a `formaction` on a button is not, and neither does it name the page); an address given as an absolute URL, or a relative one without a leading slash, is the page's own to get right. The script runs once per window: a second run (the script included twice, or inside a fragment that a library inserts and runs) does nothing, so what the page stored is kept and nothing is wrapped twice.
 *
 * The base path is the only value written into the script. It is a JSON string with `<`, U+2028 and U+2029 escaped, so no base path can close the `<script>` element or break the string.
 */
export function storefrontClientScript (options: { basePath: string }): string {
  const base = JSON.stringify(options.basePath.replace(/\/$/, '')).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `(function () {
  try { if (window.__storefrontClient) return; Object.defineProperty(window, '__storefrontClient', { value: true }); } catch (e) {}
  var base = ${base};
  var own = Object.prototype.hasOwnProperty;
  function memory () {
    var keys = [], values = Object.create(null);
    return {
      get length () { return keys.length; },
      key: function (i) { i = Number(i); return i >= 0 && i < keys.length ? keys[i] : null; },
      getItem: function (k) { k = String(k); return own.call(values, k) ? values[k] : null; },
      setItem: function (k, v) { k = String(k); if (!own.call(values, k)) keys.push(k); values[k] = String(v); },
      removeItem: function (k) { k = String(k); if (own.call(values, k)) { delete values[k]; keys.splice(keys.indexOf(k), 1); } },
      clear: function () { keys = []; values = Object.create(null); }
    };
  }
  try { Object.defineProperty(window, 'localStorage', { configurable: true, value: memory() }); } catch (e) {}
  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memory() }); } catch (e) {}
  var jar = [], cookies = Object.create(null);
  try {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: function () { return jar.map(function (k) { return k + '=' + cookies[k]; }).join('; '); },
      set: function (text) {
        text = String(text);
        var pair = text.split(';')[0], at = pair.indexOf('=');
        if (at < 1) return;
        var name = pair.slice(0, at).trim(), value = pair.slice(at + 1).trim();
        var gone = /;\\s*max-age=(0|-)/i.test(text) || /;\\s*expires=[^;]*1970/i.test(text);
        var known = own.call(cookies, name);
        if (gone) { if (known) { delete cookies[name]; jar.splice(jar.indexOf(name), 1); } return; }
        if (!known) jar.push(name);
        cookies[name] = value;
      }
    });
  } catch (e) {}
  function prefix () {
    var root = window.Shopify && window.Shopify.routes && window.Shopify.routes.root;
    return (typeof root === 'string' && root.charAt(0) === '/' ? root : base + '/').replace(/\\/$/, '');
  }
  function local (url) { return typeof url === 'string' && url.charAt(0) === '/' && url.charAt(1) !== '/' && url.charAt(1) !== '\\\\' && !/[\\u0000-\\u001f\\u007f]/.test(url); }
  function fix (url) {
    if (!local(url)) return url;
    var p = prefix();
    if (!p) return url;
    var under = function (q) { return q && (url === q || url.indexOf(q + '/') === 0 || url.indexOf(q + '?') === 0 || url.indexOf(q + '#') === 0); };
    if (under(p) || under(base)) return url;
    return p + url;
  }
  function page () { return location.pathname + location.search; }
  var host = location.protocol + '//' + location.host;
  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var self = this, args = arguments;
      var isRequest = typeof Request === 'function' && input instanceof Request;
      if (!(typeof input === 'string' ? local(input) : isRequest && input.url.indexOf(host + '/') === 0)) return nativeFetch.apply(self, args);
      var options = {};
      for (var name in init) options[name] = init[name];
      var headers = new Headers(init && init.headers ? init.headers : (isRequest ? input.headers : undefined));
      headers.set('X-Storefront-Page', page());
      options.headers = headers;
      if (!isRequest) return nativeFetch.call(self, fix(input), options);
      if (input.bodyUsed) return nativeFetch.apply(self, args);
      var address;
      try { var u = new URL(input.url); address = host + fix(u.pathname + u.search + u.hash); } catch (e) { return nativeFetch.apply(self, args); }
      var bytes = input.body ? input.clone().arrayBuffer() : Promise.resolve(null);
      return bytes.then(function (body) {
        var request;
        try {
          var spec = { method: input.method, headers: input.headers, mode: input.mode, credentials: input.credentials, cache: input.cache, redirect: input.redirect, referrer: input.referrer, referrerPolicy: input.referrerPolicy, integrity: input.integrity, keepalive: input.keepalive, signal: input.signal };
          if (body) spec.body = body;
          request = new Request(address, spec);
        } catch (e) {
          return nativeFetch.apply(self, args);
        }
        return nativeFetch.call(self, request, options);
      });
    };
  }
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (typeof url === 'string') args[1] = fix(url);
    var result = open.apply(this, args);
    if (local(url)) { try { this.setRequestHeader('X-Storefront-Page', page()); } catch (e) {} }
    return result;
  };
  document.addEventListener('click', function (event) {
    var a = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (a) { var h = a.getAttribute('href'), f = fix(h); if (f !== h) a.setAttribute('href', f); }
  }, true);
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || !form.getAttribute) return;
    var h = form.getAttribute('action') || '', f = fix(h);
    // a post from this document carries no Referer, so the page is named in the address; the store's own addresses only, the old name replaced, and before any fragment
    if (h && local(f) && String(form.getAttribute('method') || '').toLowerCase() === 'post') {
      var hash = f.indexOf('#'), tail = hash < 0 ? '' : f.slice(hash), head = hash < 0 ? f : f.slice(0, hash), cut = head.indexOf('?');
      var query = cut < 0 ? '' : head.slice(cut + 1).split('&').filter(function (part) { return part !== '' && part.indexOf('storefront_page=') !== 0; }).join('&');
      f = (cut < 0 ? head : head.slice(0, cut)) + '?' + (query ? query + '&' : '') + 'storefront_page=' + encodeURIComponent(page()) + tail;
    }
    if (h && f !== h) form.setAttribute('action', f);
  }, true);
})();`
}
