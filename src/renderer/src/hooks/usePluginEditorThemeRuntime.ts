import { useEffect } from 'react'

let runtimeLoad: Promise<unknown> | undefined

function ensurePluginEditorThemeRuntime(): void {
  if (runtimeLoad) {
    return
  }
  // Monaco is a heavy renderer bundle; Settings loads it only when its UI mounts.
  runtimeLoad = import('@/lib/monaco-setup').catch((error: unknown) => {
    runtimeLoad = undefined
    console.error('[Plugin Editor Themes] Failed to initialize Monaco runtime', error)
  })
}

export function usePluginEditorThemeRuntime(): void {
  useEffect(() => {
    ensurePluginEditorThemeRuntime()
  }, [])
}
