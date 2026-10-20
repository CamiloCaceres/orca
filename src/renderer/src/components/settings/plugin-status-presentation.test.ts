import { describe, expect, it } from 'vitest'
import {
  isPluginEnabled,
  pluginNeedsReview,
  pluginStatusKind,
  pluginStatusLabel
} from './plugin-status-presentation'

const base = { status: 'running' as const, needsReconsent: false, blockedByKillList: undefined }

describe('plugin status presentation', () => {
  it('ranks the safety list, then review, over the worker state', () => {
    expect(pluginStatusKind({ ...base, blockedByKillList: { reason: 'unsafe' } })).toBe('blocked')
    expect(pluginStatusKind({ ...base, needsReconsent: true })).toBe('review')
    expect(pluginStatusKind({ ...base, status: 'pending' })).toBe('review')
    expect(pluginStatusKind({ ...base, status: 'errored' })).toBe('error')
    expect(pluginStatusKind({ ...base, status: 'idle' })).toBe('enabled')
    expect(pluginStatusLabel(pluginStatusKind(base))).toBe('Running')
  })

  it('counts a crashed plugin as switched on, and a pending one as needing review', () => {
    expect(isPluginEnabled({ status: 'errored' })).toBe(true)
    expect(isPluginEnabled({ status: 'disabled' })).toBe(false)
    expect(pluginNeedsReview({ status: 'pending', needsReconsent: false })).toBe(true)
  })
})
