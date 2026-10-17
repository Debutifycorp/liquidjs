import { createHash } from 'crypto'

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/**
 * The id of a theme block as `block.id` and its wrapper print it: `<prefix>__<key>`, the repeat number of a static block after the key (`A…__card-1`). The parity store prints every theme block of Horizon so (`shopify-block-AYkNMb3hzdThtMXNBZ__header-menu`), with a prefix of `A` and 17 letters and digits that is the same on every page for the same block of the same section, differs between the blocks of one section, and is shared by the repeats of a static block and the blocks inside them; the blocks a section's own schema defines (Dawn's) keep their bare key. CSS a theme scopes by `#shopify-block-{{ block.id }}` therefore does not reach a block of the same key in another section. shopify.dev does not document the prefix or how Shopify makes it, so this one is Debutify's: a hash of `path`, the section's id followed by the keys from the section down to the block, without repeat numbers.
 */
export function themeBlockId (path: string, key: string): string {
  const bytes = createHash('sha256').update(path).digest()
  let prefix = 'A'
  for (let i = 0; i < 17; i++) prefix += DIGITS[bytes[i] % DIGITS.length]
  return `${prefix}__${key}`
}
