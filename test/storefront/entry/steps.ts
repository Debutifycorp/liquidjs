import type { FixtureStep } from '../fixtures'

/** The fields a recorded step sent (the cutter maps ids in values and in object keys, so a keyed `updates` map already holds the dataset's variant ids). */
export function stepFields (step: FixtureStep): Record<string, unknown> {
  return (step.json ?? {}) as Record<string, unknown>
}
