import type * as monaco from 'monaco-editor'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { PluginEditorThemeMode } from '../../../shared/plugins/plugin-content-pack-contributions'
import type { PluginEditorThemeCatalog } from '@/store/plugin-editor-themes'
import { resolveDocumentTheme } from './document-theme'
import { DARK_EDITOR_THEMES } from './monaco-themes-dark'
import type { EditorThemeItem } from './monaco-themes-dark'
import { LIGHT_EDITOR_THEMES } from './monaco-themes-light'

export { DARK_EDITOR_THEMES, LIGHT_EDITOR_THEMES, type EditorThemeItem }

export const DEFAULT_EDITOR_THEME_DARK = 'vs-dark'
export const DEFAULT_EDITOR_THEME_LIGHT = 'vs'

export const ALL_EDITOR_THEMES: EditorThemeItem[] = [...DARK_EDITOR_THEMES, ...LIGHT_EDITOR_THEMES]

const BUILT_IN_EDITOR_THEME_BY_ID = new Map(
  ALL_EDITOR_THEMES.map((theme) => [theme.id, theme] as const)
)

export type EditorThemeFamily = 'dark' | 'light'

export function matchesEditorThemeFamily(
  mode: PluginEditorThemeMode,
  family: EditorThemeFamily
): boolean {
  return family === 'dark'
    ? mode === 'dark' || mode === 'hc-dark'
    : mode === 'light' || mode === 'hc-light'
}

/**
 * Checks whether the given theme ID is registered in the theme catalog.
 *
 * @param id - The theme identifier to check.
 * @param mode - Optional mode ('dark' | 'light') to restrict the search.
 * @returns True if the theme is recognized for the specified mode.
 */
export function isKnownEditorTheme(id: string, mode?: EditorThemeFamily): boolean {
  const theme = BUILT_IN_EDITOR_THEME_BY_ID.get(id)
  return theme !== undefined && (mode === undefined || theme.mode === mode)
}

export type MonacoThemeRegistry = {
  editor: {
    defineTheme: (name: string, themeData: monaco.editor.IStandaloneThemeData) => void
  }
}

/**
 * Registers all custom Monaco editor themes with the provided Monaco instance.
 *
 * @param monacoInstance - The Monaco theme registry instance to define themes on.
 */
export function registerMonacoThemes(monacoInstance: MonacoThemeRegistry): void {
  for (const theme of ALL_EDITOR_THEMES) {
    if (theme.data) {
      monacoInstance.editor.defineTheme(theme.id, theme.data)
    }
  }
}

/**
 * Resolves the active Monaco editor theme ID based on settings and color scheme mode.
 *
 * @param settings - The global settings object or partial settings containing theme preferences.
 * @param isDarkOrMatchMedia - Explicit boolean indicating dark mode, or a matchMedia function for testing.
 * @returns The resolved Monaco theme identifier.
 */
export function resolveEditorTheme(
  settings?: Partial<Pick<GlobalSettings, 'theme' | 'editorThemeDark' | 'editorThemeLight'>> | null,
  isDarkOrMatchMedia?: boolean | ((query: string) => Pick<MediaQueryList, 'matches'>),
  pluginCatalog?: PluginEditorThemeCatalog
): string {
  const isDark =
    typeof isDarkOrMatchMedia === 'boolean'
      ? isDarkOrMatchMedia
      : resolveDocumentTheme(
          settings?.theme ?? 'system',
          typeof isDarkOrMatchMedia === 'function' ? isDarkOrMatchMedia : undefined
        )
  const family: EditorThemeFamily = isDark ? 'dark' : 'light'
  const fallback = isDark ? DEFAULT_EDITOR_THEME_DARK : DEFAULT_EDITOR_THEME_LIGHT
  const configured = isDark ? settings?.editorThemeDark : settings?.editorThemeLight
  if (!configured) {
    return fallback
  }

  const builtIn = BUILT_IN_EDITOR_THEME_BY_ID.get(configured)
  if (builtIn) {
    return builtIn.mode === family ? builtIn.id : fallback
  }

  const pluginTheme = pluginCatalog?.byId.get(configured)
  return pluginTheme && matchesEditorThemeFamily(pluginTheme.mode, family)
    ? pluginTheme.monacoName
    : fallback
}
