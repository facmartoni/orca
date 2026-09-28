import { useAppStore } from '@/store'
import { resolveEditorTheme } from '@/lib/monaco-themes'
import { usePluginEditorThemes } from '@/store/plugin-editor-themes'
import { useDocumentDarkTheme } from './use-document-dark-theme'

/**
 * Returns the active Monaco editor theme id, dynamically updating
 * when the app theme, OS color scheme, or editor theme setting changes.
 */
export function useEditorTheme(): string {
  const settings = useAppStore((s) => s.settings)
  const isDark = useDocumentDarkTheme()
  const pluginThemes = usePluginEditorThemes()
  return resolveEditorTheme(settings, isDark, pluginThemes)
}
