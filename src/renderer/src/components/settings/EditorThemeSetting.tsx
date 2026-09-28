import { useMemo } from 'react'
import type React from 'react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'
import { translate } from '@/i18n/i18n'
import {
  DARK_EDITOR_THEMES,
  DEFAULT_EDITOR_THEME_DARK,
  DEFAULT_EDITOR_THEME_LIGHT,
  LIGHT_EDITOR_THEMES,
  matchesEditorThemeFamily
} from '@/lib/monaco-themes'
import {
  usePluginEditorThemeOptions,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'
import { usePluginEditorThemeRuntime } from '@/hooks/usePluginEditorThemeRuntime'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow } from './SettingsFormControls'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { getEditorThemeSearchKeywords } from './editor-theme-search-metadata'

type EditorThemeSettingProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void
}


function getDuplicatePluginThemeLabels(
  builtIns: readonly { name: string }[],
  plugins: readonly PluginEditorThemeRegistration[]
): ReadonlySet<string> {
  const countByLabel = new Map<string, number>()
  for (const theme of builtIns) {
    countByLabel.set(theme.name, (countByLabel.get(theme.name) ?? 0) + 1)
  }
  for (const theme of plugins) {
    countByLabel.set(theme.label, (countByLabel.get(theme.label) ?? 0) + 1)
  }

  const duplicates = new Set<string>()
  for (const [label, count] of countByLabel) {
    if (count > 1) {
      duplicates.add(label)
    }
  }
  return duplicates
}

/**
 * Settings row controls for configuring Monaco editor themes in dark and light modes.
 */
export function EditorThemeSetting({
  settings,
  updateSettings
}: EditorThemeSettingProps): React.JSX.Element {
  usePluginEditorThemeRuntime()
  const pluginThemes = usePluginEditorThemeOptions()
  const themesSettled = usePluginEditorThemeStore(
    (state) =>
      state.pending.generation > 0 &&
      !state.loading &&
      state.active.revision === state.pending.generation
  )
  const darkPluginThemes = useMemo(
    () => pluginThemes.filter((theme) => matchesEditorThemeFamily(theme.mode, 'dark')),
    [pluginThemes]
  )
  const lightPluginThemes = useMemo(
    () => pluginThemes.filter((theme) => matchesEditorThemeFamily(theme.mode, 'light')),
    [pluginThemes]
  )
  const darkDuplicateLabels = useMemo(
    () => getDuplicatePluginThemeLabels(DARK_EDITOR_THEMES, darkPluginThemes),
    [darkPluginThemes]
  )
  const lightDuplicateLabels = useMemo(
    () => getDuplicatePluginThemeLabels(LIGHT_EDITOR_THEMES, lightPluginThemes),
    [lightPluginThemes]
  )
  const darkSearchKeywords = useMemo(
    () => getEditorThemeSearchKeywords(pluginThemes, 'dark'),
    [pluginThemes]
  )
  const lightSearchKeywords = useMemo(
    () => getEditorThemeSearchKeywords(pluginThemes, 'light'),
    [pluginThemes]
  )

  const darkThemeTitle = translate(
    'auto.components.settings.EditorThemeSetting.darkTitle',
    'Editor Theme (Dark Mode)'
  )
  const darkThemeDescription = translate(
    'auto.components.settings.EditorThemeSetting.darkDescription',
    'Theme used by file editors and diff viewers when Orca is in dark mode.'
  )
  const lightThemeTitle = translate(
    'auto.components.settings.EditorThemeSetting.lightTitle',
    'Editor Theme (Light Mode)'
  )
  const lightThemeDescription = translate(
    'auto.components.settings.EditorThemeSetting.lightDescription',
    'Theme used by file editors and diff viewers when Orca is in light mode.'
  )
  const loadingLabel = translate(
    'auto.components.settings.EditorThemeSetting.loading',
    'Loading editor themes…'
  )
  const darkThemeValue = settings.editorThemeDark ?? DEFAULT_EDITOR_THEME_DARK
  const lightThemeValue = settings.editorThemeLight ?? DEFAULT_EDITOR_THEME_LIGHT
  const darkThemeAvailable =
    DARK_EDITOR_THEMES.some((theme) => theme.id === darkThemeValue) ||
    darkPluginThemes.some((theme) => theme.id === darkThemeValue)
  const lightThemeAvailable =
    LIGHT_EDITOR_THEMES.some((theme) => theme.id === lightThemeValue) ||
    lightPluginThemes.some((theme) => theme.id === lightThemeValue)
  const darkUnavailableLabel =
    themesSettled && !darkThemeAvailable
      ? translate(
          'auto.components.settings.EditorThemeSetting.unavailable',
          'Unavailable — {{value0}}',
          { value0: darkThemeValue }
        )
      : null
  const lightUnavailableLabel =
    themesSettled && !lightThemeAvailable
      ? translate(
          'auto.components.settings.EditorThemeSetting.unavailable',
          'Unavailable — {{value0}}',
          { value0: lightThemeValue }
        )
      : null

  return (
    <>
      <SearchableSetting
        title={darkThemeTitle}
        description={darkThemeDescription}
        keywords={darkSearchKeywords}
      >
        <SettingsRow
          label={darkThemeTitle}
          description={darkThemeDescription}
          control={
            <Select
              value={darkThemeValue}
              onValueChange={(value) => updateSettings({ editorThemeDark: value })}
            >
              <SelectTrigger className="w-[200px]" aria-label={darkThemeTitle}>
                {darkUnavailableLabel ? (
                  <span className="truncate">{darkUnavailableLabel}</span>
                ) : (
                  <SelectValue />
                )}
                {!themesSettled ? (
                  <span className="ml-2 text-xs text-muted-foreground">{loadingLabel}</span>
                ) : null}
              </SelectTrigger>
              <SelectContent>
                {DARK_EDITOR_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
                {darkPluginThemes.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.label}
                    {darkDuplicateLabels.has(theme.label) ? (
                      <span className="text-muted-foreground"> — {theme.pluginKey}</span>
                    ) : null}
                  </SelectItem>
                ))}
                {darkUnavailableLabel ? (
                  <SelectItem value={darkThemeValue} disabled>
                    {darkUnavailableLabel}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          }
        />
      </SearchableSetting>

      <SearchableSetting
        title={lightThemeTitle}
        description={lightThemeDescription}
        keywords={lightSearchKeywords}
      >
        <SettingsRow
          label={lightThemeTitle}
          description={lightThemeDescription}
          control={
            <Select
              value={lightThemeValue}
              onValueChange={(value) => updateSettings({ editorThemeLight: value })}
            >
              <SelectTrigger className="w-[200px]" aria-label={lightThemeTitle}>
                {lightUnavailableLabel ? (
                  <span className="truncate">{lightUnavailableLabel}</span>
                ) : (
                  <SelectValue />
                )}
                {!themesSettled ? (
                  <span className="ml-2 text-xs text-muted-foreground">{loadingLabel}</span>
                ) : null}
              </SelectTrigger>
              <SelectContent>
                {LIGHT_EDITOR_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
                {lightPluginThemes.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.label}
                    {lightDuplicateLabels.has(theme.label) ? (
                      <span className="text-muted-foreground"> — {theme.pluginKey}</span>
                    ) : null}
                  </SelectItem>
                ))}
                {lightUnavailableLabel ? (
                  <SelectItem value={lightThemeValue} disabled>
                    {lightUnavailableLabel}
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          }
        />
      </SearchableSetting>
    </>
  )
}
