import { useEffect } from 'react'
import {
  markPluginEditorThemeRuntimeFailed,
  markPluginEditorThemeRuntimeLoading
} from '@/store/plugin-editor-themes'

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

let runtimeLoad: Promise<void> | undefined

export function ensurePluginEditorThemeRuntimeLoaded(
  loadRuntime: PluginEditorThemeRuntimeLoader = () => import('@/lib/monaco-setup')
): Promise<void> {
  if (runtimeLoad) {
    return runtimeLoad
  }
  markPluginEditorThemeRuntimeLoading()
  // Monaco is a heavy renderer bundle; callers must opt into loading its runtime explicitly.
  runtimeLoad = loadPluginEditorThemeRuntimeWithRetry(loadRuntime).catch((error: unknown) => {
    runtimeLoad = undefined
    markPluginEditorThemeRuntimeFailed()
    console.error('[Plugin Editor Themes] Failed to initialize Monaco runtime', error)
  })
  return runtimeLoad
}

export function usePluginEditorThemeRuntime(): void {
  useEffect(() => {
    void ensurePluginEditorThemeRuntimeLoaded()
  }, [])
}
