# Notice

`@debutify/liquidjs` is a fork of [LiquidJS](https://github.com/harttle/liquidjs) by Harttle and its contributors, used under the MIT licence in `LICENSE`.

Debutify maintains this fork to render Shopify themes outside Shopify. It adds opt-in engine options (`numberSemantics`, `rawTags`, `inlineErrors`, `topLevelSize`, `bugCompatibleWhitespaceTrimming`) and, under `@debutify/liquidjs/shopify`, Shopify's platform tags, filters and theme runtime. With the default options it behaves exactly like the LiquidJS release named in `package.json` → `upstreamLiquidjs`.

One behaviour differs from that release without an opt-in: the `slice` filter charges `memoryLimit` for the length of the array or string it returns, not for the length it was asked for, so a `slice` far past the end of a short array no longer hits a low `memoryLimit`. It only matters once `memoryLimit` is set, which is unlimited by default.

## Shopify's payment icons

`dist/shopify-library.js` holds the payment icons of [activemerchant/payment_icons](https://github.com/activemerchant/payment_icons) at commit `fc8c830a5ca576553df88bf364fd449ea7b4f069`, the files Shopify's `payment_type_svg_tag` prints, under that repository's MIT licence (its file `MIT-LICENSE`, copied here as it is):

```text
Copyright 2015 Shopify Inc

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

The trademarks and trade names the icons show belong to their owners.
