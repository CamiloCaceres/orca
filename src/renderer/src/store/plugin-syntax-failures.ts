import { create } from 'zustand'
import type { PluginGrammarFailure } from '@/lib/monaco-languages/plugin-grammar-worker-client'

type PluginSyntaxFailureState = {
  /** One entry per plugin syntax whose grammar failed this session; its plugin card says so. */
  failures: Record<string, PluginGrammarFailure>
}

export const usePluginSyntaxFailureStore = create<PluginSyntaxFailureState>()(() => ({
  failures: {}
}))

export function recordPluginSyntaxFailure(
  syntaxId: string,
  reason: PluginGrammarFailure
): void {
  if (usePluginSyntaxFailureStore.getState().failures[syntaxId]) {
    return
  }
  console.warn(`[plugins] ${syntaxId} shows plain text (${reason})`)
  usePluginSyntaxFailureStore.setState((state) => ({
    failures: { ...state.failures, [syntaxId]: reason }
  }))
}
