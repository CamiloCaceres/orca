import type { PluginHostListEntry } from '../../../../preload/api-types'
import { translate } from '@/i18n/i18n'

/** What an installed plugin's state means to the user; one word each, never colour alone. */
export type PluginStatusKind =
  | 'blocked'
  | 'review'
  | 'restarting'
  | 'error'
  | 'invalid'
  | 'disabled'
  | 'running'
  | 'enabled'

type PluginStatusFields = Pick<
  PluginHostListEntry,
  'status' | 'needsReconsent' | 'blockedByKillList'
>

export function pluginNeedsReview(plugin: Pick<PluginHostListEntry, 'status' | 'needsReconsent'>) {
  return plugin.needsReconsent || plugin.status === 'pending'
}

/** The user has it switched on; a crashed plugin still counts, so the switch can turn it off. */
export function isPluginEnabled(plugin: Pick<PluginHostListEntry, 'status'>): boolean {
  return (
    plugin.status === 'running' ||
    plugin.status === 'restarting' ||
    plugin.status === 'idle' ||
    plugin.status === 'errored'
  )
}

export function pluginStatusKind(plugin: PluginStatusFields): PluginStatusKind {
  if (plugin.blockedByKillList) {
    return 'blocked'
  }
  if (pluginNeedsReview(plugin)) {
    return 'review'
  }
  if (plugin.status === 'restarting') {
    return 'restarting'
  }
  if (plugin.status === 'errored') {
    return 'error'
  }
  if (plugin.status === 'invalid') {
    return 'invalid'
  }
  if (plugin.status === 'disabled') {
    return 'disabled'
  }
  return plugin.status === 'running' ? 'running' : 'enabled'
}

export function pluginStatusLabel(kind: PluginStatusKind): string {
  switch (kind) {
    case 'blocked':
      return translate('auto.components.settings.PluginSettingsRow.blocked', 'Blocked')
    case 'review':
      return translate('auto.components.settings.PluginSettingsRow.needsReview', 'Needs review')
    case 'restarting':
      return translate('auto.components.settings.PluginSettingsRow.restarting', 'Restarting')
    case 'error':
      return translate('auto.components.settings.PluginSettingsRow.error', 'Error')
    case 'invalid':
      return translate('auto.components.settings.PluginSettingsRow.invalid', 'Invalid')
    case 'disabled':
      return translate('auto.components.settings.PluginSettingsRow.disabled', 'Disabled')
    case 'running':
      return translate('auto.components.settings.PluginSettingsRow.running', 'Running')
    case 'enabled':
      return translate('auto.components.settings.PluginSettingsRow.enabled', 'Enabled')
  }
}
