import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import {
  ALL_EDITOR_THEMES,
  DARK_EDITOR_THEMES,
  LIGHT_EDITOR_THEMES,
  matchesEditorThemeFamily
} from '@/lib/monaco-themes'
import type { EditorThemeFamily } from '@/lib/monaco-themes'
import { translateSearchKeyword } from './settings-search-keywords'

const getStaticEditorThemeSearchKeywords = createLocalizedCatalog(() => {
  const shared = [
    ...translateSearchKeyword('auto.components.settings.general.search.e1ee631696', 'editor'),
    ...translateSearchKeyword('auto.components.settings.general.search.themeKw', 'theme'),
    ...translateSearchKeyword('auto.components.settings.general.search.monacoKw', 'monaco'),
    ...translateSearchKeyword('auto.components.settings.general.search.3b5733573e', 'diff'),
    'syntax'
  ]
  const darkMode = translateSearchKeyword(
    'auto.components.settings.general.search.darkKw',
    'dark'
  )
  const lightMode = translateSearchKeyword(
    'auto.components.settings.general.search.lightKw',
    'light'
  )

  return {
    all: [
      ...shared,
      ...darkMode,
      ...lightMode,
      ...ALL_EDITOR_THEMES.map((theme) => theme.name)
    ],
    dark: [...shared, ...darkMode, ...DARK_EDITOR_THEMES.map((theme) => theme.name)],
    light: [...shared, ...lightMode, ...LIGHT_EDITOR_THEMES.map((theme) => theme.name)]
  }
})

export function getEditorThemeSearchKeywords(
  registrations: readonly PluginEditorThemeRegistration[],
  family?: EditorThemeFamily
): string[] {
  const staticKeywords = getStaticEditorThemeSearchKeywords()
  const baseKeywords = family ? staticKeywords[family] : staticKeywords.all
  if (registrations.length === 0) {
    return baseKeywords
  }

  const keywords = [...baseKeywords]
  const seen = new Set(keywords)
  for (const registration of registrations) {
    if (family && !matchesEditorThemeFamily(registration.mode, family)) {
      continue
    }
    for (const term of [registration.label, registration.id, registration.pluginKey]) {
      if (!seen.has(term)) {
        seen.add(term)
        keywords.push(term)
      }
    }
  }
  return keywords
}
