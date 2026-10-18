# [1.5.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v1.4.0...debutify-v1.5.0) (2026-10-18)


### Bug Fixes

* **drop:** a value assigned blank equals blank, so a theme's blank default runs its fallback and the product JSON-LD prints aggregateRating ([0b19022](https://github.com/Debutifycorp/liquidjs/commit/0b19022fe8b6f89a095d5f71dc327e97c23c1d9b))
* **shopify:** collections.all counts unlisted products in all_tags, all_types and all_vendors; vendor and type collections keep store order ([bd6f358](https://github.com/Debutifycorp/liquidjs/commit/bd6f358ea61dc2bed4e201570430c90d09293130))
* **shopify:** content_for_header writes the MCP, shop-js feature and Shop sign-in eligibility globals in their own scripts, as Shopify does ([f3de11d](https://github.com/Debutifycorp/liquidjs/commit/f3de11d10b3189946f06126b8c6d7fd878ae43b4))
* **shopify:** image_url crops from the centre when it has a width and a height, as the parity store prints a video or model preview at 550 by 550 ([42fe1f8](https://github.com/Debutifycorp/liquidjs/commit/42fe1f892297be17936d62b4fad7f9227617f54a))
* **shopify:** inline_asset_content prints Shopify's Asset not found comment for a missing asset ([5e52c54](https://github.com/Debutifycorp/liquidjs/commit/5e52c549aef80a6ec6896679cd6ec395feddc923))
* **shopify:** json prints a media's preview_image as its address, as the parity store does ([dd37dbe](https://github.com/Debutifycorp/liquidjs/commit/dd37dbe256a08ac43151630d15b486165b732461))
* **shopify:** json prints the aspect ratio of a media's preview picture to three places, as the Ajax answer does ([6d44c05](https://github.com/Debutifycorp/liquidjs/commit/6d44c05ef68c5df2f63451b39e53a0a88d91b6d5))
* **shopify:** json refuses the metafields object, a rating, a unit price measurement and the sources of a video or model ([7171f30](https://github.com/Debutifycorp/liquidjs/commit/7171f3060c404f9697a2c0c1ea3e6feba4d24938))
* **shopify:** media json lists a video's files with the HLS playlist last, as the Ajax answer does ([8bd4620](https://github.com/Debutifycorp/liquidjs/commit/8bd4620ae78e528b60c700c082f97cea423557e5))
* **shopify:** media_tag of a 3D model prints its model-viewer, and a video, external video or model prints in product.media | json ([f3fcec0](https://github.com/Debutifycorp/liquidjs/commit/f3fcec0207a9d202953e12727f494d6ce86f3e1f))
* **shopify:** media_tag of an image is an img with its attributes, alt and the legacy size file, and image_size master adds no suffix ([b730276](https://github.com/Debutifycorp/liquidjs/commit/b730276fabd0d7b38814c9836abd9ad97315c2a5))
* **shopify:** page_title escapes only the quotes around search.terms, and the public entry lists arrangeNested, oembedJson and quantityRuleOf ([79cef3b](https://github.com/Debutifycorp/liquidjs/commit/79cef3bac4267d16cf6769707c2fb61cdd3ad6fe))
* **shopify:** search matches pages and articles by id (a product id finds none) and its filter links leave resources[...] out ([53356ee](https://github.com/Debutifycorp/liquidjs/commit/53356eee3d87c145ccc9fb77d142fe4b74564373))
* **shopify:** standard_event_data prints an emptied cart with its zero totals and a discount code as applicable before code, as Shopify does ([bec95f2](https://github.com/Debutifycorp/liquidjs/commit/bec95f26ee389a2610256b44016bd996dd384e58))
* **shopify:** the parity store's unlisted products each have their own image ids, as the store gives them ([118c10a](https://github.com/Debutifycorp/liquidjs/commit/118c10aa9e3545f375261afecf6591edf91cc567))
* **shopify:** video_tag writes a video's files and not its playlist, a named preload and the fallback's alt, and Liquid lists the playlist first ([7458c98](https://github.com/Debutifycorp/liquidjs/commit/7458c98b42bfa415ac212ba2cde032a93f8ff487))
* **storefront:** a parent_id that names a cart line but no request item gets the parity store's answer ([ddfb4c0](https://github.com/Debutifycorp/liquidjs/commit/ddfb4c0c6c05d17348674abad86fc0e4db51a1ce))
* **storefront:** the recommendations answer reads the product it is asked for ([6b20bd6](https://github.com/Debutifycorp/liquidjs/commit/6b20bd6dc40d4886abb8640311f7eb3938fd4ac9))
* **tags:** assign holds the empty string for blank and empty, as Ruby Liquid does, and the literal blank == blank stays false ([a897b76](https://github.com/Debutifycorp/liquidjs/commit/a897b76873be5592ede7639d61854edf409a438c))


### Features

* **shopify:** 3D model media data, with its files under the store's CDN path and its Ajax answer as the parity store prints it ([b842a95](https://github.com/Debutifycorp/liquidjs/commit/b842a959e0259217debad9dac7c8251450299bf5))
* **shopify:** hosted and external video media as the parity store prints them, with the media's alt on its preview and 1 or 0 for booleans ([fe81e77](https://github.com/Debutifycorp/liquidjs/commit/fe81e77f4018ab85df7a311837c195dade1fcdab))
* **shopify:** link.object is the product, collection, page, blog, article or policy a menu link points at ([5263d12](https://github.com/Debutifycorp/liquidjs/commit/5263d121a9a2177becb6c383d6ac15e0cca4c79c))
* **shopify:** the parity store's pickup mug, stock at one location with a size sold past zero stock ([6b8e2a7](https://github.com/Debutifycorp/liquidjs/commit/6b8e2a7bc0b756f73e4cb81a6eb13a1a9e799885))
* **shopify:** the storefront search reads Shopify's query syntax (fields, phrases, OR, AND, NOT, groups), ORs plain words and escapes search.terms ([a9bad30](https://github.com/Debutifycorp/liquidjs/commit/a9bad306bc61e275772c22eeab2fa7fe09a4e501))
* **shopify:** unit prices and ratings, with the measurement in the product answers and a rating printed as text in JSON ([5a27b73](https://github.com/Debutifycorp/liquidjs/commit/5a27b73b1794d5e2ca8e08ea6b5c94e4f604d5ed))
* **shopify:** unlisted products and the parity store's gift card, an untaxed product with no stock whose page answers noindex ([e28508b](https://github.com/Debutifycorp/liquidjs/commit/e28508bdfe963c3b2d2f723f27c62e24d7cc13cd))
* **shopify:** window.Shopify carries the MCP, shop-js feature and Shop sign-in fields in their shape, with neutral values ([2fb1de1](https://github.com/Debutifycorp/liquidjs/commit/2fb1de150e87cd9be200817761230df658d067c6))
* **shopify:** window.Shopify carries theme, cdnHost and the Shop sign-in fields, Shopify.loadFeatures answers, and shopify-account is defined ([77cdeb0](https://github.com/Debutifycorp/liquidjs/commit/77cdeb02e00731caf9b198bbfa11d680f15e9134))
* **storefront:** blog comments, the article's new_comment form posts, shows pending moderation, and article.comments holds the published ones ([2b52630](https://github.com/Debutifycorp/liquidjs/commit/2b526309009c60d2e4927f3c24f5c16c92692864))
* **storefront:** print Shopify's accelerated checkout and wallets, redirect checkout, account and permalinks, serve oEmbed, drop the contact fragment ([55d78ba](https://github.com/Debutifycorp/liquidjs/commit/55d78ba9ab4f18314453793ae66cd582200f1872))
* **storefront:** the cart holds a variant's quantity rule and price breaks and nests lines under a parent (parent_id, parent_relationship) ([9d0c77d](https://github.com/Debutifycorp/liquidjs/commit/9d0c77da2b6f3c0a73e0d356e6e77c819b54b223))
* **storefront:** the sandbox policy allows popups that escape it, so a link that opens a new tab works as on Shopify ([e8cbf7f](https://github.com/Debutifycorp/liquidjs/commit/e8cbf7f1d5574ff8dbaa5b7cd241aeb5f6dfd460))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [1.4.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v1.3.0...debutify-v1.4.0) (2026-10-18)


### Bug Fixes

* **for:** offset: continue starts from the previous loop's end when it is the first loop with its iterator, including inside an outer loop ([7c866e8](https://github.com/Debutifycorp/liquidjs/commit/7c866e82f91df64dc68d2e98a3e80a05a0840d87))
* **shopify:** add country.popular? (MarketData countries take popular, false by default) ([5651367](https://github.com/Debutifycorp/liquidjs/commit/5651367c24368d14b91d04f7c9ca28303d4f8e8f))
* **shopify:** add variant.quantity_price_breaks_configured? and let the data set variant.quantity_rule ([35cb673](https://github.com/Debutifycorp/liquidjs/commit/35cb6738bcf8445f00cd680228691b2c42a18fd7))
* **shopify:** product.gift_card? and line_item.gift_card follow the data (ProductData.gift_card) instead of always being false ([fbfea6a](https://github.com/Debutifycorp/liquidjs/commit/fbfea6a62dd2de16798eed86600620cfbd0157bd))
* **shopify:** render a template--<name>__<key> section id in the template it names, so /recommendations/products reaches a product page's section ([7e3c8a2](https://github.com/Debutifycorp/liquidjs/commit/7e3c8a2113cd71b1b5eb2b251595fe504c274003))


### Features

* **shopify:** add previewSampleData, the sample store with a gift card, volume pricing, product disclosures and video products for theme previews ([e711196](https://github.com/Debutifycorp/liquidjs/commit/e7111960bcbb81c4f28668d9f11598dc99476744))
* **shopify:** serve the complementary products a merchant set up (ProductData.complementary_products) for intent=complementary ([e358ebf](https://github.com/Debutifycorp/liquidjs/commit/e358ebf737c5e4b6db79478e5d952de129742266))
* **storefront:** keep a sandboxed page's localStorage and sessionStorage across page loads, saved in the visitor's state ([0aad05b](https://github.com/Debutifycorp/liquidjs/commit/0aad05ba24b4bb2bd1b085e6724b258523d6b5f2))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [1.3.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v1.2.0...debutify-v1.3.0) (2026-10-17)


### Bug Fixes

* **shopify:** a customer_address form starts from the fields of its address ([c1ea0fd](https://github.com/Debutifycorp/liquidjs/commit/c1ea0fdd5d4aa55331c70d4021772b75dde47634))
* **shopify:** a form given a nil or empty return_to prints no return_to input, as the parity store prints Horizon's localization form ([84dab64](https://github.com/Debutifycorp/liquidjs/commit/84dab64d31429b717069e6240e43e2c7c39a177a))
* **shopify:** a line item's properties.size reads nil, so Dawn's cart drawer prints the empty dl and plan paragraph Shopify prints ([3f4a2f2](https://github.com/Debutifycorp/liquidjs/commit/3f4a2f2640ddd7207618b29e60742fc4519602aa))
* **shopify:** a media preview image has a nil id, so Horizon's resource cards print no data-media-id on their first image ([7011ea2](https://github.com/Debutifycorp/liquidjs/commit/7011ea261705f1b774e60332fa96e00540bf7f82))
* **shopify:** a page prints Shopify's <shopify-store> before every <shopify-account>, with the origin, country and language ([fd0ed53](https://github.com/Debutifycorp/liquidjs/commit/fd0ed53f2734d5941eb0145a560a233fa9a36606))
* **shopify:** a paginate page part's title is its number, so part.title == paginate.current_page marks the current page as on Shopify ([336edcd](https://github.com/Debutifycorp/liquidjs/commit/336edcdc2deadd36591dad04928d5dd54d214928))
* **shopify:** a t: default is read through the schema locale files for url, video and video_url settings too ([8ee37e4](https://github.com/Debutifycorp/liquidjs/commit/8ee37e4262fd16a7b8a603a905edf295330428dd))
* **shopify:** a variant filter's featured_media keeps the media id, while its preview_image still has none ([2ae0fcb](https://github.com/Debutifycorp/liquidjs/commit/2ae0fcb826f3324262bd1f70db502ab6635c84f2))
* **shopify:** an address form fills only the address's fields, and a store with no markets gets no section group context ([42d9b58](https://github.com/Debutifycorp/liquidjs/commit/42d9b585d735dc3eb78509a7d78ec7bec60f35bb))
* **shopify:** colour filters return a colour object that answers red, green and blue, as Dawn's background contrast needs ([2f5741e](https://github.com/Debutifycorp/liquidjs/commit/2f5741e591e32af43f80a4aabfbc7189edcf63a1))
* **shopify:** each inlined javascript body runs in a try that logs its error, and an empty compiledAssetsUrl inlines instead of linking relative files ([8a5c73d](https://github.com/Debutifycorp/liquidjs/commit/8a5c73d221f89bd283b76e91647a204b53611443))
* **shopify:** export the CompiledAssets and CompiledFile types that compiledAssets() returns ([a45be80](https://github.com/Debutifycorp/liquidjs/commit/a45be8053f225a7416dfcbced86668162d98aa7f))
* **shopify:** find, find_index and has read a number as a place in a string and nil as no value, and concat appends a drop that iterates ([f605369](https://github.com/Debutifycorp/liquidjs/commit/f605369266303c2ed45f3a840577667c5bbb230c))
* **shopify:** give product_option_value a size and put the locale prefix before a root-relative url setting ([85dc633](https://github.com/Debutifycorp/liquidjs/commit/85dc63340e10edd447b094e8d03054045d52547d))
* **shopify:** hold the width image_tag works out from a height alone to 5760, and say in the image_url comment that image_tag follows the URL ([e4a27f3](https://github.com/Debutifycorp/liquidjs/commit/e4a27f35caee6bb38597c8cc65a2ae647594de52))
* **shopify:** image_tag gets its height through default, stops widths at the URL width, and prints the parity store's attribute order and focal point ([8d8fe53](https://github.com/Debutifycorp/liquidjs/commit/8d8fe53f54a2b1376aa115526a136079874f4bc1))
* **shopify:** image_tag prints no alt for a nil alt, and a variant filter's bare featured_media has a nil alt, as Horizon's filtered card prints ([3458038](https://github.com/Debutifycorp/liquidjs/commit/3458038db4dc0b5cdd46dc46191277eb8e462299))
* **shopify:** link the theme's compiled stylesheet and section javascript from content_for_header, and serve them from the storefront, as Shopify does ([0c50010](https://github.com/Debutifycorp/liquidjs/commit/0c50010c7e630e8f64080cfd55c84a1c7884fb58))
* **shopify:** make forloop.parentloop an opt-in option, forloopParentloop, that the Shopify preset turns on; the root entry reads nil as upstream ([f197e83](https://github.com/Debutifycorp/liquidjs/commit/f197e83159169dece969e6c86d5f401a622433e5))
* **shopify:** page_description is the shop's description on the collection list and the search page, as the parity store prints them ([a1d1952](https://github.com/Debutifycorp/liquidjs/commit/a1d195293572a035e83e14fb4d673f3402e8df18))
* **shopify:** paginate gives a single page no parts, as the parity store prints Dawn's one page of collections ([c26f945](https://github.com/Debutifycorp/liquidjs/commit/c26f9452888fdc98682b6270422a5ce2ef450314))
* **shopify:** powered_by_link prints Shopify's link, in English or French, as the parity store prints it ([60f4e1d](https://github.com/Debutifycorp/liquidjs/commit/60f4e1db93665a49c67c85290e22231412a959ea))
* **shopify:** print Shopify's outer <svg> for each placeholder name and fit Debutify's drawing to its viewBox ([294d952](https://github.com/Debutifycorp/liquidjs/commit/294d952117968e72bdbccd9e531676cf0469c577))
* **shopify:** put the locale prefix only on a url setting that is the root or a page of the store, never twice ([67f0d96](https://github.com/Debutifycorp/liquidjs/commit/67f0d963147183d2e945abe71c1bf254d70ed318))
* **shopify:** rating, measurement and rich text metafield values print their rating, value and unit, and HTML; bad numbers are nil ([2b70dd4](https://github.com/Debutifycorp/liquidjs/commit/2b70dd4ee91623b3d9ada9c4bb7a0e0ad50cf44a))
* **shopify:** read a byte order mark or no-break space outside a string as white space in theme JSON, as 1.2.0 did before a notice ([bccdaef](https://github.com/Debutifycorp/liquidjs/commit/bccdaef9cdba9db2696cbf065c129e57cbe77399))
* **shopify:** read each file's stylesheet and javascript from a parse of its own, so files a render parsed first are in the compiled files ([5d7d432](https://github.com/Debutifycorp/liquidjs/commit/5d7d432c25996313dbe7083b7e4097c3cbf888dc))
* **shopify:** select the first matching variant of a product that variant filters narrow, so Dawn's view event prints selectedVariant ([12637ad](https://github.com/Debutifycorp/liquidjs/commit/12637ad31a91d6c024ddb21b641fb62dc630ac6c))
* **shopify:** size image_tag and its srcset from the image_url, past the original, as Horizon's collection cards print them ([3eab588](https://github.com/Debutifycorp/liquidjs/commit/3eab588de9c71be090838f7629477b46c77c5e90))
* **shopify:** theme JSON files accept // and /* */ comments and trailing commas anywhere, as shopify.dev says Shopify does ([a48da46](https://github.com/Debutifycorp/liquidjs/commit/a48da46436ba2f9fd0a84cd27a29e687b454e2bc))
* **shopify:** unique link handles among siblings, an unknown ?variant= wins, first policy per known type, more right-to-left languages ([0afee4a](https://github.com/Debutifycorp/liquidjs/commit/0afee4ab2438b44caaaeb77d46eb7e0b4c4051f9))
* **shopify:** vendor and type collections have current_vendor and current_type, Shopify's collections no id, own images the title as alt ([15fbd6b](https://github.com/Debutifycorp/liquidjs/commit/15fbd6b10200a326dac453ec6771144bc404eb54))
* **shopify:** write Debutify's own layout rules for a policy page instead of a copy of Shopify's stylesheet ([522b2c0](https://github.com/Debutifycorp/liquidjs/commit/522b2c0fbd93dfaf3e9af72ccaf700ff37ed86a3))
* **storefront:** a compiled file is answered from the theme alone, before the data and services are resolved ([a2f975a](https://github.com/Debutifycorp/liquidjs/commit/a2f975a9614f13533989ba6c2d087b150d8333cf))
* **storefront:** apply the contextual section group file of the page's market ([91f74aa](https://github.com/Debutifycorp/liquidjs/commit/91f74aa830cfaae53be409a147c258a0feeba196))
* **storefront:** render a section asked for at a variant's address instead of redirecting, as the pickup availability fetch needs ([bd3c961](https://github.com/Debutifycorp/liquidjs/commit/bd3c961ec89509e3c738d0566db7aa12d95c28d6))
* **storefront:** serve each global asset at its exact address only, keep a gift card template Liquid, and document GiftCardData.url ([d264912](https://github.com/Debutifycorp/liquidjs/commit/d264912bc90ab401f546580ab5a0f5d399ac6303))
* **tags:** keep no for_stack register in the root entry unless forloopParentloop is on ([c124b31](https://github.com/Debutifycorp/liquidjs/commit/c124b313510c89c9a81be92dc30d96f988a78d2c))


### Features

* forloop.parentloop is the enclosing loop's forloop, through include and not into render, as Shopify Liquid has it ([db8f95e](https://github.com/Debutifycorp/liquidjs/commit/db8f95e3e95ca71e5cb80a10028d83abd3595b63))
* **shopify:** a language has its direction, rtl for a right-to-left language and ltr otherwise ([9e283d8](https://github.com/Debutifycorp/liquidjs/commit/9e283d8a104336a50aed658430f3d1d4a7d03ba4))
* **shopify:** a policy page carries the rules of the stylesheet Shopify links for it ([e74e32f](https://github.com/Debutifycorp/liquidjs/commit/e74e32f8c107dac0525341f486a091d9626f6e9f))
* **shopify:** date and time_tag formats and day and month names follow the page's language, and date_formats keys come from its locale file ([bff0616](https://github.com/Debutifycorp/liquidjs/commit/bff0616a821a3543d1c80afc12b648d904766f54))
* **shopify:** implement the stub filters Horizon and Dawn use: md5, preload_tag, inline_asset_content, structured_data, standard_event_data, more ([f07ddea](https://github.com/Debutifycorp/liquidjs/commit/f07ddeab15b88c58899dc7ba647277a9005564ab))
* **shopify:** menu links have a handle, their title handleized in the primary language, so each submenu id is its own ([481b898](https://github.com/Debutifycorp/liquidjs/commit/481b8989ec8b7ef1ced6bcda6ac9f8a3748f0a16))
* **shopify:** metafields are metafield objects with value, type and list?, typed by their type, and still print as stored ([ee182a9](https://github.com/Debutifycorp/liquidjs/commit/ee182a94d4da10ed01116b13806829f0e2e183e8))
* **shopify:** option values are product_option_value objects with id, availability, selection, variant and swatch; ?option_values= selects ([a415141](https://github.com/Debutifycorp/liquidjs/commit/a415141f869ce178f8bb76e2559666959ac3c0f0))
* **shopify:** resolve dynamic sources, closest and palette references in settings, prefix theme block ids, keep drops in default and first ([7b8bb20](https://github.com/Debutifycorp/liquidjs/commit/7b8bb2005bba3848b50af1daa546bf9587eb7c86))
* **shopify:** the sample stores hold the customer account menu every store has, and a menu prints as its handle ([aa244d7](https://github.com/Debutifycorp/liquidjs/commit/aa244d76b38864f7f9edbc5b3083d9f8aaa6a01f))
* **shopify:** the shop has its policies and password message, and /policies/<handle> renders the policy in the theme layout ([4f5fa3f](https://github.com/Debutifycorp/liquidjs/commit/4f5fa3f9ae8edd916c077923645f22f31149dd54))
* **shopify:** variants have barcode, unit price, volume prices and store availabilities; cart lines instructions and unit price ([80318ed](https://github.com/Debutifycorp/liquidjs/commit/80318edde1475903f87a6b4c76f7a1ec34f7e681))
* **shopify:** videos have aspect_ratio and duration, and product images attached_to_variant?, variants and product_id ([f24ba54](https://github.com/Debutifycorp/liquidjs/commit/f24ba54616c8bad543ef2978c771acf46883ef8a))
* **storefront:** publish the store in every language the theme has a locale file for (languages: 'theme'), regional locales inherit their base ([e179b1f](https://github.com/Debutifycorp/liquidjs/commit/e179b1fc4202ddf9973aed2f6fe70081c04ac8fa))
* **storefront:** serve the gift card page at /gift_cards/<store_id>/<token>, print the card's url under the base path, and issue a sample gift card ([f4e21ec](https://github.com/Debutifycorp/liquidjs/commit/f4e21ec2d2e79c01ee42a4bc4ad6da701b8dae11))
* **storefront:** serve the global assets the gift card page loads, open the page past the password, and read the card's template_suffix ([448859f](https://github.com/Debutifycorp/liquidjs/commit/448859f0f33d9f3b6fc7822c9e23eb68ad08e391))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [1.2.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v1.1.0...debutify-v1.2.0) (2026-10-17)


### Bug Fixes

* **shopify:** font_modify finds a font's own variant by style and weight, FontInfo is read-only, the font table takes the day it was recorded ([9fe5f90](https://github.com/Debutifycorp/liquidjs/commit/9fe5f909653cdde2758da0440b628635b1ea2d1e))
* **shopify:** one safe way to put a class on an svg, the prolog stepped over, and the library bundle checked for leaks into other bundles ([e2ed176](https://github.com/Debutifycorp/liquidjs/commit/e2ed17611842ddd26efc68595d20800d66f889bc))


### Features

* **shopify:** print Shopify's payment icons from activemerchant/payment_icons, recorded with a probe of unknown and unlisted types ([4da4fef](https://github.com/Debutifycorp/liquidjs/commit/4da4fef617f35d75c22b73ff7ca67a292143bc4a))
* **shopify:** read Shopify's font library as recorded from the parity store, and point font_url at its files ([d02c683](https://github.com/Debutifycorp/liquidjs/commit/d02c6837003df3cf455214657ac7b054f14eb953))
* **storefront:** take the services as a function of the request, like the theme and the data ([d294898](https://github.com/Debutifycorp/liquidjs/commit/d294898ee9681458ecbbc031b483b755120f115e))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [1.1.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v1.0.1...debutify-v1.1.0) (2026-10-16)


### Bug Fixes

* **build:** declare the real version in dist/index.d.ts, and test the ES module and the declarations ([58e0b99](https://github.com/Debutifycorp/liquidjs/commit/58e0b99cf5b92b34482b5a0737459cd63c838a16))
* **filters:** keep stripTags out of the root engine's filter table ([0dd3033](https://github.com/Debutifycorp/liquidjs/commit/0dd3033dbf6dc1729c70bc3786a4a3fb5471ab6a))
* **shopify:** a select keeps a saved value that is no longer an option, and a url setting takes the view prefix ([6500b9d](https://github.com/Debutifycorp/liquidjs/commit/6500b9dbf2dd68f8e40050eef703cc5d48b1cbd1))
* **shopify:** best discount combination, combination limits (Task 14 review) ([e4c24b4](https://github.com/Debutifycorp/liquidjs/commit/e4c24b45f70402ba968e8ef0ceab934f7457b3e2))
* **shopify:** blog global and within under a view prefix, analytics publish closure (Task 2 review) ([5297a1d](https://github.com/Debutifycorp/liquidjs/commit/5297a1dce70714b1fd0040594f24f105e26925cc))
* **shopify:** build an order's shipping, tax, refund and payments in the view's currency ([0720754](https://github.com/Debutifycorp/liquidjs/commit/07207546d7086686376967bfb512a82fd34b7614))
* **shopify:** contact and customer forms anchor their action at the form id ([175da21](https://github.com/Debutifycorp/liquidjs/commit/175da2169eaf469a28ed694c35dbf18c6668353f))
* **shopify:** decimals print with their point in json, image and cart addresses without a protocol, richtext void tags as stored, return_to raw, payment icon titles ([32c5b5a](https://github.com/Debutifycorp/liquidjs/commit/32c5b5ad37ba1768b930ebad508c6e5f1ac373f3)), closes [Float#to_s](https://github.com/Float/issues/to_s)
* **shopify:** EEA markets hide compare-at prices, zero is not rounded, json nil drop (Task 4 review) ([7b6406b](https://github.com/Debutifycorp/liquidjs/commit/7b6406b19a8cc3a70ad0954edfb0925de7974e1d))
* **shopify:** escape titles that come from the request, state unpinned page metadata as unpinned ([40d016b](https://github.com/Debutifycorp/liquidjs/commit/40d016bcbdc39666695415cf7bdebab1a4bc8809))
* **shopify:** export CartLinesData, the cart data shape 1.0 had ([30044de](https://github.com/Debutifycorp/liquidjs/commit/30044deb1eef5fc4f259a8abf15f9f8b7fc8fa81))
* **shopify:** form drop key order, errors as an array, more posted values (Task 12 review) ([59cf96c](https://github.com/Debutifycorp/liquidjs/commit/59cf96c45afb3584bd05434b77f976d852d7c7dc))
* **shopify:** hide private cart attributes (Task 13 review) ([a10dbc9](https://github.com/Debutifycorp/liquidjs/commit/a10dbc9bbfffffd0b918f0e29517695c9fc5c385))
* **shopify:** legacy localization renders as before, safe display names, page locale follows the request (Task 3 review) ([e9b6122](https://github.com/Debutifycorp/liquidjs/commit/e9b61225f466e410ea509212ff17e2d8a869ec56))
* **shopify:** link_to adds rel nofollow to external addresses only, and the date formats do not pad the day ([8e972c7](https://github.com/Debutifycorp/liquidjs/commit/8e972c708860a196789cab3e3cd571f7d257846b))
* **shopify:** list order and data differences from the parity store's pages (item 22 task 8, lane P3) ([ec1a089](https://github.com/Debutifycorp/liquidjs/commit/ec1a089f9fc1fe75f2af32223ac1d389dbf3ab4b))
* **shopify:** narrow probe volatile paths, segment-wise path decoding (Task 1 review) ([114ee1c](https://github.com/Debutifycorp/liquidjs/commit/114ee1c8caca67dc5f29a59ce9b9a73abadde62d))
* **shopify:** no first available variant when all are sold out (Task 6 review) ([aa396f2](https://github.com/Debutifycorp/liquidjs/commit/aa396f2079e6c63f47cfb98357f4579944fdbc6a))
* **shopify:** overlays without Shopify state, base loop guard, more overlay tests (Task 16 review) ([bb9972a](https://github.com/Debutifycorp/liquidjs/commit/bb9972a584fa12d5503467996f3659d5e52c5471))
* **shopify:** page metadata follows the parity store's pages ([8f5fd02](https://github.com/Debutifycorp/liquidjs/commit/8f5fd027ecc8fbfd960b4956ba2dd8e521f0b69a))
* **shopify:** parity variants titled by their option values; page probe on the new handles ([371dc3c](https://github.com/Debutifycorp/liquidjs/commit/371dc3c60125a7d980ff3ee4b3e13112b0e4ef5a))
* **shopify:** predictive product fields as shopify.dev says, honest recommendation tests (Task 11 review) ([2e0d84f](https://github.com/Debutifycorp/liquidjs/commit/2e0d84f520135bf36aac35e55184d0dd78ec7a26))
* **shopify:** print the cart weight and a percentage discount value as decimals, list the 1.1.0 upgrade changes, keep the fixtures' image addresses as recorded ([303efb4](https://github.com/Debutifycorp/liquidjs/commit/303efb48d8e879f960f4073295140971887b9d49))
* **shopify:** review minors of the P2 lane, image src without protocol, and the line break after a font_face rule ([91570b6](https://github.com/Debutifycorp/liquidjs/commit/91570b6911e83cea0127d2e9e70d32255b478521))
* **shopify:** review minors of the P3 lane, lazy default order, product images in JSON, tests ([b3029ca](https://github.com/Debutifycorp/liquidjs/commit/b3029cafcbbfb0dc45077b39962be7a583c1ee3a))
* **shopify:** search on the compiled filter matcher, shared query derivation (Task 10 review) ([2ecfb2b](https://github.com/Debutifycorp/liquidjs/commit/2ecfb2bae4e06e280318a5c2878ffd1a1a5aad12))
* **shopify:** selling plan rounding and edge cases (Task 7 review) ([523e7d1](https://github.com/Debutifycorp/liquidjs/commit/523e7d1c255fc93811a84b570a998fda1a89bad1))
* **shopify:** settle Buy X Get Y on runs of units, decide a minimum in the view's currency, give order and shipping discounts a purchase type ([fd35acb](https://github.com/Debutifycorp/liquidjs/commit/fd35acb22092175a7c8ad84678e6bb3b9f30b79c))
* **shopify:** shipping rates in other markets, country names (Task 15 review) ([3229b09](https://github.com/Debutifycorp/liquidjs/commit/3229b09e570b7162211ff582ef59448dee6b07d6))
* **shopify:** store collection tags of all products, recorded claims only (Task 17 review) ([d592ef0](https://github.com/Debutifycorp/liquidjs/commit/d592ef05b49aaf2b4374f75995fd75cfff30d070))
* **shopify:** the default image service prints addresses without their protocol, as image_url does on Shopify ([2d3a148](https://github.com/Debutifycorp/liquidjs/commit/2d3a148801c3967c8de6e4a0068223acb7da48ad))
* **shopify:** view wins over suffix in a test, unsafe suffixes fall back (Task 8 review) ([982e469](https://github.com/Debutifycorp/liquidjs/commit/982e4690091f823d8baea5b9babd5c9a03b26871))
* **storefront:** a sandboxed form post names its page, which sends no Referer ([69582ea](https://github.com/Debutifycorp/liquidjs/commit/69582ea5acc3beb17a565ab44ef65e9a0f16e33a))
* **storefront:** answer the cart endpoints without an extension in JSON when the request asks for it ([c739606](https://github.com/Debutifycorp/liquidjs/commit/c7396066bd133c6f1b66e1c4403046871b172f1f))
* **storefront:** body and visitor edge cases (Task 2 review) ([7828efd](https://github.com/Debutifycorp/liquidjs/commit/7828efd117f8658944add7bd9d9015615b4ae405))
* **storefront:** bound the email check, one Referer reader, return_to back on localization (Task 6 review) ([af49813](https://github.com/Debutifycorp/liquidjs/commit/af49813be1d1e2b488185e3785036863a27d5ae6))
* **storefront:** build a request's filters and product copies when read, bound the view cache, keep search words, read an unknown sort_order as manual ([4245d7c](https://github.com/Debutifycorp/liquidjs/commit/4245d7c7bf821d8b765caef45e379e1837a99a2a))
* **storefront:** build search results with copyObject so they keep the product's hidden markers and print through json as a product does ([07a54aa](https://github.com/Debutifycorp/liquidjs/commit/07a54aa2ffad0b7b1ae22fa69a326a2fd95437e7))
* **storefront:** cart change on stock, name bounds, error text sources (Task 3 review) ([b097af2](https://github.com/Debutifycorp/liquidjs/commit/b097af2c1785ff686f5aca9e63facafba68d4ca5))
* **storefront:** give cartJson and lineItemJson answers their own arrays and objects instead of the cached store's ([2b8d8f4](https://github.com/Debutifycorp/liquidjs/commit/2b8d8f415d7bf78582da990a29affb72fdc171cb))
* **storefront:** hand the form object's posted values over escaped and HTML-safe, so a cross-site contact post cannot run script on the store's page ([18e522a](https://github.com/Debutifycorp/liquidjs/commit/18e522aa43e6c949d2ed35e843e3e04ba325e0da))
* **storefront:** leave head-less HTML alone, run the client script once, harden its requests (Task 7 review) ([a88e844](https://github.com/Debutifycorp/liquidjs/commit/a88e8449168477abfee9558ba21277eb7b29880d))
* **storefront:** linear path trimming, stricter import rule (Task 1 review) ([468deb0](https://github.com/Debutifycorp/liquidjs/commit/468deb0a83dcd124b9f49d006e64364706cd0d0c))
* **storefront:** lock the password page's sections, all-products product links (Task 4 review) ([46bec63](https://github.com/Debutifycorp/liquidjs/commit/46bec633b6475efc11aa99e48d5891656d6818fd))
* **storefront:** name a neutral myshopify domain in the storefront sample data and its fixtures ([7a3c89e](https://github.com/Debutifycorp/liquidjs/commit/7a3c89ef3b47eb606f00144309a1c96a522d223c))
* **storefront:** print a cart attribute or line item property name with its tags stripped and its markup characters escaped in Liquid ([a0c1ff3](https://github.com/Debutifycorp/liquidjs/commit/a0c1ff3feee85be52c90851ad7c600fe2c38c7f6))
* **storefront:** print the visitor's cart note, attribute values and line item properties HTML-escaped in Liquid, and raw in the Ajax answers and cart | json, as the parity store does ([696252f](https://github.com/Debutifycorp/liquidjs/commit/696252f5f64b91289145ea618a6c45aa023f3acc))
* **storefront:** read the language from locale_code, which Dawn's language selector posts ([096efe0](https://github.com/Debutifycorp/liquidjs/commit/096efe0c2e4985727134f261fe1ca93ad226cf93))
* **storefront:** resolve visitor-written targets before the base path goes on, bound what one visitor can store, and the seven minors of final review A ([f6f3417](https://github.com/Debutifycorp/liquidjs/commit/f6f341749508cb94e39ef19de41e9412e6e96e07))
* **storefront:** the form probe parses on Shopify ([4d1877c](https://github.com/Debutifycorp/liquidjs/commit/4d1877c220f006266b02c37509ad3509692de768))
* **storefront:** the form probe prints valid JSON ([5a426dc](https://github.com/Debutifycorp/liquidjs/commit/5a426dc5ec9b796a5690cfbc9105c08c4628c432))
* **storefront:** type the Ajax answers as the parity store does, prepare_shipping_rates answers null (Task 8, lane AX) ([15d1100](https://github.com/Debutifycorp/liquidjs/commit/15d1100486441c05ca492154f938c0988d1c55ad))
* **storefront:** visitor cart in recommendations, one-time-only discount default, change-form totals, derived cart token (Task 5 review) ([e0e96ca](https://github.com/Debutifycorp/liquidjs/commit/e0e96ca8ab06ec75a63352dffc97749c44d48731))


### Features

* **shopify:** alternate templates by view and template suffix ([ec9054c](https://github.com/Debutifycorp/liquidjs/commit/ec9054c9d91a96785ef6b94f4405ce1eee8a160e))
* **shopify:** cart | json prints the cart as Shopify does ([579f543](https://github.com/Debutifycorp/liquidjs/commit/579f5431cb849d655775ef39c3d220ebf6dab70c))
* **shopify:** cart state, line keys, the cart drop and cartJson ([69265c7](https://github.com/Debutifycorp/liquidjs/commit/69265c77c4e412c1ed0f9fb9bd6a7699f9b952c5))
* **shopify:** collection sort, filters, tag paths, vendor and type collections ([8f34bbc](https://github.com/Debutifycorp/liquidjs/commit/8f34bbc6dc97bf89dca9abbcb9ec03a41712116d))
* **shopify:** content translations per language ([4e69866](https://github.com/Debutifycorp/liquidjs/commit/4e698667d9304a807b9ddf555aa5574db3ca3232))
* **shopify:** discount codes, automatic discounts, free shipping and Buy X Get Y in the cart ([37ac452](https://github.com/Debutifycorp/liquidjs/commit/37ac452782217fe7083bf28b93fd21b3764b03fa))
* **shopify:** every parity probe matches; settled behaviours documented ([c59b983](https://github.com/Debutifycorp/liquidjs/commit/c59b983e01844df9e23a5519d081a39934ce5fdd))
* **shopify:** markets, languages and localization per view ([41dd71f](https://github.com/Debutifycorp/liquidjs/commit/41dd71fcd0418d7cffb33b143b46f01396a7005b))
* **shopify:** posted form state and form_errors ([b74a342](https://github.com/Debutifycorp/liquidjs/commit/b74a3420ed64e1ac8410d013d5961c950b4cfa21))
* **shopify:** product prices in the market's currency, with Shopify's rounding; json writes nil as null ([7217f43](https://github.com/Debutifycorp/liquidjs/commit/7217f436427ee8ae6cf401932032865d3f6be2b5))
* **shopify:** read a storefront address into a page request (requestFromUrl) ([c7fd0f7](https://github.com/Debutifycorp/liquidjs/commit/c7fd0f7e47fc0398108afbc4218be418ce542a25))
* **shopify:** sample data from Shopify's mock.shop, storefront data types and probe templates ([90b1ef8](https://github.com/Debutifycorp/liquidjs/commit/90b1ef82a4a5ce0f7050f0176138328f638f3934))
* **shopify:** search types, filters, sort, prefix and unavailable products ([5e7a98e](https://github.com/Debutifycorp/liquidjs/commit/5e7a98ea03dba0fd5f6a2e34483a62a0c79d8d0f))
* **shopify:** selected variant, stock fields and productJson ([5855fd1](https://github.com/Debutifycorp/liquidjs/commit/5855fd1f9023c5d2ba70bfffdc4f9992502a154f))
* **shopify:** selling plan groups, allocations and the selected plan ([3973ff8](https://github.com/Debutifycorp/liquidjs/commit/3973ff8247df20e6e9a46c143775f0de8f6c9bfd))
* **shopify:** shipping rates for a cart and an address ([f34d636](https://github.com/Debutifycorp/liquidjs/commit/f34d6367ce0997088ddee7f080705c25761e21c0))
* **shopify:** store views with a URL prefix, prefixed routes and forms, customer events in content_for_header ([b45dfcb](https://github.com/Debutifycorp/liquidjs/commit/b45dfcb1bcfc88fce439f3e3c1f66d7d4293db03))
* **shopify:** the predictive_search object, predictiveJson and recommendationsJson ([dd05192](https://github.com/Debutifycorp/liquidjs/commit/dd051920e264e318d18338635ab8d5a19ca69001))
* **shopify:** theme overlays over a shared, parsed-once base theme ([eee2167](https://github.com/Debutifycorp/liquidjs/commit/eee2167a4173c4b594767588f6f54e13d5447bec))
* **storefront:** cart operations with Shopify's merge, stock, selling plan and error rules ([7cf33c6](https://github.com/Debutifycorp/liquidjs/commit/7cf33c664e21e161697c0e97cfa15c55b4335df5))
* **storefront:** cart, contact, localization and variant forms, redirects kept on the store ([b822e37](https://github.com/Debutifycorp/liquidjs/commit/b822e3767f72d681b0e21a968ddce984cecd9a27))
* **storefront:** request bodies, visitor keys, the memory cart store and per-visitor order ([c7fd8a1](https://github.com/Debutifycorp/liquidjs/commit/c7fd8a127fc3d1002ab5a7f729a0683d8f680c12))
* **storefront:** sandboxed pages: CORS, preflights, cookieless visitors and the client script ([6528c9a](https://github.com/Debutifycorp/liquidjs/commit/6528c9adc54243dd2ff9bcde6a4367defce07b1a))
* **storefront:** the @debutify/liquidjs/storefront entry, its types and router ([3478bce](https://github.com/Debutifycorp/liquidjs/commit/3478bce387c26397eaf8706017970eff8dc4f8e3))
* **storefront:** the Cart API with bundled sections, discount links, shipping rates, product, suggest and recommendations JSON ([210b099](https://github.com/Debutifycorp/liquidjs/commit/210b099397b2d91fb5d6f323c044ee0493203466))
* **storefront:** the handler, pages, sections, 404 and error pages, the password lock ([2ad1f87](https://github.com/Debutifycorp/liquidjs/commit/2ad1f87563906c57a721aa0a1dd898c236f9df21))


### Performance Improvements

* **shopify:** count filter values in one pass (Task 9 review) ([d2a2ca1](https://github.com/Debutifycorp/liquidjs/commit/d2a2ca1473da0a2fd722c3365f03e32f5fc0ce62))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

## [1.0.1](https://github.com/Debutifycorp/liquidjs/compare/debutify-v1.0.0...debutify-v1.0.1) (2026-10-15)


### Bug Fixes

* compare a value with empty or blank through its own empty? ([8dad0c5](https://github.com/Debutifycorp/liquidjs/commit/8dad0c56509f4c5f57844c3b467d774bfb6c9881))
* **shopify:** add the section-id input to a product form inside a section, as Shopify prints it ([47ae6de](https://github.com/Debutifycorp/liquidjs/commit/47ae6de2a7e4726e3f1d99fb8014c29cd28fd80f))
* **shopify:** build collection storefront filters from store data ([3c39dbb](https://github.com/Debutifycorp/liquidjs/commit/3c39dbba7b867e56b3cdafbf884be052647c9f94))
* **shopify:** build the customer's addresses and orders, and give the order template its order ([0c2e175](https://github.com/Debutifycorp/liquidjs/commit/0c2e17530fc33ae3b27c78a7cf9326ef1492abff))
* **shopify:** draw placeholder_svg_tag as line art on no background, in the markup shopify.dev shows ([6efeceb](https://github.com/Debutifycorp/liquidjs/commit/6efeceb9f398d7f142957fd38d9779e6655ca7e7))
* **shopify:** escape leaves image_tag output as it is, as Shopify does ([20b1b64](https://github.com/Debutifycorp/liquidjs/commit/20b1b64e7235a533ecf35378a7081659defa9a84))
* **shopify:** give a theme block its own blocks as block.blocks ([68d047e](https://github.com/Debutifycorp/liquidjs/commit/68d047ee96adde21b22397ed161417ccc5b67aae))
* **shopify:** give templates country_option_tags and all_country_option_tags ([be3f698](https://github.com/Debutifycorp/liquidjs/commit/be3f6988bf9d07af0f6f0ebf5f486074f047a6b2))
* **shopify:** give the gift_card template its gift_card object ([8c337e2](https://github.com/Debutifycorp/liquidjs/commit/8c337e26eb6971523037d3f1681d61b0fb1dac4e))
* **shopify:** payment_terms prints nothing, as Shopify does for a store without Shop Pay Installments, and is no longer a reported stub ([337b807](https://github.com/Debutifycorp/liquidjs/commit/337b8070237292bf12aa9c235aa08d629c33e2c9))
* **shopify:** perform product recommendations for a recommendations request ([08fa2c5](https://github.com/Debutifycorp/liquidjs/commit/08fa2c53acdf209ae0be7038ec8eaf9605da3198))
* **shopify:** print an _html translation's interpolated values as they are ([e9c2e97](https://github.com/Debutifycorp/liquidjs/commit/e9c2e97dde73cb694409f79d01b3b6d2feb0d914))
* **shopify:** print nothing for an if, unless, case or for whose every branch is blank, as Ruby Liquid drops their text ([1427b0b](https://github.com/Debutifycorp/liquidjs/commit/1427b0b12b5609edb15c2680119966cb62249ea8))
* **shopify:** render a block given to render as Shopify does, and never fail with a TypeError ([6419b2f](https://github.com/Debutifycorp/liquidjs/commit/6419b2f4241d17169f437f26c9c6941af8f16859))
* **shopify:** run a storefront search when the request has search terms ([5d9ff34](https://github.com/Debutifycorp/liquidjs/commit/5d9ff341102039134d04e607ad78d91077b5d835))
* **shopify:** trim whitespace bug-compatibly, as Shopify's storefront parses themes ([ce3b1ad](https://github.com/Debutifycorp/liquidjs/commit/ce3b1ada6ba785dcf622a34a55f2c8a0907f2cd8))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [1.0.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v0.1.0...debutify-v1.0.0) (2026-10-13)


### Bug Fixes

* charge slice's memory for the result, not the requested length ([6e472dd](https://github.com/Debutifycorp/liquidjs/commit/6e472dda82d3b7c8d257afe12b7ac9f82a923d64))
* **shopify:** accept a block id of 0, keep static blocks apart from dynamic ones, ignore a wrapper class that is not a string and stop blocks that nest themselves ([54fcaa5](https://github.com/Debutifycorp/liquidjs/commit/54fcaa5d3d458dc22bf77711b9f339b2ed03e1b6))
* **shopify:** address group sections by keys that hold __, report bad group JSON from renderSection, and keep malformed contextual files, preset static blocks and block schemas apart ([b1970c3](https://github.com/Debutifycorp/liquidjs/commit/b1970c3f86f6718da41ae4d0d670bb68a6b40e65))
* **shopify:** answer recommendations.performed as well as recommendations.performed? ([c9e338d](https://github.com/Debutifycorp/liquidjs/commit/c9e338d955c38c758a73e79684eb95d0ba3ebe71))
* **shopify:** balance sanitised HTML and restrict link attributes ([3c1f7d0](https://github.com/Debutifycorp/liquidjs/commit/3c1f7d019d9b262e55fb21a3017570fc18cc1832))
* **shopify:** contain a malformed block in the block, and list such errors in one way ([5235e83](https://github.com/Debutifycorp/liquidjs/commit/5235e836e46c285bbb0f10eea182df35cd0bb168))
* **shopify:** correct two stale comments and an error message that named an internal ([e88a9ec](https://github.com/Debutifycorp/liquidjs/commit/e88a9ec7ede59f0ebe3d7465b75aedb52a6d8526))
* **shopify:** drop the engine trust options that never reached a render ([e02329f](https://github.com/Debutifycorp/liquidjs/commit/e02329f8ba154b9cc1c9d60e16b0481da37f049b))
* **shopify:** error on an unknown date format, read zone-less dates in DST zones, follow liquid-spec for money ([b6326c1](https://github.com/Debutifycorp/liquidjs/commit/b6326c126f13d2a833d32a5a72750d6b9500af81))
* **shopify:** follow shopify.dev for select defaults, html tags, empty text, resource handles and cart indexes ([6550522](https://github.com/Debutifycorp/liquidjs/commit/655052271da9c816087dc88e6684266a36468095))
* **shopify:** follow the paginate window_size, form object and 25,000-item limit pages and harden the tag tests ([69de8d5](https://github.com/Debutifycorp/liquidjs/commit/69de8d5300d5a90f013fcaccfced8d20088b0b72))
* **shopify:** follow the shopify.dev pages where the media filters departed from them ([94af879](https://github.com/Debutifycorp/liquidjs/commit/94af8795d5ecca2d73c0dbc35d21b7d5ba0c6eec))
* **shopify:** freeze the defaults every render shares and the sample store ([87458fc](https://github.com/Debutifycorp/liquidjs/commit/87458fc2aa7485039fab4178fa2f328f4e98f0cd))
* **shopify:** give product images and media their position ([8f4bdab](https://github.com/Debutifycorp/liquidjs/commit/8f4bdab5a01e9e3ed702fb640581022d1a59df80))
* **shopify:** give sections and blocks the theme's colour schemes ([a68d11d](https://github.com/Debutifycorp/liquidjs/commit/a68d11d26a36b31d61d47f40ae62c131a271ce8b))
* **shopify:** give the sample blog moderated? ([d5671ab](https://github.com/Debutifycorp/liquidjs/commit/d5671abd92232e7548bcb5a205e45b9d95e2c467))
* **shopify:** give variant images the position of the product image and hedge the position base ([c88ffd5](https://github.com/Debutifycorp/liquidjs/commit/c88ffd53c258cd12d7c14f2767e0f1df23b08ab7))
* **shopify:** hold section and block keys, image alt and URL forms to plain values ([8230686](https://github.com/Debutifycorp/liquidjs/commit/82306869bd7057d81bf6b663a4cc0b38e15c537e))
* **shopify:** hold untrusted settings to their documented form and escape json output ([272c5f1](https://github.com/Debutifycorp/liquidjs/commit/272c5f1bbb62ab59f827cf6dd4631a6b76eb6bda))
* **shopify:** image_url without a width or height returns the original-size URL instead of an error ([04a5710](https://github.com/Debutifycorp/liquidjs/commit/04a5710ef74f54ff3c5fcef4fc95dc38b9310670))
* **shopify:** keep image alt apostrophes as typographic ones instead of dropping the alt ([2a5b53f](https://github.com/Debutifycorp/liquidjs/commit/2a5b53fd83fafd46e8afcfeffa585fd40ef53e3e))
* **shopify:** keep the smoke script's refusal case-proof, survive broken templates and warn about its output ([fb39507](https://github.com/Debutifycorp/liquidjs/commit/fb3950770d3b54e28d6c768e63c3a02496f04bdc))
* **shopify:** keep untrusted setting values from printing raw ([b8d1823](https://github.com/Debutifycorp/liquidjs/commit/b8d18230e39f3b14cb5ecb98978429c8eaecef52))
* **shopify:** match menu links as shopify.dev documents and pin the derived fields ([e3b7546](https://github.com/Debutifycorp/liquidjs/commit/e3b754683617445d957d28c90c07bfa5d361d2e6))
* **shopify:** pin the filter status split by invariants, look names up as own properties, check the docs checkout ([b9ccd4f](https://github.com/Debutifycorp/liquidjs/commit/b9ccd4fbd856740c882eb0985b40ad6afbf77a8c))
* **shopify:** print tablerow with Shopify's line breaks ([f11bc58](https://github.com/Debutifycorp/liquidjs/commit/f11bc583350479b4cb37e5fe9de0f58a6b897479))
* **shopify:** read an undefined top-level size as nothing ([1a424c6](https://github.com/Debutifycorp/liquidjs/commit/1a424c6216b2f14dfaa445a4616b1392cd5b1bf8))
* **shopify:** render sections by the ids renderPage reports and keep malformed theme files inside what uses them ([5154630](https://github.com/Debutifycorp/liquidjs/commit/51546305e9f424bb411f719d15ac9ec5e7dc5b28))
* **shopify:** report bad colour and font arguments instead of writing NaN, and test the alpha, hex3, mix and font_modify paths ([e7f4581](https://github.com/Debutifycorp/liquidjs/commit/e7f4581b197f01a216525e41be15fd09ee0fe665))
* **shopify:** scale an oversized image_url request proportionally ([84356bc](https://github.com/Debutifycorp/liquidjs/commit/84356bc0bd24f5f288b9e6b1b7d6799ac274991e))
* **shopify:** use snake_case report features and keep angle brackets out of reports ([7bbba2d](https://github.com/Debutifycorp/liquidjs/commit/7bbba2de290f5e67f13948a91361d6e1c49b434c))
* **shopify:** write no HTML attribute whose name is not valid ([de7e354](https://github.com/Debutifycorp/liquidjs/commit/de7e3545374ee43666946026a377ef2fe756d7a5))


### Code Refactoring

* **shopify:** trim the /shopify entry to the API that 1.0.0 covers ([fc41646](https://github.com/Debutifycorp/liquidjs/commit/fc41646423ffb051532528946b9cfd3d75f3c63c))


### Features

* run the CLI on commander 15 and require Node 24 or later ([5710560](https://github.com/Debutifycorp/liquidjs/commit/5710560317acd538c52c4503fd24e6166f292f31))
* **shopify:** add asset, image, video and media filters through injected services ([88a2495](https://github.com/Debutifycorp/liquidjs/commit/88a249503fb5653b546d89f79951d6bf7e207dde))
* **shopify:** add schema, javascript, stylesheet, doc, style, layout, form and paginate tags ([786c272](https://github.com/Debutifycorp/liquidjs/commit/786c27267bea4b3171b0e3b1805ffdbba910de1b))
* **shopify:** add t, money and Shopify's text filters ([ae6f66e](https://github.com/Debutifycorp/liquidjs/commit/ae6f66e027577b0e37682f0459f816af8ab160d6))
* **shopify:** add the colour and font filters with Shopify's color and font objects ([23d6e00](https://github.com/Debutifycorp/liquidjs/commit/23d6e007776626f338043914be3ec05fee8e7867))
* **shopify:** build store objects, page globals and settings, sanitising untrusted HTML ([cbba3dc](https://github.com/Debutifycorp/liquidjs/commit/cbba3dc905295a9989c716e425577d8853c33488))
* **shopify:** parseLimit and unknownTags for renderPage and renderSection ([719774a](https://github.com/Debutifycorp/liquidjs/commit/719774ae08656c8f78b6f51a33a569094d64d3be))
* **shopify:** register every filter in Shopify's theme-liquid-docs, stubbing the unimplemented ([c34c615](https://github.com/Debutifycorp/liquidjs/commit/c34c6150aa82f925634624cc9aca19caf5c05bcf))
* **shopify:** render Online Store 2.0 pages and sections from a theme's files ([22abb09](https://github.com/Debutifycorp/liquidjs/commit/22abb09cd675ec142a6629e490b401559c2bbf30))
* **shopify:** render theme blocks and static blocks with content_for ([b5d8b80](https://github.com/Debutifycorp/liquidjs/commit/b5d8b803d3219723c4c3e6e9b29b18c3bbea48c3))
* **shopify:** resolve color_scheme and color_scheme_group settings ([c8c9da5](https://github.com/Debutifycorp/liquidjs/commit/c8c9da573457e90075795a95f50c04e1254c0952))


### BREAKING CHANGES

* **shopify:** defaultServices, SHOPIFY_DEFAULT_LIMITS and sampleStoreData are frozen, so assigning to them throws a TypeError. Pass your own services and limits as options, and pass a copy of the sample store (structuredClone(sampleStoreData)) as data to change it.
* **shopify:** report feature values are renamed to snake_case: "section-group" is section_group, "static block" is static_block, "app block" is app_block, "disabled section" is disabled_section, "locale file" is locale_file, "money input" is money_input and "date format" is date_format. The MissingKind "section-group" is section_group. UnsupportedEntry.feature is typed as the new UnsupportedFeature union instead of string.
* **shopify:** @debutify/liquidjs/shopify no longer exports these internal names: SHOPIFY_RAW_TAGS, resolveServices, parseFontHandle, cdnStyleImageUrl, emptyTranslator, ReportCollector, errorMessage, shopifyState, createState, currentFrame, STATE, DEFAULT_MONEY_FORMAT, DEFAULT_MONEY_WITH_CURRENCY_FORMAT, ThemeFS, ThemeCache, UnknownTag, installFallbacks, escapeHtml, attribute, registerShopifyFilters, shopifyFilterImplementations, SHOPIFY_FILTER_SETS, SHOPIFY_TAGS, registerShopifyTags, filterStatus, SHOPIFY_FILTER_DOCS, THEME_LIQUID_DOCS_REVISION, imageSource, DEFAULT_SRCSET_WIDTHS, legacySize, cssFamily, fontSlug, parseColor, FormDrop, buildPaginate, formatMoney, handleize, HandleMap, TemplateDrop, sanitizeHtml, isSafeUrl, buildStore, buildProduct, buildLinklists, buildGlobals, ROUTES, LiquidSetting, resolveSettingValue, settingUrl, parseThemeJson, deepMerge, contentForHeader, HEADER_MARKER and newHeaderMarker, and the types SectionLocales, ShopifyState, StateInit, Frame, ThemeHooks, ShopifyFilter, ShopifyFilterDoc, ShopifyFilterSet, ImageSource, Rgba, Paginate, PaginatePart, LiquidObject, StoreObjects, GlobalsInput, PageGlobals and SettingsEnv. CompiledTheme is exported as a type only.
* **shopify:** under @debutify/liquidjs/shopify, TablerowTag is now the root entry's tag class; the Shopify tablerow tag is exported as ShopifyTablerowTag.
* **shopify:** renderLiquid takes only (liquid, source, scope); its fourth argument, a StateInit, and its fifth, a file path, are gone.
* **shopify:** createShopifyLiquid no longer takes the runtime option, and ThemeHooks is no longer exported. Since 0.1.0 that interface had also gained the required members renderBlocks and renderStaticBlock.
* **shopify:** createShopifyLiquid and renderLiquid no longer take trustLiquidSettings or trustHtmlSettings, which had no effect; pass them to renderPage or renderSection.
* Node 24 or newer is required.


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [0.1.0](https://github.com/Debutifycorp/liquidjs/compare/debutify-v0.0.0...debutify-v0.1.0) (2026-10-13)


### Bug Fixes

* export deep dist type paths and the bin script like the published upstream layout ([d8b0d72](https://github.com/Debutifycorp/liquidjs/commit/d8b0d72b84a1af6e87c58b738d9f9b41e98af698))
* export isLimitError, document that rawTags replaces the default list, and complete the upstream merge steps ([8297513](https://github.com/Debutifycorp/liquidjs/commit/82975138e5e6de9e655d2a93437cd8a181af17a5))
* keep the liquidjs and liquid CLI bins in the published package ([9a2d304](https://github.com/Debutifycorp/liquidjs/commit/9a2d3045d00c91639b0573538f8d1f0eb61d7a7a))
* merge equal decimals in uniq under numberSemantics ruby ([2f22b3a](https://github.com/Debutifycorp/liquidjs/commit/2f22b3a74d787d192864804c2504bd6693f6f987))
* Shopify parity fixes found by liquid-spec ([dd25b3f](https://github.com/Debutifycorp/liquidjs/commit/dd25b3f5256f3926e4a87ec1b06915a16dbd48e6))
* **shopify:** give every render its own state and honour the engine's runtime, globals and strictFilters ([2d95e87](https://github.com/Debutifycorp/liquidjs/commit/2d95e8768499ff8cb3f8e852e959b6fe9e3dca75))
* **shopify:** load the CJS builds in Node so require and import share one copy ([2afc952](https://github.com/Debutifycorp/liquidjs/commit/2afc952869c51bb30b174b7e5b7f73fd489e1ff2))
* unwrap join and reverse input like upstream and trim the default render path ([e230e06](https://github.com/Debutifycorp/liquidjs/commit/e230e0671232bd635982f5c0fa5a96798caa23fd))


### Features

* inline render errors as Shopify writes them ([b79f6ec](https://github.com/Debutifycorp/liquidjs/commit/b79f6ecb56a6d3664e567325d485f6aed0e5ca83))
* raw-body tags and a nesting comment through the rawTags option ([105e8e0](https://github.com/Debutifycorp/liquidjs/commit/105e8e0282460d7efb76dba4609ad557de226f23))
* ruby number semantics keep whole numbers and decimals apart ([63c168d](https://github.com/Debutifycorp/liquidjs/commit/63c168de0cabdfac6f2b4f6cf7d4f71de1b0ab29))
* **shopify:** add the @debutify/liquidjs/shopify entry with the Shopify preset and render report ([a45eac8](https://github.com/Debutifycorp/liquidjs/commit/a45eac8125d1cc7e4079ae3099006726bd0839f5))


### Upstream

Based on [LiquidJS 10.30.0](https://github.com/harttle/liquidjs/releases/tag/v10.30.0).

# [10.30.0](https://github.com/harttle/liquidjs/compare/v10.29.0...v10.30.0) (2026-10-01)


### Bug Fixes

* **base64_encode:** encode large input in browser builds ([#969](https://github.com/harttle/liquidjs/issues/969)) ([8aace78](https://github.com/harttle/liquidjs/commit/8aace78beb4c6b67ec1cc10cf519c82d5ffa6f3f)), closes [#967](https://github.com/harttle/liquidjs/issues/967)
* **date:** compute %C and %y from the numeric year ([#961](https://github.com/harttle/liquidjs/issues/961)) ([e68514f](https://github.com/harttle/liquidjs/commit/e68514f0667c958b578d580d11482ae881d7b803))
* **date:** compute %U and %W week numbers like strftime ([#958](https://github.com/harttle/liquidjs/issues/958)) ([0587ca8](https://github.com/harttle/liquidjs/commit/0587ca803fe8ce7c8cbf2769e8904ffbc67a0e58))
* trim custom characters by Unicode code point ([#955](https://github.com/harttle/liquidjs/issues/955)) ([3fe244f](https://github.com/harttle/liquidjs/commit/3fe244f0610af74305d1c5b928ccf0fceed0b027))
* **truncatewords:** ignore leading whitespace when counting words ([#954](https://github.com/harttle/liquidjs/issues/954)) ([65e200e](https://github.com/harttle/liquidjs/commit/65e200e22debb080073ea8adb17829789df72b4b))
* **url_decode:** keep %2B as a literal plus when decoding ([#939](https://github.com/harttle/liquidjs/issues/939)) ([9af92f5](https://github.com/harttle/liquidjs/commit/9af92f5d8cb318fd16739fb0afd1997356f4da83))


### Features

* await promises returned by Drop.valueOf() ([#948](https://github.com/harttle/liquidjs/issues/948)) ([#953](https://github.com/harttle/liquidjs/issues/953)) ([#959](https://github.com/harttle/liquidjs/issues/959)) ([7dfa76b](https://github.com/harttle/liquidjs/commit/7dfa76b7b2559f46b71e993e002e3f434ca30814))

# [10.29.0](https://github.com/harttle/liquidjs/compare/v10.28.0...v10.29.0) (2026-08-11)


### Features

* add unregisterFilter method ([#946](https://github.com/harttle/liquidjs/issues/946)) ([69b2c58](https://github.com/harttle/liquidjs/commit/69b2c589f9b69a34427cb8533ddb938bd997914f))
* **filters:** add squish filter ([#943](https://github.com/harttle/liquidjs/issues/943)) ([875513f](https://github.com/harttle/liquidjs/commit/875513f4c5136bed0c64562cccabb21a7db8d36c))

# [10.28.0](https://github.com/harttle/liquidjs/compare/v10.27.2...v10.28.0) (2026-08-01)


### Bug Fixes

* **date:** %s returns Unix epoch unaffected by display timezone ([#932](https://github.com/harttle/liquidjs/issues/932)) ([39c8743](https://github.com/harttle/liquidjs/commit/39c87437c5ef38ede9a208c9d55cd13231c6c023)), closes [#931](https://github.com/harttle/liquidjs/issues/931)


### Features

* Add support of inner expressions enclosed by parentheses ([#863](https://github.com/harttle/liquidjs/issues/863)) ([afa5f54](https://github.com/harttle/liquidjs/commit/afa5f5400428fc1ec935aca0282e579224660c95))

## [10.27.2](https://github.com/harttle/liquidjs/compare/v10.27.1...v10.27.2) (2026-07-09)


### Bug Fixes

* charge join/json/inspect filters by produced output size ([#925](https://github.com/harttle/liquidjs/issues/925)) ([7ab49f9](https://github.com/harttle/liquidjs/commit/7ab49f999ac045ec1e87f3a7a9fd68dd9e8602b3))
* **date:** zero-pad milliseconds when formatting %N fractional seconds ([#929](https://github.com/harttle/liquidjs/issues/929)) ([2634f9d](https://github.com/harttle/liquidjs/commit/2634f9de7b1228cd887b7cab880af8a795c77053))
* enforce ownPropertyOnly for inherited array indices ([#924](https://github.com/harttle/liquidjs/issues/924)) ([552819a](https://github.com/harttle/liquidjs/commit/552819a84b80c62306fe61072628a756272dc749))
* **filters:** modulo should follow divisor sign for negative operands ([#922](https://github.com/harttle/liquidjs/issues/922)) ([568bd5f](https://github.com/harttle/liquidjs/commit/568bd5f9cb99f596292c09fd70b00284b8216f0c))
* **filters:** return empty for out-of-range slice begin or negative length ([#928](https://github.com/harttle/liquidjs/issues/928)) ([f9a1316](https://github.com/harttle/liquidjs/commit/f9a1316d161f4f20018c833160f42dfcf0cde507))

## [10.27.1](https://github.com/harttle/liquidjs/compare/v10.27.0...v10.27.1) (2026-06-23)


### Bug Fixes

* improve round function; improvement to [#873](https://github.com/harttle/liquidjs/issues/873) ([#901](https://github.com/harttle/liquidjs/issues/901)) ([956b51e](https://github.com/harttle/liquidjs/commit/956b51ea953eb52d9eba7409b7f51e379023fec4))
* **security:** charge pop filter allocation to memoryLimit ([#907](https://github.com/harttle/liquidjs/issues/907)) ([8a0c74a](https://github.com/harttle/liquidjs/commit/8a0c74a7fcb1671aa1dcb71ec82ba0602dc90d04))
* **strip_html:** infinite loop for strip_html ([5c3522f](https://github.com/harttle/liquidjs/commit/5c3522f33928aae66f0fe85c36e1d9015c768fe2))


### Performance Improvements

* **parser:** memoize createTrie to avoid rebuilding tries per Tokenizer ([#911](https://github.com/harttle/liquidjs/issues/911)) ([3a0d80d](https://github.com/harttle/liquidjs/commit/3a0d80d1f4526af0fbca2bb2e0a9c51669d2fd3e))

# [10.27.0](https://github.com/harttle/liquidjs/compare/v10.26.0...v10.27.0) (2026-05-15)


### Features

* **context:** null-prototype scope frames via createScope ([#899](https://github.com/harttle/liquidjs/issues/899)) ([47d3f1b](https://github.com/harttle/liquidjs/commit/47d3f1b1cf33be91fe587821f288d1c9d8e1ace7))

# [10.26.0](https://github.com/harttle/liquidjs/compare/v10.25.7...v10.26.0) (2026-05-14)


### Bug Fixes

* **date:** cap strftime widths and account padding in memoryLimit ([#895](https://github.com/harttle/liquidjs/issues/895)) ([3129d46](https://github.com/harttle/liquidjs/commit/3129d46dc95efa357b00e5a57ee1af80a13d72ed))
* enforce renderLimit for empty renderTemplates calls ([#894](https://github.com/harttle/liquidjs/issues/894)) ([5b9c346](https://github.com/harttle/liquidjs/commit/5b9c3469085e01c79e2d0af28e2a13f730e1793d))
* propagate ownPropertyOnly into Context.spawn() for {% render %} ([#893](https://github.com/harttle/liquidjs/issues/893)) ([dbbf628](https://github.com/harttle/liquidjs/commit/dbbf6288030591bf6da28d8c1cce5a17bca97bb6))
* **security:** block Object.prototype filter/tag lookups (RCE) ([#897](https://github.com/harttle/liquidjs/issues/897)) ([457fae0](https://github.com/harttle/liquidjs/commit/457fae0736c3ec862539b9dbf7f477e6c08fb6c6))
* strip html newline tags ([#892](https://github.com/harttle/liquidjs/issues/892)) ([26ea285](https://github.com/harttle/liquidjs/commit/26ea2856c7a90aec892b98d94a9b7a3e18539045))
* **strip_html:** rewrite as linear single-pass scan to avoid ReDoS ([#896](https://github.com/harttle/liquidjs/issues/896)) ([3616a74](https://github.com/harttle/liquidjs/commit/3616a744b9abeb425c217b340a2397d46176afb8))


### Features

* add sha256 and hmac_sha256 filters for cryptographic operations ([#889](https://github.com/harttle/liquidjs/issues/889)) ([1c816d4](https://github.com/harttle/liquidjs/commit/1c816d4fc3bcd2cba011f7a84f56a4251fca0622))

## [10.25.7](https://github.com/harttle/liquidjs/compare/v10.25.6...v10.25.7) (2026-04-23)


### Bug Fixes

* **filters:** support Buffer input in base64_encode to prevent binary data corruption ([#881](https://github.com/harttle/liquidjs/issues/881)) ([0ee6dbb](https://github.com/harttle/liquidjs/commit/0ee6dbb511aa926f6d490293282060abf3bab37f))

## [10.25.6](https://github.com/harttle/liquidjs/compare/v10.25.5...v10.25.6) (2026-04-19)


### Bug Fixes

* nested block for layout ([#883](https://github.com/harttle/liquidjs/issues/883)) ([e2311df](https://github.com/harttle/liquidjs/commit/e2311dfd6e82f73509308aa8a3a1fafc92e226f0))

## [10.25.5](https://github.com/harttle/liquidjs/compare/v10.25.4...v10.25.5) (2026-04-07)


### Bug Fixes

* enforce root containment for renderFile/parseFile lookups ([#870](https://github.com/harttle/liquidjs/issues/870)) ([f41c1fc](https://github.com/harttle/liquidjs/commit/f41c1fc02fe901598f3328118b42b13bc6bc9b04))
* null date should return empty ([#868](https://github.com/harttle/liquidjs/issues/868)) ([#872](https://github.com/harttle/liquidjs/issues/872)) ([4f9a499](https://github.com/harttle/liquidjs/commit/4f9a49988a93c156524981e189a4fec238e682b8))
* rounding negative away from zero when half ([#873](https://github.com/harttle/liquidjs/issues/873)) ([1cdf10b](https://github.com/harttle/liquidjs/commit/1cdf10b57d82f0592414efbfca19e204b37aea9f))

## [10.25.4](https://github.com/harttle/liquidjs/compare/v10.25.3...v10.25.4) (2026-04-07)


### Bug Fixes

* sort and sort_natural filters bypass ownPropertyOnly ([#869](https://github.com/harttle/liquidjs/issues/869)) ([e743da0](https://github.com/harttle/liquidjs/commit/e743da0020d34e2ee547e1cc1a86b58377ebe1ce))

## [10.25.3](https://github.com/harttle/liquidjs/compare/v10.25.2...v10.25.3) (2026-04-06)


### Bug Fixes

* precise memoryLimit for string replace ([abc058b](https://github.com/harttle/liquidjs/commit/abc058be0f33d6372cd2216f4945183167abeb25))
* use realpath for fs.contains ([#867](https://github.com/harttle/liquidjs/issues/867)) ([529dd67](https://github.com/harttle/liquidjs/commit/529dd67eeb6b125637623d6a723601f0938d3613))

## [10.25.2](https://github.com/harttle/liquidjs/compare/v10.25.1...v10.25.2) (2026-03-25)


### Bug Fixes

* handle undefined replacement argument in replace filter ([#864](https://github.com/harttle/liquidjs/issues/864)) ([0ad2b11](https://github.com/harttle/liquidjs/commit/0ad2b11ab15e7da608a9ef936b2a00a6a6517038))

## [10.25.1](https://github.com/harttle/liquidjs/compare/v10.25.0...v10.25.1) (2026-03-22)


### Bug Fixes

* mem limiter for invalid ranges ([95ddefc](https://github.com/harttle/liquidjs/commit/95ddefc056a11a44d9e753fd47a39db2c241e578))
* treat args for replace_first as literal ([35d5230](https://github.com/harttle/liquidjs/commit/35d523026345d80458df24c72e653db78b5d061d))

# [10.25.0](https://github.com/harttle/liquidjs/compare/v10.24.0...v10.25.0) (2026-03-07)


### Bug Fixes

* path traversal vulnerability, [#851](https://github.com/harttle/liquidjs/issues/851) ([#855](https://github.com/harttle/liquidjs/issues/855)) ([3cd024d](https://github.com/harttle/liquidjs/commit/3cd024d652dc883c46307581e979fe32302adbac))


### Features

* export error types, resolving [#837](https://github.com/harttle/liquidjs/issues/837) ([#840](https://github.com/harttle/liquidjs/issues/840)) ([71aa1b1](https://github.com/harttle/liquidjs/commit/71aa1b1998a3a66e536af67c6ea8947a28616eaf))

# [10.24.0](https://github.com/harttle/liquidjs/compare/v10.23.0...v10.24.0) (2025-10-27)


### Features

* **filters:** Add base64_encode and base64_decode filters for Shopify compatibility ([#828](https://github.com/harttle/liquidjs/issues/828)) ([86fc135](https://github.com/harttle/liquidjs/commit/86fc135d9ec0137689faf150535b9315e75ecc30))

# [10.23.0](https://github.com/harttle/liquidjs/compare/v10.22.0...v10.23.0) (2025-10-23)


### Features

* Export specific tokens as types ([#824](https://github.com/harttle/liquidjs/issues/824)) ([4f7d2fd](https://github.com/harttle/liquidjs/commit/4f7d2fd84a8884e1009b13346d331a99b9721149))

# [10.22.0](https://github.com/harttle/liquidjs/compare/v10.21.1...v10.22.0) (2025-10-06)


### Bug Fixes

* math filters coerce invalid string to 0, [#813](https://github.com/harttle/liquidjs/issues/813) ([#819](https://github.com/harttle/liquidjs/issues/819)) ([e8e502c](https://github.com/harttle/liquidjs/commit/e8e502c5854c9649bf7611a671a068dc260011d1))


### Features

* allow context access in liquidMethodMissing, [#808](https://github.com/harttle/liquidjs/issues/808) ([#820](https://github.com/harttle/liquidjs/issues/820)) ([e551288](https://github.com/harttle/liquidjs/commit/e55128850e507687f9d85a012fc3a72ac2550f3b))

## [10.21.1](https://github.com/harttle/liquidjs/compare/v10.21.0...v10.21.1) (2025-05-14)


### Bug Fixes

* block.super with strictVariables, [#806](https://github.com/harttle/liquidjs/issues/806) ([#807](https://github.com/harttle/liquidjs/issues/807)) ([025c40f](https://github.com/harttle/liquidjs/commit/025c40f0f2f13efa62193c61d2fa56943917ac3c))

# [10.21.0](https://github.com/harttle/liquidjs/compare/v10.20.3...v10.21.0) (2025-02-23)


### Features

* add find_index, has, and reject filters ([#799](https://github.com/harttle/liquidjs/issues/799)) ([0deb93e](https://github.com/harttle/liquidjs/commit/0deb93eeae4f530901e9a7d099bcc47207ad7385))

## [10.20.3](https://github.com/harttle/liquidjs/compare/v10.20.2...v10.20.3) (2025-02-09)


### Bug Fixes

* empty tagToken.args since 10.20.0, fixes [#796](https://github.com/harttle/liquidjs/issues/796) ([38a0f51](https://github.com/harttle/liquidjs/commit/38a0f510b0a14baf35a368e9f07b536253394d06))

## [10.20.2](https://github.com/harttle/liquidjs/compare/v10.20.1...v10.20.2) (2025-01-19)


### Bug Fixes

* consistent range syntax parsing, [#791](https://github.com/harttle/liquidjs/issues/791) ([a490a70](https://github.com/harttle/liquidjs/commit/a490a70da1ca2b479065c6618207bf4789db6b4f))
* context for group_by_exp/where_exp/find_exp, [#790](https://github.com/harttle/liquidjs/issues/790) ([a5070af](https://github.com/harttle/liquidjs/commit/a5070af3e4b4d1ae3b6398c6638b130e50e1cf6e))

## [10.20.1](https://github.com/harttle/liquidjs/compare/v10.20.0...v10.20.1) (2025-01-04)


### Bug Fixes

* break/continue stops whole template, [#783](https://github.com/harttle/liquidjs/issues/783) ([5f1a4cf](https://github.com/harttle/liquidjs/commit/5f1a4cfdc9d6bde31ce86ddc88b8f4bdf52f7893))
* enumerate plain objects in where/where_exp, [#785](https://github.com/harttle/liquidjs/issues/785) ([#788](https://github.com/harttle/liquidjs/issues/788)) ([25ef104](https://github.com/harttle/liquidjs/commit/25ef104446731f4b6cb3a2e78f4d3b99efb635f4))
* preserveTimezones support for RFC2822 date, [#784](https://github.com/harttle/liquidjs/issues/784) ([59cf3c0](https://github.com/harttle/liquidjs/commit/59cf3c08dbc5f2e5b109ffcb5375ae738b5ac386))

# [10.20.0](https://github.com/harttle/liquidjs/compare/v10.19.1...v10.20.0) (2024-12-28)


### Features

* `size`, `first`, `last` support arraylike objects, [#781](https://github.com/harttle/liquidjs/issues/781) ([35a8442](https://github.com/harttle/liquidjs/commit/35a84421a622b3a6657946b9395839da2b8e154a))
* static variable analysis ([#770](https://github.com/harttle/liquidjs/issues/770)) ([3492ff6](https://github.com/harttle/liquidjs/commit/3492ff63f40abb8ff8adb8b6b0ce29408f99e19b))

## [10.19.1](https://github.com/harttle/liquidjs/compare/v10.19.0...v10.19.1) (2024-12-22)


### Bug Fixes

* add sideEffects=false to package.json ([734eb52](https://github.com/harttle/liquidjs/commit/734eb52b987d46d33cf8f03281a3773a0f1f0e4a))
* inconsistent continue behaviour, fixes [#779](https://github.com/harttle/liquidjs/issues/779) ([e3ef574](https://github.com/harttle/liquidjs/commit/e3ef574674c5a21a37b3ffc929f514c8a3d0b866))
* memoryLimit doesn't work in for tag, [#776](https://github.com/harttle/liquidjs/issues/776) ([2af297f](https://github.com/harttle/liquidjs/commit/2af297f81ac465feb3277ba7b92f7236409370b0))

# [10.19.0](https://github.com/harttle/liquidjs/compare/v10.18.0...v10.19.0) (2024-11-17)


### Features

* allow drops in property access ([#769](https://github.com/harttle/liquidjs/issues/769)) ([11f013b](https://github.com/harttle/liquidjs/commit/11f013bf249f1366306c1f0d728d45a95eb2df1a))
* support Jekyll style `where`, [#768](https://github.com/harttle/liquidjs/issues/768) ([9107eb1](https://github.com/harttle/liquidjs/commit/9107eb1b93f5c11dca0ee0f0d2c1c8243849c3ab))

# [10.18.0](https://github.com/harttle/liquidjs/compare/v10.17.0...v10.18.0) (2024-10-16)


### Features

* expose FilterToken to filter `this`, [#762](https://github.com/harttle/liquidjs/issues/762) ([d705888](https://github.com/harttle/liquidjs/commit/d705888c8d46d9dd95fcb41c0fb7bfbaf647eddd))

# [10.17.0](https://github.com/harttle/liquidjs/compare/v10.16.7...v10.17.0) (2024-09-22)


### Features

* support custom key-value separator, [#752](https://github.com/harttle/liquidjs/issues/752) ([6aeed25](https://github.com/harttle/liquidjs/commit/6aeed2586a70a5bd4f878d2cb32547e35677458d))

## [10.16.7](https://github.com/harttle/liquidjs/compare/v10.16.6...v10.16.7) (2024-08-29)


### Bug Fixes

* use CommonJS bundle to support default export ([2543461](https://github.com/harttle/liquidjs/commit/25434618808d8ab437ce4606d59114b4ad849f7f))
* use cwd to resolve npm partials for Node.JS ([e5fbdfe](https://github.com/harttle/liquidjs/commit/e5fbdfe43415c9f78408f1349873c0011f639d82))

## [10.16.6](https://github.com/harttle/liquidjs/compare/v10.16.5...v10.16.6) (2024-08-29)


### Bug Fixes

* expose originalError from LiquidError, [#742](https://github.com/harttle/liquidjs/issues/742) ([86f6bf0](https://github.com/harttle/liquidjs/commit/86f6bf0d3198354af23bcdb298c6625a6c5a4dde))

## [10.16.5](https://github.com/harttle/liquidjs/compare/v10.16.4...v10.16.5) (2024-08-27)


### Bug Fixes

* ESM bundle for Node.js, [#739](https://github.com/harttle/liquidjs/issues/739) ([ce84cd6](https://github.com/harttle/liquidjs/commit/ce84cd6f43c8e076ce9d2507b2b7f3395fcd1328))

## [10.16.4](https://github.com/harttle/liquidjs/compare/v10.16.3...v10.16.4) (2024-08-23)


### Bug Fixes

* "filter is not a function" for uniq ([68387c3](https://github.com/harttle/liquidjs/commit/68387c31ead77862a634f857a64932ef07b85188))
* memory limit issue for join filter, fix [#737](https://github.com/harttle/liquidjs/issues/737) ([2d59cff](https://github.com/harttle/liquidjs/commit/2d59cff0a6162b462b4d97ebea4e0dbaf6146b65))

## [10.16.3](https://github.com/harttle/liquidjs/compare/v10.16.2...v10.16.3) (2024-08-16)


### Bug Fixes

* support for NodeJS 15, fixes [#732](https://github.com/harttle/liquidjs/issues/732) ([4548c11](https://github.com/harttle/liquidjs/commit/4548c1140629bf270d163a403c2994d785c7f710))

## [10.16.2](https://github.com/harttle/liquidjs/compare/v10.16.1...v10.16.2) (2024-08-15)


### Bug Fixes

* support for NodeJS 14 ([85bd0d3](https://github.com/harttle/liquidjs/commit/85bd0d35a6d949a02db49ba546407fe5be17db5e))

## [10.16.1](https://github.com/harttle/liquidjs/compare/v10.16.0...v10.16.1) (2024-07-25)


### Bug Fixes

* parser throws on non-string input, [#726](https://github.com/harttle/liquidjs/issues/726) ([21a8223](https://github.com/harttle/liquidjs/commit/21a822348f3c315dae56fba2674ad3db0cf2f80d))

# [10.16.0](https://github.com/harttle/liquidjs/compare/v10.15.0...v10.16.0) (2024-07-21)


### Features

* locale support for date filter, [#567](https://github.com/harttle/liquidjs/issues/567) ([#723](https://github.com/harttle/liquidjs/issues/723)) ([e4aeb02](https://github.com/harttle/liquidjs/commit/e4aeb023fddf5ead90db209599cfd99450274658))

# [10.15.0](https://github.com/harttle/liquidjs/compare/v10.14.0...v10.15.0) (2024-07-09)


### Bug Fixes

* report error for malformed else/elsif/endif/endfor, [#713](https://github.com/harttle/liquidjs/issues/713) ([22b5a12](https://github.com/harttle/liquidjs/commit/22b5a123333a066aaf7dff580df061e7cd6aa7b2))


### Features

* DoS prevention, [#250](https://github.com/harttle/liquidjs/issues/250) ([e443068](https://github.com/harttle/liquidjs/commit/e443068cb9281883ff0fe9f755a15f52ada4e7e2))
* support in-memory template mapping, inspired by [@jg-rp](https://github.com/jg-rp) [#714](https://github.com/harttle/liquidjs/issues/714) ([df27ac6](https://github.com/harttle/liquidjs/commit/df27ac694739496982012432077fe28b1476662a))

# [10.14.0](https://github.com/harttle/liquidjs/compare/v10.13.1...v10.14.0) (2024-06-17)


### Bug Fixes

* use drop `valueOf` when evaluated as condition ([#705](https://github.com/harttle/liquidjs/issues/705)) ([a7da93f](https://github.com/harttle/liquidjs/commit/a7da93ff0f2c1c66f9c85b45ffcc1326c23254c7))


### Features

* support catching all errors, [#220](https://github.com/harttle/liquidjs/issues/220) ([#710](https://github.com/harttle/liquidjs/issues/710)) ([3b5627b](https://github.com/harttle/liquidjs/commit/3b5627b04072b1d6703ef5ba782a3a0f26fd2a60))

## [10.13.1](https://github.com/harttle/liquidjs/compare/v10.13.0...v10.13.1) (2024-05-24)


### Bug Fixes

* allow liquidMethodMissing to return any supported value type ([#698](https://github.com/harttle/liquidjs/issues/698)) ([0983f2c](https://github.com/harttle/liquidjs/commit/0983f2c42012b2b97258d0cdcb07b6d43c904814))
* isComparable full interface check ([#701](https://github.com/harttle/liquidjs/issues/701)) ([55e144a](https://github.com/harttle/liquidjs/commit/55e144a0298047349d55d8483a46b2513303d940))

# [10.13.0](https://github.com/harttle/liquidjs/compare/v10.12.0...v10.13.0) (2024-05-13)


### Features

* array_to_sentence_string and number_of_words filters from Jekyll, [#443](https://github.com/harttle/liquidjs/issues/443) ([50253a9](https://github.com/harttle/liquidjs/commit/50253a98caf5356d3c33e148be66f34fbe75a204))
* date filters from Jekyll ([4955e75](https://github.com/harttle/liquidjs/commit/4955e75be7f38a3fd15e71f2c192cff6f0d6e2d5))
* escape filters from Jekyll, [#443](https://github.com/harttle/liquidjs/issues/443) ([b12eb8a](https://github.com/harttle/liquidjs/commit/b12eb8ab4b58b002459725b6c0ed00159cdc15e6))
* jsonify, inspect, to_integer, normalize_whitespace filters ([842b45c](https://github.com/harttle/liquidjs/commit/842b45c96a46290a1e1ba43fc5cc7a465f4ba9de))
* slugify filter from Jekyll, [#443](https://github.com/harttle/liquidjs/issues/443) ([47ddc11](https://github.com/harttle/liquidjs/commit/47ddc1193b84bbdeb8d48457bb5aead24d5aff77))

# [10.12.0](https://github.com/harttle/liquidjs/compare/v10.11.1...v10.12.0) (2024-04-28)


### Bug Fixes

* case/when array equality, [#673](https://github.com/harttle/liquidjs/issues/673) ([2b63035](https://github.com/harttle/liquidjs/commit/2b630353c478368cb36dbfcb38961b25bf48249e))


### Features

* introduce where_exp filter from Jekyll ([8c7cef9](https://github.com/harttle/liquidjs/commit/8c7cef9f95cda765164ada8d58af7d402b3d3143))

## [10.11.1](https://github.com/harttle/liquidjs/compare/v10.11.0...v10.11.1) (2024-04-21)


### Bug Fixes

* allow %Z for TimezoneDate, update docs accordingly [#684](https://github.com/harttle/liquidjs/issues/684) ([e09657c](https://github.com/harttle/liquidjs/commit/e09657c52b5e9920256d73f99455e2e81cadf065))
* Allow `lenientIf` for multiple operands (issue [#682](https://github.com/harttle/liquidjs/issues/682)) ([#683](https://github.com/harttle/liquidjs/issues/683)) ([490ff43](https://github.com/harttle/liquidjs/commit/490ff4309cc231a25be23df5374a5d032aac144e))

# [10.11.0](https://github.com/harttle/liquidjs/compare/v10.10.2...v10.11.0) (2024-04-14)


### Features

* group_by/group_by_exp/find/find_exp from Jekyll, [#443](https://github.com/harttle/liquidjs/issues/443) ([2b713b7](https://github.com/harttle/liquidjs/commit/2b713b721d1f355309a70ebb5846169c6c03c523))
* pop/shift/unshift filters from Jekyll ([258780e](https://github.com/harttle/liquidjs/commit/258780e9a87ce87534a6bb4336725cb1d38a2998))

## [10.10.2](https://github.com/harttle/liquidjs/compare/v10.10.1...v10.10.2) (2024-03-21)


### Bug Fixes

* contains regression ([#677](https://github.com/harttle/liquidjs/issues/677)) ([05223c4](https://github.com/harttle/liquidjs/commit/05223c4378f9474f4e658af36cb8272e161d681f)), closes [#675](https://github.com/harttle/liquidjs/issues/675)

## [10.10.1](https://github.com/harttle/liquidjs/compare/v10.10.0...v10.10.1) (2024-02-18)


### Bug Fixes

* in conditionals, don't render anything after an else branch ([#671](https://github.com/harttle/liquidjs/issues/671)) ([f816955](https://github.com/harttle/liquidjs/commit/f81695570491ede77975de2c26a07612a2d62c28))
* Rely on equal for computing contains ([#668](https://github.com/harttle/liquidjs/issues/668)) ([1937aa1](https://github.com/harttle/liquidjs/commit/1937aa1f1dce01ee6332f39a6e658e85cbe4f30b))

# [10.10.0](https://github.com/harttle/liquidjs/compare/v10.9.4...v10.10.0) (2023-12-19)


### Features

* Array sum filter ([#661](https://github.com/harttle/liquidjs/issues/661)) ([629d958](https://github.com/harttle/liquidjs/commit/629d958b86a97ddf2921d2285b7c9ea83430004e))

## [10.9.4](https://github.com/harttle/liquidjs/compare/v10.9.3...v10.9.4) (2023-11-04)


### Bug Fixes

* allow unicode to be identifiers, fixes [#655](https://github.com/harttle/liquidjs/issues/655) ([dd7616a](https://github.com/harttle/liquidjs/commit/dd7616acb9a71b77f39d2fa24b6f68a7caef87f1))

## [10.9.3](https://github.com/harttle/liquidjs/compare/v10.9.2...v10.9.3) (2023-10-15)


### Bug Fixes

* package version in released files ([67a5b22](https://github.com/harttle/liquidjs/commit/67a5b229ca9ccabb4aee42bbb5c9f03d4076786a))

## [10.9.2](https://github.com/harttle/liquidjs/compare/v10.9.1...v10.9.2) (2023-08-28)


### Bug Fixes

* handle windows newlines on `newline_to_br` and `strip_newlines` ([88aa63f](https://github.com/harttle/liquidjs/commit/88aa63fd58b5a5824c031acc6f3e4072bedd262f))
* sort and where bug when using `strictVariables` ([8af682d](https://github.com/harttle/liquidjs/commit/8af682d2ca68de99bafd4a7055e4912eeb318f57))

## [10.9.1](https://github.com/harttle/liquidjs/compare/v10.9.0...v10.9.1) (2023-08-23)


### Bug Fixes

* map filter allow nil results in strict mode, fixes [#647](https://github.com/harttle/liquidjs/issues/647) ([45adbd7](https://github.com/harttle/liquidjs/commit/45adbd7008296a94da04d21a35917f744a0f4109))

# [10.9.0](https://github.com/harttle/liquidjs/compare/v10.8.4...v10.9.0) (2023-08-22)


### Bug Fixes

* case should allow multiple values separated by or ([b8e7e2d](https://github.com/harttle/liquidjs/commit/b8e7e2d9467b17ca786e6fb422e9579dd178de76))
* for throws undefined var with a null value with strictVariables ([dc6a301](https://github.com/harttle/liquidjs/commit/dc6a3013874872ac85f1fbe5184c74631122d851))
* remove_last was eating an extra character ([fc27313](https://github.com/harttle/liquidjs/commit/fc2731376f8ef59ac7160f97cef1fb5d94f053db))


### Features

* more flexible squared property read expression, fixes [#643](https://github.com/harttle/liquidjs/issues/643) ([#646](https://github.com/harttle/liquidjs/issues/646)) ([660d9be](https://github.com/harttle/liquidjs/commit/660d9be55f8eac16ca5ac77fd0b38b0d7f94961e))

## [10.8.4](https://github.com/harttle/liquidjs/compare/v10.8.3...v10.8.4) (2023-07-07)


### Bug Fixes

* allow quotes in inline comment tag, fixes [#628](https://github.com/harttle/liquidjs/issues/628) ([bf425c3](https://github.com/harttle/liquidjs/commit/bf425c3adb929e68fa234bee8397560a436595bb))

## [10.8.3](https://github.com/harttle/liquidjs/compare/v10.8.2...v10.8.3) (2023-06-16)


### Bug Fixes

* strftime getSuffix works for all dates ([0b4e2a9](https://github.com/harttle/liquidjs/commit/0b4e2a99790347bea0ab5f7d651f2330e3054601))

## [10.8.2](https://github.com/harttle/liquidjs/compare/v10.8.1...v10.8.2) (2023-06-04)


### Bug Fixes

* sample filter randomness and count=1 case ([fcb930f](https://github.com/harttle/liquidjs/commit/fcb930f0ddf2489fa74cd323f24398d7e9f7717f))

## [10.8.1](https://github.com/harttle/liquidjs/compare/v10.8.0...v10.8.1) (2023-06-04)


### Bug Fixes

* incorrect error message for browser UMD bundle ([3a67eb7](https://github.com/harttle/liquidjs/commit/3a67eb7f1cc7e54d2ec94a985eca4c1f147cdd61))

# [10.8.0](https://github.com/harttle/liquidjs/compare/v10.7.1...v10.8.0) (2023-06-03)


### Bug Fixes

* proper error message for filter syntax error, [#610](https://github.com/harttle/liquidjs/issues/610) ([0480d33](https://github.com/harttle/liquidjs/commit/0480d3317d0e46519ad2adf4ac43f53cddf467c6))
* sed invocations to work out of the box on macOS ([#615](https://github.com/harttle/liquidjs/issues/615)) ([87d4cc7](https://github.com/harttle/liquidjs/commit/87d4cc7e14ece14161285a740be63afc8a88b63c))


### Features

* Add support for the Jekyll sample filter ([#612](https://github.com/harttle/liquidjs/issues/612)) ([ba8b842](https://github.com/harttle/liquidjs/commit/ba8b84245266589e43c0e70d99e12b981d349809))
* Add support for the Jekyll push filter ([#611](https://github.com/harttle/liquidjs/issues/611))
* introduce a matrix with latest Ubuntu and macOS to test the build on macOS as well ([82ba548](https://github.com/harttle/liquidjs/commit/82ba54845f4cd4e1e7660c1557e3cfaa22d68924)), closes [#615](https://github.com/harttle/liquidjs/issues/615)
* precise line/col for tokenization Error, [#613](https://github.com/harttle/liquidjs/issues/613) ([e347e60](https://github.com/harttle/liquidjs/commit/e347e603d76c039cec191d417deab34e7ef1f9a7))

## [10.7.1](https://github.com/harttle/liquidjs/compare/v10.7.0...v10.7.1) (2023-04-24)


### Bug Fixes

* incorrect timezone correction for DST dates, fixes [#604](https://github.com/harttle/liquidjs/issues/604) ([33b3c01](https://github.com/harttle/liquidjs/commit/33b3c010af0cd17a303621331feab0119ca840ce))
* timezoneOffset ignored in date when preserveTimezones is enabled, fixes [#605](https://github.com/harttle/liquidjs/issues/605) ([21ee27b](https://github.com/harttle/liquidjs/commit/21ee27b57503f9d57f228973e1699972484e6089))

# [10.7.0](https://github.com/harttle/liquidjs/compare/v10.6.2...v10.7.0) (2023-03-21)


### Bug Fixes

* update remove.md ([#601](https://github.com/harttle/liquidjs/issues/601)) ([1bddd60](https://github.com/harttle/liquidjs/commit/1bddd60b0191032d324526292027bc7fcd190dc1))


### Features

* JSON format by `space` in `json` filter ([7b87ea8](https://github.com/harttle/liquidjs/commit/7b87ea82d3d63420e548743c5a84a073f0cdad22))

## [10.6.2](https://github.com/harttle/liquidjs/compare/v10.6.1...v10.6.2) (2023-03-19)


### Bug Fixes

* sample FS in render-file.md ([#594](https://github.com/harttle/liquidjs/issues/594)) ([4542ddc](https://github.com/harttle/liquidjs/commit/4542ddcfc3d5e245112a119bf22f0e00cb925791))

## [10.6.1](https://github.com/harttle/liquidjs/compare/v10.6.0...v10.6.1) (2023-03-02)


### Bug Fixes

* [expression] apply value equal for arrays, [#589](https://github.com/harttle/liquidjs/issues/589) ([9c0dc5f](https://github.com/harttle/liquidjs/commit/9c0dc5fa39a31d477a5c5a2c5212034174bf0516))
* strip_html for multi line <script>/<style>/comments, [#70](https://github.com/harttle/liquidjs/issues/70) ([42d2590](https://github.com/harttle/liquidjs/commit/42d25902e855d3c06d5ead071bf55604f495c205))

# [10.6.0](https://github.com/harttle/liquidjs/compare/v10.5.0...v10.6.0) (2023-02-22)


### Features

* LiquidOptions.dateFormat to override default date format ([#587](https://github.com/harttle/liquidjs/issues/587)) ([3fb6646](https://github.com/harttle/liquidjs/commit/3fb66465c6fe1bf4dc2e1ace9157c23d0fc8f859))

# [10.5.0](https://github.com/harttle/liquidjs/compare/v10.4.0...v10.5.0) (2023-02-14)


### Bug Fixes

* "ownPropertyOnly" not respected when passed via "renderOptions" ([d489916](https://github.com/harttle/liquidjs/commit/d489916231779149e110183400e3e597b8ee02ba))


### Features

* Adds support for options to CLI and improves usability ([#586](https://github.com/harttle/liquidjs/issues/586)) ([24c8a1e](https://github.com/harttle/liquidjs/commit/24c8a1e3722e5359f02934e2814f9abfa888ee86))

# [10.4.0](https://github.com/harttle/liquidjs/compare/v10.3.3...v10.4.0) (2023-01-02)


### Features

* support `not` operator, [#575](https://github.com/harttle/liquidjs/issues/575) ([3f21382](https://github.com/harttle/liquidjs/commit/3f21382d43cafa1e32162e58adabd22d5c3709ed))
* support calling `date` without format string, [#573](https://github.com/harttle/liquidjs/issues/573) ([aafaa0b](https://github.com/harttle/liquidjs/commit/aafaa0b4f9e84f466fbcc2cb2ae37fe8704c5272))

## [10.3.3](https://github.com/harttle/liquidjs/compare/v10.3.2...v10.3.3) (2022-12-18)


### Bug Fixes

* type compatible with v9 tag definition, support `Context` as scope in various render APIs, [#570](https://github.com/harttle/liquidjs/issues/570) ([fb6a9f8](https://github.com/harttle/liquidjs/commit/fb6a9f8717cd57522d53687da7e4718b28a7f68a))

## [10.3.2](https://github.com/harttle/liquidjs/compare/v10.3.1...v10.3.2) (2022-12-13)


### Bug Fixes

* re-export error classes, [#569](https://github.com/harttle/liquidjs/issues/569) ([2663ee1](https://github.com/harttle/liquidjs/commit/2663ee16a066c74cbd387fe40154fdeb2136f35a))

## [10.3.1](https://github.com/harttle/liquidjs/compare/v10.3.0...v10.3.1) (2022-12-12)


### Bug Fixes

* support `Context` as `evalValue` parameter, [#568](https://github.com/harttle/liquidjs/issues/568) ([0f4916b](https://github.com/harttle/liquidjs/commit/0f4916bc5a93f5e744e4246336c68f2e89774272))

# [10.3.0](https://github.com/harttle/liquidjs/compare/v10.2.0...v10.3.0) (2022-12-11)


### Features

* support disable outputEscape for specific filters, [#565](https://github.com/harttle/liquidjs/issues/565) ([e6db371](https://github.com/harttle/liquidjs/commit/e6db371519f0fb3b0068347cfb2016aed386c8fa))

# [10.2.0](https://github.com/harttle/liquidjs/compare/v10.1.0...v10.2.0) (2022-12-02)


### Bug Fixes

* `case` should render multiple `when` statements ([d17813e](https://github.com/harttle/liquidjs/commit/d17813ef5217264bd08f741b0e1f713bedf2d464))


### Features

* add remove_last filter ([6c3f1c1](https://github.com/harttle/liquidjs/commit/6c3f1c1e0c0c5d30ef77eaf20df65e149e51e693))
* add replace_last filter ([b4d1e27](https://github.com/harttle/liquidjs/commit/b4d1e27420fcf36ae6d5dbc92cfe4a26299690f2))

# [10.1.0](https://github.com/harttle/liquidjs/compare/v10.0.0...v10.1.0) (2022-11-29)


### Features

* timezone name for `opts.timezoneOffset` and `date` argument, fixes [#553](https://github.com/harttle/liquidjs/issues/553) ([89c6c76](https://github.com/harttle/liquidjs/commit/89c6c7676d40f23090472a28cbf2fb22f93daad3))

# [10.0.0](https://github.com/harttle/liquidjs/compare/v9.43.0...v10.0.0) (2022-11-27)


### Code Refactoring

* rename filters to snake style, [#487](https://github.com/harttle/liquidjs/issues/487) ([ff112a4](https://github.com/harttle/liquidjs/commit/ff112a4750f91475e9eccdb301d7a468e895f6ca))
* `_evalToken` renamed to `evalToken` ([4e1a30a](https://github.com/harttle/liquidjs/commit/4e1a30a20c579408c87f2d28b9b6ec8e1dda65cc))
* change `ownPropertyOnly` default value to `true` ([7eb6216](https://github.com/harttle/liquidjs/commit/7eb621601c2b05d6e379e5ce42219f2b1f556208))
* delay creation of `operatorsTrie` and hide this implementation ([bb58d3e](https://github.com/harttle/liquidjs/commit/bb58d3e549dc5a5e067895ec4a0b3257b434f225))
* remove `toThenable` export ([ffefd91](https://github.com/harttle/liquidjs/commit/ffefd91fbc0195c589c8c34ae80f2017acfe557c))
* remove use of internal `Context` class in `evalValue` argument ([b115077](https://github.com/harttle/liquidjs/commit/b115077e122a7b90e7972d58174d68aea8edd7bf))


### Performance Improvements

* target Node.js 14 for cjs bundle (main entry) ([1f6ce7c](https://github.com/harttle/liquidjs/commit/1f6ce7c8224123cea318d1aa6c12aa091d6e0518))


### BREAKING CHANGES

* `evalToken` now returns a generator (LiquidJS async), which is different from `evalToken` in previous LiquidJS versions.
* main entry need Node.js>=14 to run, you can build LiquidJS by your own by using ESM entry.
* `ownPropertyOnly` default value changed to `true`
* `<liquidjs>.toThenable` is removed, use `<liquidjs>.toPromise` instead
* `evalValue` won't support `Context` as second argument anymore.
* use `operators` instead of `operatorsTrie` as Tokenizer constructor argument, #500
* keys in `<liquidjs>.filters` are now in snake case (instead of camel case), identical to that in Liquid template.

# [9.43.0](https://github.com/harttle/liquidjs/compare/v9.42.1...v9.43.0) (2022-11-27)


### Features

* support timezone offset argument for date filter, [#553](https://github.com/harttle/liquidjs/issues/553) ([7a71485](https://github.com/harttle/liquidjs/commit/7a714855df9ba188e2e82839d248f6623ce94a87))

## [9.42.1](https://github.com/harttle/liquidjs/compare/v9.42.0...v9.42.1) (2022-10-21)


### Bug Fixes

* truncatewords should use at least one word, [#537](https://github.com/harttle/liquidjs/issues/537) ([32f613f](https://github.com/harttle/liquidjs/commit/32f613fb43e90f97364ee6a020589992dbb553cf))

# [9.42.0](https://github.com/harttle/liquidjs/compare/v9.41.0...v9.42.0) (2022-08-27)


### Features

* promise in expression & nested property, [#533](https://github.com/harttle/liquidjs/issues/533) [#276](https://github.com/harttle/liquidjs/issues/276) ([bbf00f3](https://github.com/harttle/liquidjs/commit/bbf00f37bf6080d38ebc258d1921d3ff0d504186))

# [9.41.0](https://github.com/harttle/liquidjs/compare/v9.40.0...v9.41.0) (2022-08-24)


### Features

* use evalValue to parse & render expression, [#527](https://github.com/harttle/liquidjs/issues/527) ([071368a](https://github.com/harttle/liquidjs/commit/071368afe1c4fd36ebdb0e1d300c367db1766f7f))

# [9.40.0](https://github.com/harttle/liquidjs/compare/v9.39.2...v9.40.0) (2022-08-14)


### Bug Fixes

* target ES6 for ESM bundles, fixes [#526](https://github.com/harttle/liquidjs/issues/526) ([905a6dd](https://github.com/harttle/liquidjs/commit/905a6dd1491705c1154b6679a67c1eb1ffe7eef5))


### Features

* export toValueSync & defaultOptions to evaluate expression, see [#527](https://github.com/harttle/liquidjs/issues/527) ([e874b40](https://github.com/harttle/liquidjs/commit/e874b4060b46195e05a5cc6690626bdaa532154c))

## [9.39.2](https://github.com/harttle/liquidjs/compare/v9.39.1...v9.39.2) (2022-07-21)


### Bug Fixes

* expression support Drop.valueOf, fixes [#522](https://github.com/harttle/liquidjs/issues/522) ([4ad383d](https://github.com/harttle/liquidjs/commit/4ad383d9beb57f5683805decc1851778db64aea4))

## [9.39.1](https://github.com/harttle/liquidjs/compare/v9.39.0...v9.39.1) (2022-07-14)


### Bug Fixes

* throw ParseError instead of RenderError for invalid assign expression, closes [#519](https://github.com/harttle/liquidjs/issues/519) ([c41a5d5](https://github.com/harttle/liquidjs/commit/c41a5d5babf85ccedbcb3b6f9a3cf5c326f72ae1))

# [9.39.0](https://github.com/harttle/liquidjs/compare/v9.38.0...v9.39.0) (2022-07-09)


### Bug Fixes

* for tag not respecting Drop#valueOf(), fixes [#515](https://github.com/harttle/liquidjs/issues/515) ([c3e51ca](https://github.com/harttle/liquidjs/commit/c3e51caa701fd4449ed5257e23569a37ef12dea2))


### Features

* iteration protocols ([a19feea](https://github.com/harttle/liquidjs/commit/a19feea7c46fc476139a150bda051f485328afe8))

# [9.38.0](https://github.com/harttle/liquidjs/compare/v9.37.0...v9.38.0) (2022-07-07)


### Bug Fixes

* stack overflow on large number of templates, [#513](https://github.com/harttle/liquidjs/issues/513) ([3dc4290](https://github.com/harttle/liquidjs/commit/3dc4290b56265cfafbee8d9836e912d9b8492f90))


### Features

* inline comment tag ([#514](https://github.com/harttle/liquidjs/issues/514)) ([2f87708](https://github.com/harttle/liquidjs/commit/2f8770898963e35ac4491f6975a8abd03dc09067))

# [9.37.0](https://github.com/harttle/liquidjs/compare/v9.36.2...v9.37.0) (2022-04-21)


### Bug Fixes

* support integer arithmetic for `divided_by`, closes [#465](https://github.com/harttle/liquidjs/issues/465) ([e69a510](https://github.com/harttle/liquidjs/commit/e69a51025efa7dec7d60d0067200a1466988ebbc))


### Features

* automatic output escaping, closes [#500](https://github.com/harttle/liquidjs/issues/500) ([f88490c](https://github.com/harttle/liquidjs/commit/f88490cd3cd0b5316c43c3ca76837544d99ce0b0))

## [9.36.2](https://github.com/harttle/liquidjs/compare/v9.36.1...v9.36.2) (2022-04-19)


### Bug Fixes

* lazy createRequire to allow exceptions being catched, fixes [#497](https://github.com/harttle/liquidjs/issues/497) ([b377dad](https://github.com/harttle/liquidjs/commit/b377dad9e34c3de3e0eedc1ee6f17a0e9d919669))

## [9.36.1](https://github.com/harttle/liquidjs/compare/v9.36.0...v9.36.1) (2022-04-17)


### Bug Fixes

* contains operator does not support Drop, fixes [#492](https://github.com/harttle/liquidjs/issues/492) ([9e024ff](https://github.com/harttle/liquidjs/commit/9e024ff2bcf17e7ac19c718389d4cef39b8a51f7))
* responsive header ([a56af6b](https://github.com/harttle/liquidjs/commit/a56af6bbfb5b698db55fbeb87e8e0872688fbe19))
* use `createRequire` for ESM, fixes [#334](https://github.com/harttle/liquidjs/issues/334) ([eec381e](https://github.com/harttle/liquidjs/commit/eec381ec72db3858452799b7a3264e240be3044d))

# [9.36.0](https://github.com/harttle/liquidjs/compare/v9.35.2...v9.36.0) (2022-03-05)


### Features

* Access array item by negative index, closes [#486](https://github.com/harttle/liquidjs/issues/486) ([049685b](https://github.com/harttle/liquidjs/commit/049685b9a0271ba03875e24ff2f6c7870cae62a7))
* allow strip filter with specified char, closes [#390](https://github.com/harttle/liquidjs/issues/390) ([c503cb2](https://github.com/harttle/liquidjs/commit/c503cb23dfbdd6f146d6dea16a84eab3df1f7aa9))
* appropriate error for malformed filters, fixes [#271](https://github.com/harttle/liquidjs/issues/271) ([01014ed](https://github.com/harttle/liquidjs/commit/01014edc491e12d38981045442da9faee598cdf7))

## [9.35.2](https://github.com/harttle/liquidjs/compare/v9.35.1...v9.35.2) (2022-03-02)


### Bug Fixes

* corner case for concat filter without argument, [#481](https://github.com/harttle/liquidjs/issues/481) ([aa95517](https://github.com/harttle/liquidjs/commit/aa955173d4c7adc585e862934429f1f4c5f64969))
* export all builtin tags from LiquidJS, [#464](https://github.com/harttle/liquidjs/issues/464) ([33009bb](https://github.com/harttle/liquidjs/commit/33009bb988eb74c58f390992750d91b967cb3428))

## [9.35.1](https://github.com/harttle/liquidjs/compare/v9.35.0...v9.35.1) (2022-02-26)


### Bug Fixes

* some filters throw on nil input, see [#481](https://github.com/harttle/liquidjs/issues/481) ([7dfb620](https://github.com/harttle/liquidjs/commit/7dfb620d30f8818685e1cfb8e7492313a0d036ab))

# [9.35.0](https://github.com/harttle/liquidjs/compare/v9.34.1...v9.35.0) (2022-02-23)


### Bug Fixes

* `url_encode` throws on undefined value, fixes [#479](https://github.com/harttle/liquidjs/issues/479) ([ca3240c](https://github.com/harttle/liquidjs/commit/ca3240c2c4d157095d2ebe0024d0c71bc5e435f8))


### Features

* expose all tags/filters and TimezoneDate, closes [#464](https://github.com/harttle/liquidjs/issues/464) ([dab8a29](https://github.com/harttle/liquidjs/commit/dab8a29070b2508f2e6532717b7663966f610bec))

## [9.34.1](https://github.com/harttle/liquidjs/compare/v9.34.0...v9.34.1) (2022-02-20)


### Bug Fixes

* array output now join with "" instead of "," ([ab5e245](https://github.com/harttle/liquidjs/commit/ab5e245fba9a0f6936275319d4e5e25aadb0f7c1))
* sort filter unexpectedly modifies original array, [#475](https://github.com/harttle/liquidjs/issues/475) ([dbc0497](https://github.com/harttle/liquidjs/commit/dbc049738633b1b6f578d9d20f830b548ba67a22))

# [9.34.0](https://github.com/harttle/liquidjs/compare/v9.33.1...v9.34.0) (2022-01-28)


### Bug Fixes

* where-filter null handling ([#457](https://github.com/harttle/liquidjs/issues/457)) ([9da41c8](https://github.com/harttle/liquidjs/commit/9da41c8a37d9c49ee4a16d5bd520fd6ae01c14ec))


### Features

* `ownPropertyOnly` option to protect prototype, [#454](https://github.com/harttle/liquidjs/issues/454) ([7e99efc](https://github.com/harttle/liquidjs/commit/7e99efc5131e20cf3f59e1fc2c371a15aa4109db))

## [9.33.1](https://github.com/harttle/liquidjs/compare/v9.33.0...v9.33.1) (2022-01-19)


### Bug Fixes

* liquidjs.version on npm package ([53824a2](https://github.com/harttle/liquidjs/commit/53824a2d00f978214fcd83a48118b7900cf97449))

# [9.33.0](https://github.com/harttle/liquidjs/compare/v9.32.1...v9.33.0) (2022-01-19)


### Features

* support `offset:continue`, see [#439](https://github.com/harttle/liquidjs/issues/439) ([8c27a84](https://github.com/harttle/liquidjs/commit/8c27a84059384ae730eb0fa1524df04e122e27a0))
* support Jekyll-like include syntax, see [#441](https://github.com/harttle/liquidjs/issues/441) ([388d0fb](https://github.com/harttle/liquidjs/commit/388d0fbbc42fe8cd69faba61c1dc29e9bb5ec2d0))

## [9.32.1](https://github.com/harttle/liquidjs/compare/v9.32.0...v9.32.1) (2022-01-12)


### Bug Fixes

* remove limit on operator char length ([7677f84](https://github.com/harttle/liquidjs/commit/7677f848c0c57335dd1c4f1e3ec251fbf9b1663f))

# [9.32.0](https://github.com/harttle/liquidjs/compare/v9.31.0...v9.32.0) (2022-01-02)


### Features

* support allow_false for `default` filter, see [#435](https://github.com/harttle/liquidjs/issues/435) ([c756191](https://github.com/harttle/liquidjs/commit/c756191f49f9c2b823048367abfdf0adf2bdb875))

# [9.31.0](https://github.com/harttle/liquidjs/compare/v9.30.0...v9.31.0) (2021-12-19)


### Features

* implement `liquid` and `echo` tags, see [#428](https://github.com/harttle/liquidjs/issues/428) ([fde9924](https://github.com/harttle/liquidjs/commit/fde9924ee622efae4c013d2aa01c6d705c8d5f46))

# [9.30.0](https://github.com/harttle/liquidjs/compare/v9.29.0...v9.30.0) (2021-12-18)


### Features

* support jekyll-like include, see [#433](https://github.com/harttle/liquidjs/issues/433) ([23279a8](https://github.com/harttle/liquidjs/commit/23279a816a0582ade7f3b15c1c65c74bc147d134))

# [9.29.0](https://github.com/harttle/liquidjs/compare/v9.28.6...v9.29.0) (2021-12-11)


### Features

* customize globals & strictVariables when calling render, see [#432](https://github.com/harttle/liquidjs/issues/432) ([6801552](https://github.com/harttle/liquidjs/commit/6801552fe6829770cbbfdda051731c8b466ed9ec))

## [9.28.6](https://github.com/harttle/liquidjs/compare/v9.28.5...v9.28.6) (2021-12-07)


### Bug Fixes

* size filter does not respect Objects, fixes [#385](https://github.com/harttle/liquidjs/issues/385) ([6c11426](https://github.com/harttle/liquidjs/commit/6c114267a526ef764dfd9bd94de199d2932ad91a))
* throws when using `preserveTimezones` on Node.js, fixes [#431](https://github.com/harttle/liquidjs/issues/431) ([e2ef236](https://github.com/harttle/liquidjs/commit/e2ef236f68273b72a0b1293b0d13728cdb9aa4b8))

## [9.28.5](https://github.com/harttle/liquidjs/compare/v9.28.4...v9.28.5) (2021-11-05)


### Bug Fixes

* always allow './' and '../' to be relative, even on windows ([44f6b52](https://github.com/harttle/liquidjs/commit/44f6b520d53ba984ecb5fc430d70f698837d1802))

## [9.28.4](https://github.com/harttle/liquidjs/compare/v9.28.3...v9.28.4) (2021-10-31)


### Bug Fixes

* allow `{%render%}` to reassign argument, [#404](https://github.com/harttle/liquidjs/issues/404) ([124f4c4](https://github.com/harttle/liquidjs/commit/124f4c4485270a5fdfca610808a56ecd98d98417))

## [9.28.3](https://github.com/harttle/liquidjs/compare/v9.28.2...v9.28.3) (2021-10-27)


### Bug Fixes

* relative root (by default) yields LookupError, fixes [#419](https://github.com/harttle/liquidjs/issues/419), [#424](https://github.com/harttle/liquidjs/issues/424), also related to [#395](https://github.com/harttle/liquidjs/issues/395) ([aebeae9](https://github.com/harttle/liquidjs/commit/aebeae9e1bbb8472af7788dfd09a08cb6de58e1c))

## [9.28.2](https://github.com/harttle/liquidjs/compare/v9.28.1...v9.28.2) (2021-10-16)


### Bug Fixes

* cache ongoing parseFile() calls, fixes [#416](https://github.com/harttle/liquidjs/issues/416) ([8894cbf](https://github.com/harttle/liquidjs/commit/8894cbfe6e0dbad4c07439adcefb6b3e2056be11))

## [9.28.1](https://github.com/harttle/liquidjs/compare/v9.28.0...v9.28.1) (2021-10-16)


### Bug Fixes

* hardcoded '/' in normalized `options.fs`, fixes [#412](https://github.com/harttle/liquidjs/issues/412), [#408](https://github.com/harttle/liquidjs/issues/408) ([9cfa43b](https://github.com/harttle/liquidjs/commit/9cfa43b8aee6a980f39d99f1cdb2be730ca21731))

# [9.28.0](https://github.com/harttle/liquidjs/compare/v9.27.1...v9.28.0) (2021-10-06)


### Bug Fixes

* skip root check for renderFile() ([822ba0b](https://github.com/harttle/liquidjs/commit/822ba0be0f1cfbedd50376aff8ac49eee71bd48c))
* support timezoneOffset for date from scope, [#401](https://github.com/harttle/liquidjs/issues/401) ([fd5ef47](https://github.com/harttle/liquidjs/commit/fd5ef474c36212e6a2446012dcd26bca93f84c7b))


### Features

* `relativeReference` for render/include/layout, [#395](https://github.com/harttle/liquidjs/issues/395) ([a3455eb](https://github.com/harttle/liquidjs/commit/a3455ebd0b207141c34630c0af44d917db2ca1dd))
* implement `forloop.name` as found in ruby shopify/liquid ([6dc7fad](https://github.com/harttle/liquidjs/commit/6dc7fada72467418806c1ee4bd7eaf3003690fe6))

## [9.27.1](https://github.com/harttle/liquidjs/compare/v9.27.0...v9.27.1) (2021-10-04)


### Bug Fixes

* directory info in lookupError message, [#395](https://github.com/harttle/liquidjs/issues/395) ([92bfc65](https://github.com/harttle/liquidjs/commit/92bfc65e0b1d937c00a8368b272223c702132d23))

# [9.27.0](https://github.com/harttle/liquidjs/compare/v9.26.0...v9.27.0) (2021-10-03)


### Bug Fixes

* remove "stream" dependency in browser bundles, [#396](https://github.com/harttle/liquidjs/issues/396) ([3b5eb66](https://github.com/harttle/liquidjs/commit/3b5eb6664f673c29d74cb7645e01dcbdf43c8343))
* renderToNodeStream() now emit 'error' event instead of throw ([afeef1d](https://github.com/harttle/liquidjs/commit/afeef1d7450b2799b3441b0241d2466b892a27ff))


### Features

* add `layouts`, `partials` apart from `root`, [#395](https://github.com/harttle/liquidjs/issues/395) ([b9ae479](https://github.com/harttle/liquidjs/commit/b9ae479b653a34fadb98c324c4683dd1fdd31af1))
* renderFileToNodeStream(filepath, scope) ([68c4cfc](https://github.com/harttle/liquidjs/commit/68c4cfcfb647c22225dd6edede53ad7a5d7c4485))


### Performance Improvements

* make the most of streamed rendering ([aea3441](https://github.com/harttle/liquidjs/commit/aea34418de24cb85ea1acddf68c3683ce7fc9fa8))

# [9.26.0](https://github.com/harttle/liquidjs/compare/v9.25.1...v9.26.0) (2021-09-30)


### Features

* orderedFilterParameters, closes [#312](https://github.com/harttle/liquidjs/issues/312) ([10e8c8f](https://github.com/harttle/liquidjs/commit/10e8c8ff7e1cca6df43087953cd8daf4bd618563))
* stream rendering, closed [#361](https://github.com/harttle/liquidjs/issues/361) fixes [#360](https://github.com/harttle/liquidjs/issues/360) ([9012133](https://github.com/harttle/liquidjs/commit/9012133e0717b1813c6a74a6a282f43ba14d0ada))
* timezoneOffset option to specify output timezone, see [#375](https://github.com/harttle/liquidjs/issues/375) ([6b9f872](https://github.com/harttle/liquidjs/commit/6b9f872bccb4b0c636dc7be2088cafa9bc6c900a))


### Performance Improvements

* improve performance by 4x by simplified parseFile ([24f5346](https://github.com/harttle/liquidjs/commit/24f534608489fccc155f30bbaf37397c46278da6))
* parse filenames in parse() insteadof render() ([8273c17](https://github.com/harttle/liquidjs/commit/8273c17dab3dc09858330ce45e3617a650e7fcaa))

## [9.25.1](https://github.com/harttle/liquidjs/compare/v9.25.0...v9.25.1) (2021-06-20)


### Performance Improvements

* add cross-engines benchmark ([cdceb25](https://github.com/harttle/liquidjs/commit/cdceb25d007b3d30a85e51ac538e12297c73bfcf))

# [9.25.0](https://github.com/harttle/liquidjs/compare/v9.24.2...v9.25.0) (2021-05-07)


### Features

* when tag with multiple values ([8f9639f](https://github.com/harttle/liquidjs/commit/8f9639f))

## [9.24.2](https://github.com/harttle/liquidjs/compare/v9.24.1...v9.24.2) (2021-05-04)


### Bug Fixes

* operator boundary not correctly recognized, fixes [#342](https://github.com/harttle/liquidjs/issues/342) ([3e3d84a](https://github.com/harttle/liquidjs/commit/3e3d84a))

## [9.24.1](https://github.com/harttle/liquidjs/compare/v9.24.0...v9.24.1) (2021-05-01)


### Bug Fixes

* make LiquidError context property public ([1fd76ac](https://github.com/harttle/liquidjs/commit/1fd76ac))

# [9.24.0](https://github.com/harttle/liquidjs/compare/v9.23.4...v9.24.0) (2021-05-01)


### Features

* add context as a property on the LiquidError error ([9c7cb57](https://github.com/harttle/liquidjs/commit/9c7cb57))
* export errors for better error handling in user-land ([4e394b9](https://github.com/harttle/liquidjs/commit/4e394b9))

## [9.23.4](https://github.com/harttle/liquidjs/compare/v9.23.3...v9.23.4) (2021-04-17)


### Bug Fixes

* capitalize filter not lower case trailing string, fixes [#326](https://github.com/harttle/liquidjs/issues/326) ([6548765](https://github.com/harttle/liquidjs/commit/6548765))

## [9.23.3](https://github.com/harttle/liquidjs/compare/v9.23.2...v9.23.3) (2021-03-21)


### Bug Fixes

* expose TokenKind ([dbc23e8](https://github.com/harttle/liquidjs/commit/dbc23e8))

## [9.23.2](https://github.com/harttle/liquidjs/compare/v9.23.1...v9.23.2) (2021-03-13)


### Bug Fixes

* comparison for empty/nil, fixes [#321](https://github.com/harttle/liquidjs/issues/321) ([99d14e7](https://github.com/harttle/liquidjs/commit/99d14e7))
* newline_to_br filter should output <br /> instead of <br/>, fixes [#320](https://github.com/harttle/liquidjs/issues/320) ([9a9b792](https://github.com/harttle/liquidjs/commit/9a9b792))

## [9.23.1](https://github.com/harttle/liquidjs/compare/v9.23.0...v9.23.1) (2021-02-19)


### Bug Fixes

* lenientIf not working for the umd bundle, closes [#313](https://github.com/harttle/liquidjs/issues/313) ([2e66e8b](https://github.com/harttle/liquidjs/commit/2e66e8b))

# [9.23.0](https://github.com/harttle/liquidjs/compare/v9.22.1...v9.23.0) (2021-02-12)


### Bug Fixes

* respect `fs` in parser options, for [#233](https://github.com/harttle/liquidjs/issues/233) ([4e82da6](https://github.com/harttle/liquidjs/commit/4e82da6))


### Features

* support filters in if/unless/case, see [#287](https://github.com/harttle/liquidjs/issues/287) ([2f059f6](https://github.com/harttle/liquidjs/commit/2f059f6))
* support function calls, closes [#222](https://github.com/harttle/liquidjs/issues/222) ([e37824f](https://github.com/harttle/liquidjs/commit/e37824f))
* support layout none, closes [#299](https://github.com/harttle/liquidjs/issues/299) ([81e11bb](https://github.com/harttle/liquidjs/commit/81e11bb))

## [9.22.1](https://github.com/harttle/liquidjs/compare/v9.22.0...v9.22.1) (2021-02-05)


### Bug Fixes

* default to precedence 1 for custom operators ([20f559e](https://github.com/harttle/liquidjs/commit/20f559e))

# [9.22.0](https://github.com/harttle/liquidjs/compare/v9.21.0...v9.22.0) (2021-02-04)


### Features

* compact filter ([f42c217](https://github.com/harttle/liquidjs/commit/f42c217))

# [9.21.0](https://github.com/harttle/liquidjs/compare/v9.20.1...v9.21.0) (2021-02-04)


### Features

* add `operators` option for custom operators ([75591cd](https://github.com/harttle/liquidjs/commit/75591cd))
* create trie programmatically in options ([befc33c](https://github.com/harttle/liquidjs/commit/befc33c))
* export OperatorMap type ([bc87e19](https://github.com/harttle/liquidjs/commit/bc87e19))
* export Operators from operator.ts ([6a7c280](https://github.com/harttle/liquidjs/commit/6a7c280))
* rename to defaultOperators and Operators ([8734e2e](https://github.com/harttle/liquidjs/commit/8734e2e))

## [9.20.1](https://github.com/harttle/liquidjs/compare/v9.20.0...v9.20.1) (2021-01-24)


### Bug Fixes

* allow string literals contain delimiters, fixes [#288](https://github.com/harttle/liquidjs/issues/288) ([9c40da7](https://github.com/harttle/liquidjs/commit/9c40da7))

# [9.20.0](https://github.com/harttle/liquidjs/compare/v9.19.0...v9.20.0) (2021-01-23)


### Features

* support `{{block.super}}`, see [#38](https://github.com/harttle/liquidjs/issues/38) ([a3af44d](https://github.com/harttle/liquidjs/commit/a3af44d))

# [9.19.0](https://github.com/harttle/liquidjs/compare/v9.18.0...v9.19.0) (2020-12-18)


### Bug Fixes

* lint ([de32259](https://github.com/harttle/liquidjs/commit/de32259))
* move offset adding complexity inside TimezoneDate ([26b2175](https://github.com/harttle/liquidjs/commit/26b2175))
* simpler timezone regex and non-null offset ([e3ecfe3](https://github.com/harttle/liquidjs/commit/e3ecfe3))


### Features

* add preserveTimezones option ([d70cd2a](https://github.com/harttle/liquidjs/commit/d70cd2a))
* parse and handle date timezone offsets ([c16c787](https://github.com/harttle/liquidjs/commit/c16c787))

# [9.18.0](https://github.com/harttle/liquidjs/compare/v9.17.0...v9.18.0) (2020-12-17)


### Bug Fixes

* address refactor comments ([6a0ad10](https://github.com/harttle/liquidjs/commit/6a0ad10))


### Features

* add option for keeping variable type in output ([cd92e77](https://github.com/harttle/liquidjs/commit/cd92e77))

# [9.17.0](https://github.com/harttle/liquidjs/compare/v9.16.1...v9.17.0) (2020-12-07)


### Bug Fixes

* elsif is not supported for unless, fixes [#268](https://github.com/harttle/liquidjs/issues/268) ([2bbf501](https://github.com/harttle/liquidjs/commit/2bbf501))
* enforce string-type pattern in `replace`, fixes [#243](https://github.com/harttle/liquidjs/issues/243) ([c8afa39](https://github.com/harttle/liquidjs/commit/c8afa39))
* raw block not ignoring {% characters, fixes [#263](https://github.com/harttle/liquidjs/issues/263) ([a492d8e](https://github.com/harttle/liquidjs/commit/a492d8e))


### Features

* passing liquid to FilterImpl, closes [#277](https://github.com/harttle/liquidjs/issues/277) ([f9f595f](https://github.com/harttle/liquidjs/commit/f9f595f))

## [9.16.1](https://github.com/harttle/liquidjs/compare/v9.16.0...v9.16.1) (2020-10-09)


### Bug Fixes

* braced property access ([18a807e](https://github.com/harttle/liquidjs/commit/18a807e))

# [9.16.0](https://github.com/harttle/liquidjs/compare/v9.15.1...v9.16.0) (2020-10-08)


### Features

* support jsTruthy, [#255](https://github.com/harttle/liquidjs/issues/255) [#257](https://github.com/harttle/liquidjs/issues/257) ([72ee7b4](https://github.com/harttle/liquidjs/commit/72ee7b4))

## [9.15.1](https://github.com/harttle/liquidjs/compare/v9.15.0...v9.15.1) (2020-10-03)


### Bug Fixes

* allow quoted variable name in capture, fixes [#252](https://github.com/harttle/liquidjs/issues/252) ([5b3f419](https://github.com/harttle/liquidjs/commit/5b3f419))

# [9.15.0](https://github.com/harttle/liquidjs/compare/v9.14.1...v9.15.0) (2020-08-04)


### Features

* export toPromise and toValue, see [#158](https://github.com/harttle/liquidjs/issues/158) ([2e5ab98](https://github.com/harttle/liquidjs/commit/2e5ab98))

## [9.14.1](https://github.com/harttle/liquidjs/compare/v9.14.0...v9.14.1) (2020-07-08)


### Bug Fixes

* enumerate Promises (e.g. in for & tablerow) ([#237](https://github.com/harttle/liquidjs/issues/237)) ([941dd66](https://github.com/harttle/liquidjs/commit/941dd66))

# [9.14.0](https://github.com/harttle/liquidjs/compare/v9.13.0...v9.14.0) (2020-06-25)


### Features

* setup universal browser and node builds ([6cf6ffa](https://github.com/harttle/liquidjs/commit/6cf6ffa))

# [9.13.0](https://github.com/harttle/liquidjs/compare/v9.12.0...v9.13.0) (2020-06-25)


### Features

* async filters, closes [#232](https://github.com/harttle/liquidjs/issues/232) ([e36f3ff](https://github.com/harttle/liquidjs/commit/e36f3ff))

# [9.12.0](https://github.com/harttle/liquidjs/compare/v9.11.11...v9.12.0) (2020-05-15)


### Features

* sort by key, see [#227](https://github.com/harttle/liquidjs/issues/227) ([4f17c94](https://github.com/harttle/liquidjs/commit/4f17c94))

## [9.11.11](https://github.com/harttle/liquidjs/compare/v9.11.10...v9.11.11) (2020-05-01)


### Bug Fixes

* properly treat unicode blanks, fixes [#221](https://github.com/harttle/liquidjs/issues/221) ([673b015](https://github.com/harttle/liquidjs/commit/673b015))

## [9.11.10](https://github.com/harttle/liquidjs/compare/v9.11.9...v9.11.10) (2020-04-03)


### Bug Fixes

* respect cache render options ([a93f11d](https://github.com/harttle/liquidjs/commit/a93f11d))

## [9.11.9](https://github.com/harttle/liquidjs/compare/v9.11.8...v9.11.9) (2020-03-31)


### Bug Fixes

* coerce to Array in `map` and `where` filter ([c923598](https://github.com/harttle/liquidjs/commit/c923598))

## [9.11.8](https://github.com/harttle/liquidjs/compare/v9.11.7...v9.11.8) (2020-03-31)


### Bug Fixes

* throw an error if : omitted unintentionally, [#212](https://github.com/harttle/liquidjs/issues/212), [#208](https://github.com/harttle/liquidjs/issues/208) ([8daf281](https://github.com/harttle/liquidjs/commit/8daf281))

## [9.11.7](https://github.com/harttle/liquidjs/compare/v9.11.6...v9.11.7) (2020-03-28)


### Bug Fixes

* try fix travis ([b3db412](https://github.com/harttle/liquidjs/commit/b3db412))

## [9.11.6](https://github.com/harttle/liquidjs/compare/v9.11.5...v9.11.6) (2020-03-25)


### Bug Fixes

* default filter not applied for empty array ([c371762](https://github.com/harttle/liquidjs/commit/c371762))

## [9.11.5](https://github.com/harttle/liquidjs/compare/v9.11.4...v9.11.5) (2020-03-24)


### Bug Fixes

* throws on invalid arguments for prepend/append, fixes [#208](https://github.com/harttle/liquidjs/issues/208) ([479c633](https://github.com/harttle/liquidjs/commit/479c633))

## [9.11.4](https://github.com/harttle/liquidjs/compare/v9.11.3...v9.11.4) (2020-03-23)


### Bug Fixes

* return variable name in include error ([93433a8](https://github.com/harttle/liquidjs/commit/93433a8))

## [9.11.3](https://github.com/harttle/liquidjs/compare/v9.11.2...v9.11.3) (2020-03-14)


### Performance Improvements

* introduce AST to avoid reparse ([d2d6a38](https://github.com/harttle/liquidjs/commit/d2d6a38))
* remove instanceof DelimitedToken ([1673e84](https://github.com/harttle/liquidjs/commit/1673e84))

## [9.11.2](https://github.com/harttle/liquidjs/compare/v9.11.1...v9.11.2) (2020-03-14)


### Performance Improvements

* remove transient strings to reduce memory ([3dfdf98](https://github.com/harttle/liquidjs/commit/3dfdf98))

## [9.11.1](https://github.com/harttle/liquidjs/compare/v9.11.0...v9.11.1) (2020-03-09)


### Bug Fixes

* concurrent write on LRU cache ([#200](https://github.com/harttle/liquidjs/issues/200)) ([6de9338](https://github.com/harttle/liquidjs/commit/6de9338))

# [9.11.0](https://github.com/harttle/liquidjs/compare/v9.10.0...v9.11.0) (2020-03-04)


### Bug Fixes

* `Buffer not defined` for browser bundles, fixes [#197](https://github.com/harttle/liquidjs/issues/197) ([65b849c](https://github.com/harttle/liquidjs/commit/65b849c))
* stable sort for undefined keys, fixes [#191](https://github.com/harttle/liquidjs/issues/191) ([f57156b](https://github.com/harttle/liquidjs/commit/f57156b))


### Features

* async cache.read()/write(), remove .has() ([61dac49](https://github.com/harttle/liquidjs/commit/61dac49))

# [9.10.0](https://github.com/harttle/liquidjs/compare/v9.9.0...v9.10.0) (2020-03-03)


### Features

* support json filter, closes [#192](https://github.com/harttle/liquidjs/issues/192) ([aa27a6c](https://github.com/harttle/liquidjs/commit/aa27a6c))
* with & for in `render` tag, closes [#195](https://github.com/harttle/liquidjs/issues/195) ([6ea6881](https://github.com/harttle/liquidjs/commit/6ea6881))

# [9.9.0](https://github.com/harttle/liquidjs/compare/v9.8.0...v9.9.0) (2020-03-02)


### Features

* move filters/tags to instances, fixes [#188](https://github.com/harttle/liquidjs/issues/188) ([df8a919](https://github.com/harttle/liquidjs/commit/df8a919))

# [9.8.0](https://github.com/harttle/liquidjs/compare/v9.7.2...v9.8.0) (2020-02-20)


### Features

* "today" when using date filter, fixes [#193](https://github.com/harttle/liquidjs/issues/193) ([185312d](https://github.com/harttle/liquidjs/commit/185312d))

## [9.7.2](https://github.com/harttle/liquidjs/compare/v9.7.1...v9.7.2) (2020-02-20)


### Bug Fixes

* add funding entry to show up in npm fund command ([40095a8](https://github.com/harttle/liquidjs/commit/40095a8))

## [9.7.1](https://github.com/harttle/liquidjs/compare/v9.7.0...v9.7.1) (2020-02-19)


### Bug Fixes

* update index.html ([22386b0](https://github.com/harttle/liquidjs/commit/22386b0))

# [9.7.0](https://github.com/harttle/liquidjs/compare/v9.6.2...v9.7.0) (2020-02-07)


### Bug Fixes

* expression and string literal parser, [#186](https://github.com/harttle/liquidjs/issues/186) ([fc0cf6f](https://github.com/harttle/liquidjs/commit/fc0cf6f))


### Features

* globals shared between tags, see [#185](https://github.com/harttle/liquidjs/issues/185) ([870e7ec](https://github.com/harttle/liquidjs/commit/870e7ec))

## [9.6.2](https://github.com/harttle/liquidjs/compare/v9.6.1...v9.6.2) (2020-01-10)


### Performance Improvements

* prevent multiple case evaluations ([807e840](https://github.com/harttle/liquidjs/commit/807e840))

## [9.6.1](https://github.com/harttle/liquidjs/compare/v9.6.0...v9.6.1) (2020-01-04)


### Bug Fixes

* add `this` to fs references in parseFile ([4b079c5](https://github.com/harttle/liquidjs/commit/4b079c5))

# [9.6.0](https://github.com/harttle/liquidjs/compare/v9.5.0...v9.6.0) (2019-12-15)


### Features

* full syntax for strftime, close [#177](https://github.com/harttle/liquidjs/issues/177) ([ba5ff3f](https://github.com/harttle/liquidjs/commit/ba5ff3f))

# [9.5.0](https://github.com/harttle/liquidjs/compare/v9.4.2...v9.5.0) (2019-12-12)


### Features

* nested property for the `where` filter, [#178](https://github.com/harttle/liquidjs/issues/178) ([60ec74f](https://github.com/harttle/liquidjs/commit/60ec74f))

## [9.4.2](https://github.com/harttle/liquidjs/compare/v9.4.1...v9.4.2) (2019-11-15)


### Bug Fixes

* reading .first, .last of Array, closes [#175](https://github.com/harttle/liquidjs/issues/175) ([f82da11](https://github.com/harttle/liquidjs/commit/f82da11))

## [9.4.1](https://github.com/harttle/liquidjs/compare/v9.4.0...v9.4.1) (2019-11-15)


### Bug Fixes

* remove node dependencies for esm bundle, see [#173](https://github.com/harttle/liquidjs/issues/173) ([04df929](https://github.com/harttle/liquidjs/commit/04df929))

# [9.4.0](https://github.com/harttle/liquidjs/compare/v9.3.1...v9.4.0) (2019-11-14)


### Features

* add ability to pass JSON context to CLI ([9504e4e](https://github.com/harttle/liquidjs/commit/9504e4e))

## [9.3.1](https://github.com/harttle/liquidjs/compare/v9.3.0...v9.3.1) (2019-11-09)


### Bug Fixes

* liquidjs command in /bin/liquid.js, fixes [#169](https://github.com/harttle/liquidjs/issues/169) ([0073b90](https://github.com/harttle/liquidjs/commit/0073b90))

# [9.3.0](https://github.com/harttle/liquidjs/compare/v9.2.0...v9.3.0) (2019-11-07)


### Features

* support require.resolve for lookup, see [#168](https://github.com/harttle/liquidjs/issues/168) ([2dd4355](https://github.com/harttle/liquidjs/commit/2dd4355))

## [9.1.1](https://github.com/harttle/liquidjs/compare/v9.1.0...v9.1.1) (2019-10-10)


### Performance Improvements

* add string flattening to reduce retained memory (node only) ([3ad512c](https://github.com/harttle/liquidjs/commit/3ad512c))

# [9.1.0](https://github.com/harttle/liquidjs/compare/v9.0.1...v9.1.0) (2019-10-07)


### Features

* alias getTemplate() to parseFile() ([6b83788](https://github.com/harttle/liquidjs/commit/6b83788))

## [9.0.1](https://github.com/harttle/liquidjs/compare/v9.0.0...v9.0.1) (2019-10-02)


### Bug Fixes

* `unless` content is not waited, fixes [#160](https://github.com/harttle/liquidjs/issues/160) ([d2c8d13](https://github.com/harttle/liquidjs/commit/d2c8d13))

# [9.0.0](https://github.com/harttle/liquidjs/compare/v8.5.3...v9.0.0) (2019-08-26)


### Bug Fixes

* break/continue omitting output before them, [#123](https://github.com/harttle/liquidjs/issues/123) ([ae45c46](https://github.com/harttle/liquidjs/commit/ae45c46))
* reactjs demo during yarn install, fixes [#145](https://github.com/harttle/liquidjs/issues/145) ([b65df44](https://github.com/harttle/liquidjs/commit/b65df44))


### Code Refactoring

* return value of Tag#render is no longer used ([8028f82](https://github.com/harttle/liquidjs/commit/8028f82))


### Features

* renderSync, parseAndRenderSync and renderFileSync, see [#48](https://github.com/harttle/liquidjs/issues/48) ([7fb01ad](https://github.com/harttle/liquidjs/commit/7fb01ad))


### Performance Improvements

* target to es6, fixes [#137](https://github.com/harttle/liquidjs/issues/137) ([3b9fc7e](https://github.com/harttle/liquidjs/commit/3b9fc7e))


### BREAKING CHANGES

* Tag#render now returns void, use emitter argument
to write rendered html.
* ship to Node.js 8, the dist/liquid.cjs.js (main) no longer
supports Node.js 6, other bundles are also provided via dist/liquid.esm.js, dist/liquid.js (ES5 umd) and liquid.min.js (minified ES5 umd)
* remove default export, now should be used like import
{Liquid} from 'liquidjs'

## [8.5.3](https://github.com/harttle/liquidjs/compare/v8.5.2...v8.5.3) (2019-08-25)


### Bug Fixes

* escape filter when input is undefined ([a00945c](https://github.com/harttle/liquidjs/commit/a00945c))

## [8.5.2](https://github.com/harttle/liquidjs/compare/v8.5.1...v8.5.2) (2019-08-09)


### Bug Fixes

* quotation tokenizing, [#151](https://github.com/harttle/liquidjs/issues/151) ([1e4f237](https://github.com/harttle/liquidjs/commit/1e4f237))

## [8.5.1](https://github.com/harttle/liquidjs/compare/v8.5.0...v8.5.1) (2019-08-05)


### Bug Fixes

* publish bin directory to npm, fixes [#146](https://github.com/harttle/liquidjs/issues/146) ([a85b650](https://github.com/harttle/liquidjs/commit/a85b650))

# [8.5.0](https://github.com/harttle/liquidjs/compare/v8.4.1...v8.5.0) (2019-08-01)


### Features

* CLI support ([fc045b5](https://github.com/harttle/liquidjs/commit/fc045b5))

## [8.4.1](https://github.com/harttle/liquidjs/compare/v8.4.0...v8.4.1) (2019-07-22)


### Bug Fixes

* some filters on undefined variable throws, [#140](https://github.com/harttle/liquidjs/issues/140) ([6e6ea0a](https://github.com/harttle/liquidjs/commit/6e6ea0a))

# [8.4.0](https://github.com/harttle/liquidjs/compare/v8.3.0...v8.4.0) (2019-07-06)


### Features

* at_least, at_most, sort_natural for [#132](https://github.com/harttle/liquidjs/issues/132) ([e6f5f1c](https://github.com/harttle/liquidjs/commit/e6f5f1c))

# [8.3.0](https://github.com/harttle/liquidjs/compare/v8.2.4...v8.3.0) (2019-06-27)


### Features

* fs option implemented by [#138](https://github.com/harttle/liquidjs/issues/138) ([3f5e23c](https://github.com/harttle/liquidjs/commit/3f5e23c))

## [8.2.4](https://github.com/harttle/liquidjs/compare/v8.2.3...v8.2.4) (2019-06-17)


### Performance Improvements

* improve getTemplate() when cache is enabled ([1ffba2b](https://github.com/harttle/liquidjs/commit/1ffba2b))

## [8.2.3](https://github.com/harttle/liquidjs/compare/v8.2.2...v8.2.3) (2019-05-19)


### Bug Fixes

* reverse filter not pure, see [#126](https://github.com/harttle/liquidjs/issues/126) ([505c408](https://github.com/harttle/liquidjs/commit/505c408))

## [8.2.2](https://github.com/harttle/liquidjs/compare/v8.2.1...v8.2.2) (2019-05-12)


### Bug Fixes

* date from integer, [#125](https://github.com/harttle/liquidjs/issues/125) ([fdf0043](https://github.com/harttle/liquidjs/commit/fdf0043))
* pass drops directly to filters/tags ([bef2909](https://github.com/harttle/liquidjs/commit/bef2909))

## [8.2.1](https://github.com/harttle/liquidjs/compare/v8.2.0...v8.2.1) (2019-04-26)


### Bug Fixes

* `default` filter is not working with an empty string, [#122](https://github.com/harttle/liquidjs/issues/122) ([6075c0a](https://github.com/harttle/liquidjs/commit/6075c0a))

# [8.2.0](https://github.com/harttle/liquidjs/compare/v8.1.0...v8.2.0) (2019-04-17)


### Features

* pass context to filters ([00bc1ef](https://github.com/harttle/liquidjs/commit/00bc1ef))

# [8.1.0](https://github.com/harttle/liquidjs/compare/v8.0.3...v8.1.0) (2019-04-02)


### Features

* where filter, working on [#118](https://github.com/harttle/liquidjs/issues/118) ([daa0b57](https://github.com/harttle/liquidjs/commit/daa0b57))

## [8.0.3](https://github.com/harttle/liquidjs/compare/v8.0.2...v8.0.3) (2019-04-01)


### Bug Fixes

* slice filter on negative `begin`, [#117](https://github.com/harttle/liquidjs/issues/117) ([eadb6f3](https://github.com/harttle/liquidjs/commit/eadb6f3))

## [8.0.2](https://github.com/harttle/liquidjs/compare/v8.0.1...v8.0.2) (2019-03-25)


### Performance Improvements

* use polymorphism instead duck test ([82d7673](https://github.com/harttle/liquidjs/commit/82d7673))

## [8.0.1](https://github.com/harttle/liquidjs/compare/v8.0.0...v8.0.1) (2019-03-22)


### Bug Fixes

* incorrect scope when using assign with for, fixes [#115](https://github.com/harttle/liquidjs/issues/115) ([defbb58](https://github.com/harttle/liquidjs/commit/defbb58))

# [8.0.0](https://github.com/harttle/liquidjs/compare/v7.5.1...v8.0.0) (2019-03-10)


### Code Refactoring

* use camelCase for JavaScript APIs ([64e0c87](https://github.com/harttle/liquidjs/commit/64e0c87))


### Features

* promise support for drops, working on [#65](https://github.com/harttle/liquidjs/issues/65) ([4a8088d](https://github.com/harttle/liquidjs/commit/4a8088d))


### BREAKING CHANGES

* Options and method names in JavaScript API are now renamed to camelCase, for a complete list see #109

## [7.5.1](https://github.com/harttle/liquidjs/compare/v7.5.0...v7.5.1) (2019-03-05)


### Bug Fixes

* named params for filters, working on [#113](https://github.com/harttle/liquidjs/issues/113) ([5ffc904](https://github.com/harttle/liquidjs/commit/5ffc904))

# [7.5.0](https://github.com/harttle/liquidjs/compare/v7.4.0...v7.5.0) (2019-03-01)


### Features

* tablerowloop object ([3647305](https://github.com/harttle/liquidjs/commit/3647305))

# [7.4.0](https://github.com/harttle/liquidjs/compare/v7.3.1...v7.4.0) (2019-02-28)


### Bug Fixes

* math filters now return number, resolves [#110](https://github.com/harttle/liquidjs/issues/110) ([b4acdb4](https://github.com/harttle/liquidjs/commit/b4acdb4))


### Features

* exported Drop interface for [#107](https://github.com/harttle/liquidjs/issues/107) ([7bee9fc](https://github.com/harttle/liquidjs/commit/7bee9fc)), closes [#109](https://github.com/harttle/liquidjs/issues/109)

## [7.3.1](https://github.com/harttle/liquidjs/compare/v7.3.0...v7.3.1) (2019-02-25)


### Bug Fixes

* **#108:** remove absolute path in emitted d.ts ([53a835a](https://github.com/harttle/liquidjs/commit/53a835a)), closes [#108](https://github.com/harttle/liquidjs/issues/108)

# [7.3.0](https://github.com/harttle/liquidjs/compare/v7.2.2...v7.3.0) (2019-02-24)


### Features

* nil/null/empty/blank literals, resolves [#102](https://github.com/harttle/liquidjs/issues/102) ([88c9e96](https://github.com/harttle/liquidjs/commit/88c9e96))

## [7.2.2](https://github.com/harttle/liquidjs/compare/v7.2.1...v7.2.2) (2019-02-23)


### Bug Fixes

* filters break when argument contains [()|, fixes [#89](https://github.com/harttle/liquidjs/issues/89) ([e977669](https://github.com/harttle/liquidjs/commit/e977669))

## [7.2.1](https://github.com/harttle/liquidjs/compare/v7.2.0...v7.2.1) (2019-02-22)


### Bug Fixes

* default length for truncate and truncatewords ([56c7992](https://github.com/harttle/liquidjs/commit/56c7992))

# [7.2.0](https://github.com/harttle/liquidjs/compare/v7.1.0...v7.2.0) (2019-02-20)


### Features

* override output/tag delimiter, fixes [#54](https://github.com/harttle/liquidjs/issues/54) ([d20a043](https://github.com/harttle/liquidjs/commit/d20a043))

### BREAKING CHANGES

* `trim_value_left` option renamed to `trim_output_left`, `trim_value_right` option renamed to `trim_output_right`

# [7.1.0](https://github.com/harttle/liquidjs/compare/v7.0.2...v7.1.0) (2019-02-20)


### Features

* throw an Error if delimiter not matched ([c33d8f6](https://github.com/harttle/liquidjs/commit/c33d8f6))

# [7.0.0](https://github.com/harttle/liquidjs/compare/v6.4.3...v7.0.0) (2019-02-14)


### chore

* **TypeScript:** ship Liquid to class ([1cc7249](https://github.com/harttle/liquidjs/commit/1cc7249))


### BREAKING CHANGES

* **TypeScript:** calling `Liquid()` without `new` now becomes invalid

## [6.4.3](https://github.com/harttle/liquidjs/compare/v6.4.2...v6.4.3) (2019-02-13)


### Bug Fixes

* better index.d.ts and a demo ([2015f68](https://github.com/harttle/liquidjs/commit/2015f68)), closes [#98](https://github.com/harttle/liquidjs/issues/98)

## [6.4.2](https://github.com/harttle/liquidjs/compare/v6.4.1...v6.4.2) (2019-01-28)


### Bug Fixes

* **CI:** e2e not building cjs ([dde7b3b](https://github.com/harttle/liquidjs/commit/dde7b3b))

## [6.4.1](https://github.com/harttle/liquidjs/compare/v6.4.0...v6.4.1) (2019-01-28)


### Bug Fixes

* regenerator undefined ([a2caeb5](https://github.com/harttle/liquidjs/commit/a2caeb5))
