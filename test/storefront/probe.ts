import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { renderPage, renderSection, storefrontSampleData } from '../../src/shopify'
import type { RequestInput, StoreData, ThemeInput } from '../../src/shopify'

export const PROBE_DIR = join(__dirname, 'probes')

/** The probe files as a theme, with the two config files `renderPage` reads. */
export function probeTheme (): ThemeInput {
  const files: Record<string, string> = { 'config/settings_schema.json': '[]', 'config/settings_data.json': '{"current":{}}', 'layout/theme.liquid': '{{ content_for_layout }}' }
  for (const dir of ['templates', 'sections']) {
    for (const file of readdirSync(join(PROBE_DIR, dir))) files[`${dir}/${file}`] = readFileSync(join(PROBE_DIR, dir, file), 'utf8')
  }
  return { files }
}

const theme = probeTheme()

const sectionTheme: ThemeInput = { files: { ...theme.files, 'templates/index.json': '{"sections":{},"order":[]}' } }

/** The HTML a probe template (or, with `section`, a probe section on the `index` page, without its wrapper) renders. */
export async function renderProbeHtml (name: string, options: { request?: RequestInput, data?: StoreData, section?: boolean, templateName?: string } = {}): Promise<string> {
  const data = options.data ?? storefrontSampleData
  if (!options.section) return (await renderPage({ theme, templateName: name, data, request: options.request })).html
  const { html } = await renderSection({ theme: sectionTheme, templateName: options.templateName ?? 'index', section: name, data, request: options.request })
  return html.replace(/^<div[^>]*>/, '').replace(/<\/div>\s*$/, '')
}

/** Renders `templates/<template>.liquid` and parses its JSON; throws with the HTML when it is not JSON. */
export async function renderProbe (template: string, options: { request?: RequestInput, data?: StoreData } = {}): Promise<unknown> {
  return parse(await renderProbeHtml(template, options), template)
}

/** Renders `sections/<section>.liquid` on the `index` page (or `templateName`) and parses its JSON. */
export async function renderProbeSection (section: string, options: { request?: RequestInput, data?: StoreData, templateName?: string } = {}): Promise<unknown> {
  return parse(await renderProbeHtml(section, { ...options, section: true }), section)
}

function parse (html: string, name: string): unknown {
  try {
    return JSON.parse(html)
  } catch {
    throw new Error(`${name} did not print JSON:\n${html.slice(0, 2000)}`)
  }
}
