import { renderPage as renderWithPrefixes, renderSection as renderSectionWithPrefixes } from '../../../src/shopify'

/** The prefix `themeBlockId` gives a theme block's id: `A`, 17 letters and digits, `__`. */
export const BLOCK_PREFIX = /A[0-9A-Za-z]{17}__/g

/** `html` with the prefixes of theme block ids taken out, so a spec about something else reads `shopify-block-text_1`; `block-ids.spec.ts` tests the prefixes themselves. */
export const withoutPrefixes = (html: string) => html.replace(BLOCK_PREFIX, '')

/** `renderPage` and `renderSection`, with the prefixes of theme block ids taken out of the HTML. */
export const renderPage = async (...args: Parameters<typeof renderWithPrefixes>) => {
  const result = await renderWithPrefixes(...args)
  return { ...result, html: withoutPrefixes(result.html) }
}
export const renderSection = async (...args: Parameters<typeof renderSectionWithPrefixes>) => {
  const result = await renderSectionWithPrefixes(...args)
  return { ...result, html: withoutPrefixes(result.html) }
}
