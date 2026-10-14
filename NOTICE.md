# Notice

`@debutify/liquidjs` is a fork of [LiquidJS](https://github.com/harttle/liquidjs) by Harttle and its contributors, used under the MIT licence in `LICENSE`.

Debutify maintains this fork to render Shopify themes outside Shopify. It adds opt-in engine options (`numberSemantics`, `rawTags`, `inlineErrors`, `topLevelSize`, `bugCompatibleWhitespaceTrimming`) and, under `@debutify/liquidjs/shopify`, Shopify's platform tags, filters and theme runtime. With the default options it behaves exactly like the LiquidJS release named in `package.json` → `upstreamLiquidjs`.

One behaviour differs from that release without an opt-in: the `slice` filter charges `memoryLimit` for the length of the array or string it returns, not for the length it was asked for, so a `slice` far past the end of a short array no longer hits a low `memoryLimit`. It only matters once `memoryLimit` is set, which is unlimited by default.
