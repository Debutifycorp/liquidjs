import { readFileSync } from 'fs'
import { join } from 'path'

export interface FixtureStep { method: string, url: string, json?: unknown, form?: Record<string, string>, status: number, location: string | null, body: unknown }
export interface Fixture { scenario: string, steps: FixtureStep[] }

/** A fixture cut from the parity store's recordings (item 22, Debutify's `tools/shopify-parity/cut-fixtures.mjs`). */
export function loadFixture (name: string): Fixture {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', `${name}.json`), 'utf8'))
}
