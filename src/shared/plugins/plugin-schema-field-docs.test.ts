import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { satisfiesOrcaEngineRange } from './plugin-manifest'
import { PLUGIN_MANIFEST_V2_SINCE } from './plugin-schema-field-docs'

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..')

function git(args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', windowsHide: true })
  } catch {
    return null
  }
}

function releaseTags(): string[] {
  return (git(['tag', '--list', 'v*']) ?? '')
    .split('\n')
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
}

describe('PLUGIN_MANIFEST_V2_SINCE', () => {
  // Why: authors gate on this version, so it must name a release that really reads manifest v2.
  it('names the first release tag that ships manifest v2', () => {
    const shipped = releaseTags()
      .map((tag) => tag.slice(1))
      .filter((version) => satisfiesOrcaEngineRange(version, `>=${PLUGIN_MANIFEST_V2_SINCE}`))
      .sort((a, b) => (satisfiesOrcaEngineRange(a, `>=${b}`) ? 1 : -1))
    // Why skip without tags: shallow CI checkouts carry none; full clones run the check.
    const first = shipped[0]
    if (!first) {
      return
    }
    const manifest = git(['show', `v${first}:src/shared/plugins/plugin-manifest.ts`]) ?? ''
    expect(
      manifest.includes('z.literal(2)'),
      `v${first} ships without manifest v2: bump PLUGIN_MANIFEST_V2_SINCE to the release that does`
    ).toBe(true)
  })
})
