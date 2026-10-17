#!/usr/bin/env node
// Writes src/shopify-library/font-library.ts: Shopify's font library as the parity store prints it, from the fixtures of the font probes (probe-fonts-library and probe-fonts-retired-1 to -4, recorded by `pnpm parity:record --only probe-fonts` and cut by `pnpm parity:fixtures` in the Debutify repository) and shopify.dev's font page as bin/shopify-font-probes.mjs read it (test/storefront/font-page.json). The output is committed; run this again after recording the probes again.
//
//   node bin/shopify-font-library.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// the day the fixtures were recorded: change it with the fixtures
const RECORDED = '2026-10-17'
const FIXTURES = fileURLToPath(new URL('../test/storefront/fixtures/', import.meta.url))
const PAGE = fileURLToPath(new URL('../test/storefront/font-page.json', import.meta.url))
const OUT = fileURLToPath(new URL('../src/shopify-library/font-library.ts', import.meta.url))
const FOLDER = '/fonts/'
const CODES = { normal: 'n', italic: 'i', oblique: 'o' }

const page = JSON.parse(readFileSync(PAGE, 'utf8'))

/** The fonts a probe fixture recorded, `{ handle, font }` in the order the template set them: its last step's body. */
function recorded (name) {
  const fixture = JSON.parse(readFileSync(`${FIXTURES}${name}.json`, 'utf8'))
  const fonts = fixture.steps.at(-1)?.body?.fonts
  if (!Array.isArray(fonts)) throw new Error(`${name} holds no fonts: the last step's body is ${JSON.stringify(fixture.steps.at(-1)?.body)?.slice(0, 200)}`)
  return fonts
}

/** Shopify writes a family that holds anything but letters, digits and hyphens in quotes (`"Open Sans"`, a quote inside as `\"`); the table keeps the name. */
function unquote (family) {
  if (!family.startsWith('"') || !family.endsWith('"') || family.length < 2) return family
  return family.slice(1, -1).replaceAll('\\"', '"')
}

/** The path of a font file below https://fonts.shopifycdn.com/, or '' for a font without one (a system font prints an empty address). */
function file (address, where) {
  if (address === '') return ''
  if (typeof address !== 'string' || !address.startsWith(FOLDER) || address.length === FOLDER.length) throw new Error(`${where}: ${JSON.stringify(address)} is neither empty nor a ${FOLDER}<directory>/<file> address`)
  return address.slice(FOLDER.length)
}

const sample = row => row.handles.find(handle => handle.endsWith('_n4')) ?? row.handles[0]
const sorted = list => [...list].sort()

// the library: one recorded font per page row, in page order, each with the family's variants
const entries = recorded('probe-fonts-library')
if (entries.length !== page.library.length) throw new Error(`the library probe recorded ${entries.length} families and the page lists ${page.library.length}`)
const families = page.library.map((row, index) => {
  const { handle, font } = entries[index]
  if (handle !== sample(row)) throw new Error(`the ${index + 1}th library font is ${handle}, the page's ${row.family} sample is ${sample(row)}`)
  if (!font?.variants?.length) throw new Error(`${handle}: no variants recorded (${JSON.stringify(font)?.slice(0, 120)})`)
  const slug = handle.replace(/_[nio]\d$/, '')
  const first = font.variants[0]
  const fonts = font.variants.map((variant, at) => {
    const where = `${handle} variant ${at + 1}`
    for (const key of ['family', 'fallback_families', 'system']) if (variant[key] !== first[key]) throw new Error(`${where}: ${key} is ${JSON.stringify(variant[key])}, the first variant's is ${JSON.stringify(first[key])}`)
    const weight = Number(variant.weight)
    if (!Number.isInteger(weight / 100) || weight < 100 || weight > 900) throw new Error(`${where}: weight ${JSON.stringify(variant.weight)}`)
    if (!Object.hasOwn(CODES, variant.style)) throw new Error(`${where}: style ${JSON.stringify(variant.style)}`)
    if (typeof variant.baseline_ratio !== 'number') throw new Error(`${where}: baseline_ratio ${JSON.stringify(variant.baseline_ratio)}`)
    const woff2 = file(variant.woff2, where)
    const woff = file(variant.woff, where)
    if ((woff2 === '') !== (woff === '')) throw new Error(`${where}: the woff2 is ${JSON.stringify(variant.woff2)} and the woff ${JSON.stringify(variant.woff)}`)
    if ((woff2 === '') !== (variant.system === true)) throw new Error(`${where}: system? is ${variant.system} and the woff2 is ${JSON.stringify(variant.woff2)}`)
    // the font the template set keeps its handle; the others are the handle's family with their own style and weight
    const same = weight === Number(font.weight) && variant.style === font.style
    return [same ? handle : `${slug}_${CODES[variant.style]}${weight / 100}`, weight, variant.style, variant.baseline_ratio, woff2, woff]
  })
  const got = fonts.map(item => item[0])
  if (JSON.stringify(sorted(got)) !== JSON.stringify(sorted(row.handles))) throw new Error(`${row.family}: the variants are ${got.join(' ')} and the page lists ${row.handles.join(' ')}`)
  return [unquote(first.family), first.fallback_families, first.system, fonts, row.family]
})

// the page's name of the family each library handle belongs to, and the handle of each file
const pageFamily = new Map()
const byFile = new Map()
const bySystem = new Map()
for (const [family, , system, fonts, name] of families) {
  for (const [handle, weight, style, , woff2] of fonts) {
    pageFamily.set(handle, name)
    if (woff2) byFile.set(woff2, [...(byFile.get(woff2) ?? []), handle])
    if (system) bySystem.set(`${family}|${weight}|${style}`, [...(bySystem.get(`${family}|${weight}|${style}`) ?? []), handle])
  }
}

// the retired handles: each recorded in the page's order; the one Shopify renders in its place is the library font with the same file
const retired = []
for (const name of ['probe-fonts-retired-1', 'probe-fonts-retired-2', 'probe-fonts-retired-3', 'probe-fonts-retired-4']) retired.push(...recorded(name))
const wanted = page.retired.flatMap(row => row.handles.map(handle => [handle, row]))
if (retired.length !== wanted.length) throw new Error(`the retired probes recorded ${retired.length} handles and the page lists ${wanted.length}`)
const replacements = []
const unknown = []
retired.forEach(({ handle, font }, index) => {
  const [expected, row] = wanted[index]
  if (handle !== expected) throw new Error(`the ${index + 1}th retired font is ${handle}, the page's is ${expected}`)
  // a retired handle Shopify has no font for (the probe prints null) stays unknown
  if (font === null) {
    unknown.push(handle)
    return
  }
  const woff2 = file(font.woff2, handle)
  const weight = Number(font.weight)
  const matches = woff2 ? byFile.get(woff2) : bySystem.get(`${unquote(font.family)}|${weight}|${font.style}`)
  if (!matches) throw new Error(`${handle}: no library font has ${woff2 ? `the file ${woff2}` : `the system font ${font.family} ${font.weight} ${font.style}`}`)
  if (matches.length !== 1) throw new Error(`${handle}: ${matches.join(', ')} all have ${woff2 ? `the file ${woff2}` : `the system font ${font.family} ${font.weight} ${font.style}`}`)
  // the page names the replacement family as it names the library's rows, which is not always the font's own family (Sans-serif is Helvetica)
  if (pageFamily.get(matches[0]) !== row.replacement) throw new Error(`${handle}: Shopify renders ${matches[0]} (${pageFamily.get(matches[0])}) and the page names the replacement ${row.replacement}`)
  replacements.push([handle, matches[0]])
})

const q = text => `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const fontLine = ([handle, weight, style, ratio, woff2, woff]) => `[${q(handle)}, ${weight}, ${q(style)}, ${ratio}, ${q(woff2)}, ${q(woff)}]`
const familyLines = families.map(([family, fallback, system, fonts]) => `  [${q(family)}, ${q(fallback)}, ${system}, [\n${fonts.map(font => `    ${fontLine(font)}`).join(',\n')}\n  ]]`)
writeFileSync(OUT, `// Generated by bin/shopify-font-library.mjs from the parity store's font probes (fixtures probe-fonts-library and probe-fonts-retired-1 to -4, recorded ${RECORDED}) and shopify.dev's font page (test/storefront/font-page.json, read ${page.read}); do not edit by hand.

/** A font of the library: [handle, weight, style, baseline_ratio, woff2 file, woff file], the files relative to https://fonts.shopifycdn.com/ ('' for a system font). */
export type LibraryFont = [handle: string, weight: number, style: 'normal' | 'italic' | 'oblique', baselineRatio: number, woff2: string, woff: string]
/** A family of the library: [family, fallback_families, system?, its fonts in the order font.variants lists them]. */
export type LibraryFamily = [family: string, fallbackFamilies: string, system: boolean, fonts: LibraryFont[]]

export const FONT_LIBRARY: readonly LibraryFamily[] = [
${familyLines.join(',\n')}
]

/** Each retired handle (shopify.dev's "Deprecated fonts") and the library handle Shopify renders in its place. */
export const FONT_REPLACEMENTS: Readonly<Record<string, string>> = Object.freeze({
${replacements.map(([from, to]) => `  ${q(from)}: ${q(to)}`).join(',\n')}
})
`)
console.log(`${OUT}: ${families.length} families, ${families.reduce((sum, family) => sum + family[3].length, 0)} fonts, ${replacements.length} replacements; ${unknown.length} retired handles have no font (${unknown.join(', ')})`)
