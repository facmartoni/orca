import { useEffect } from 'react'

type PluginEditorThemeRuntimeLoader = () => Promise<unknown>

const PLUGIN_EDITOR_THEME_RUNTIME_LOAD_ATTEMPTS = 2

export async function loadPluginEditorThemeRuntimeWithRetry(
  loadRuntime: PluginEditorThemeRuntimeLoader
): Promise<void> {
  let lastError: unknown
  for (let attempt = 0; attempt < PLUGIN_EDITOR_THEME_RUNTIME_LOAD_ATTEMPTS; attempt += 1) {
    try {
      await loadRuntime()
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

let runtimeLoad: Promise<unknown> | undefined

function ensurePluginEditorThemeRuntime(): void {
  if (runtimeLoad) {
    return
  }
  // Monaco is a heavy renderer bundle; Settings loads it only when its UI mounts.
  runtimeLoad = loadPluginEditorThemeRuntimeWithRetry(() => import('@/lib/monaco-setup')).catch(
    (error: unknown) => {
      runtimeLoad = undefined
      console.error('[Plugin Editor Themes] Failed to initialize Monaco runtime', error)
    }
  )
}

export function usePluginEditorThemeRuntime(): void {
  useEffect(() => {
    ensurePluginEditorThemeRuntime()
  }, [])
}
