import type * as monaco from 'monaco-editor'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { resolveDocumentTheme } from './document-theme'
import { DARK_EDITOR_THEMES, type EditorThemeItem } from './monaco-themes-dark'
import { LIGHT_EDITOR_THEMES } from './monaco-themes-light'

export { DARK_EDITOR_THEMES, LIGHT_EDITOR_THEMES, type EditorThemeItem }

export const DEFAULT_EDITOR_THEME_DARK = 'vs-dark'
export const DEFAULT_EDITOR_THEME_LIGHT = 'vs'

export const ALL_EDITOR_THEMES: EditorThemeItem[] = [...DARK_EDITOR_THEMES, ...LIGHT_EDITOR_THEMES]

export function isKnownEditorTheme(id: string, mode?: 'dark' | 'light'): boolean {
  if (mode === 'dark') {
    return DARK_EDITOR_THEMES.some((t) => t.id === id)
  }
  if (mode === 'light') {
    return LIGHT_EDITOR_THEMES.some((t) => t.id === id)
  }
  return ALL_EDITOR_THEMES.some((t) => t.id === id)
}

export type MonacoThemeRegistry = {
  editor: {
    defineTheme: (name: string, themeData: monaco.editor.IStandaloneThemeData) => void
  }
}

export function registerMonacoThemes(monacoInstance: MonacoThemeRegistry): void {
  for (const theme of ALL_EDITOR_THEMES) {
    if (theme.data) {
      monacoInstance.editor.defineTheme(theme.id, theme.data)
    }
  }
}

export function resolveEditorTheme(
  settings?: Partial<Pick<GlobalSettings, 'theme' | 'editorThemeDark' | 'editorThemeLight'>> | null,
  matchMedia?: (query: string) => Pick<MediaQueryList, 'matches'>
): string {
  const isDark = resolveDocumentTheme(settings?.theme ?? 'system', matchMedia)
  if (isDark) {
    const configured = settings?.editorThemeDark
    return configured && isKnownEditorTheme(configured, 'dark')
      ? configured
      : DEFAULT_EDITOR_THEME_DARK
  }

  const configured = settings?.editorThemeLight
  return configured && isKnownEditorTheme(configured, 'light')
    ? configured
    : DEFAULT_EDITOR_THEME_LIGHT
}
