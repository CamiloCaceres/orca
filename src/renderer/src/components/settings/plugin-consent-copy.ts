import { translate } from '@/i18n/i18n'
import type { PluginExecutionProfile } from '../../../../shared/plugins/plugin-execution-profile'
import type { PluginConsentTier } from './plugin-access-profile'

export function consentTierForExecution(execution: PluginExecutionProfile): PluginConsentTier {
  switch (execution) {
    case 'trusted-worker':
      return 'worker'
    case 'instructional':
      return 'instructional'
    case 'sandboxed-ui':
      return 'panel'
    case 'data':
      return 'declarative'
  }
}

/** One word for the profile chip; the warning carries the explanation. */
export function consentTierLabel(tier: PluginConsentTier): string {
  switch (tier) {
    case 'worker':
      return translate('auto.components.settings.PluginConsentDialog.trustShortWorker', 'Worker')
    case 'instructional':
      return translate(
        'auto.components.settings.PluginConsentDialog.trustShortInstructional',
        'Instructional'
      )
    case 'panel':
      return translate('auto.components.settings.PluginConsentDialog.trustShortPanel', 'Panel')
    case 'declarative':
      return translate(
        'auto.components.settings.PluginConsentDialog.trustShortDeclarative',
        'Declarative'
      )
  }
}

export function consentTierWarning(tier: PluginConsentTier): string {
  switch (tier) {
    case 'worker':
      return translate(
        'auto.components.settings.PluginConsentDialog.warning',
        'Its worker runs as a normal process with full access to your files, network, and other processes.'
      )
    case 'instructional':
      return translate(
        'auto.components.settings.PluginConsentDialog.instructionalWarning',
        'Its commands and instructions can take actions when you or an agent use them.'
      )
    case 'panel':
      return translate(
        'auto.components.settings.PluginConsentDialog.panelWarning',
        'No background worker. These permissions limit what it can do in Orca.'
      )
    case 'declarative':
      return translate(
        'auto.components.settings.PluginConsentDialog.declarativeWarning',
        "Content only: no code, no background worker, and no access to Orca's API."
      )
  }
}
