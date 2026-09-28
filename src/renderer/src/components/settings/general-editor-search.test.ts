import { describe, expect, it } from 'vitest'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'
import { ALL_EDITOR_THEMES } from '@/lib/monaco-themes'
import { getGeneralEditorSearchEntries, getGeneralPaneSearchEntries } from './general-search'
import { matchesSettingsSearch } from './settings-search'

function pluginTheme(
  pluginKey: string,
  localId: string,
  label: string
): PluginEditorThemeRegistration {
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label,
    mode: 'dark',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {}
    }
  }
}

describe('collapse unchanged settings search', () => {
  it.each(['collapse unchanged', 'collapse', 'hide unchanged', 'fold', 'diff'])(
    'keeps the setting reachable through both search gates for "%s"',
    (query) => {
      const editorEntries = getGeneralEditorSearchEntries()
      const entry = editorEntries.find((item) => item.title === 'Collapse Unchanged Regions')

      expect(entry).toBeDefined()
      expect(matchesSettingsSearch(query, entry!)).toBe(true)
      expect(matchesSettingsSearch(query, editorEntries)).toBe(true)
      expect(matchesSettingsSearch(query, getGeneralPaneSearchEntries())).toBe(true)
    }
  )
})

describe('editor theme outer General search gate', () => {
  it.each(ALL_EDITOR_THEMES.map((theme) => [theme.id, theme.name] as const))(
    'indexes the visible built-in name for %s',
    (_id, visibleName) => {
      const editorEntries = getGeneralEditorSearchEntries()

      expect(matchesSettingsSearch(visibleName, editorEntries)).toBe(true)
      expect(matchesSettingsSearch(visibleName, getGeneralPaneSearchEntries())).toBe(true)
    }
  )

  it.each(['Dracula', 'Nord', 'Tokyo', 'Catppuccin', 'Monokai', 'GitHub', 'Solarized', 'syntax'])(
    'keeps the editor section reachable for %s',
    (query) => {
      expect(matchesSettingsSearch(query, getGeneralEditorSearchEntries())).toBe(true)
      expect(matchesSettingsSearch(query, getGeneralPaneSearchEntries())).toBe(true)
    }
  )

  it.each(['label', 'public ID', 'plugin key'] as const)(
    'indexes a plugin theme by %s before the inner SearchableSetting gate',
    (field) => {
      const registration = pluginTheme('tests.search-owner', 'oceanic', 'Oceanic Syntax')
      const query =
        field === 'label'
          ? registration.label
          : field === 'public ID'
            ? registration.id
            : registration.pluginKey

      expect(matchesSettingsSearch(query, getGeneralEditorSearchEntries([registration]))).toBe(
        true
      )
    }
  )

  it('refreshes plugin search metadata when the current catalog changes', () => {
    const first = pluginTheme('tests.first-search', 'first', 'First Theme')
    const second = pluginTheme('tests.second-search', 'second', 'Second Theme')

    const firstEntries = getGeneralEditorSearchEntries([first])
    const secondEntries = getGeneralEditorSearchEntries([second])

    expect(matchesSettingsSearch(first.id, firstEntries)).toBe(true)
    expect(matchesSettingsSearch(first.id, secondEntries)).toBe(false)
    expect(matchesSettingsSearch(second.pluginKey, secondEntries)).toBe(true)
  })
})
