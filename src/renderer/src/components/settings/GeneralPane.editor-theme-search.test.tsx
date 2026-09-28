// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'
import type * as GeneralSearchModule from './general-search'

const fake = vi.hoisted(() => ({
  query: '',
  options: [] as PluginEditorThemeRegistration[]
}))
const localeState = vi.hoisted(() => {
  const state = {
    language: 'en',
    async changeLanguage(language: string): Promise<void> {
      state.language = language
    }
  }
  return state
})


vi.mock('@/i18n/i18n', () => ({
  i18n: localeState,
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
      fallback
    )
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: localeState })
}))

vi.mock('./general-search', async (importOriginal) => {
  const actual = await importOriginal<typeof GeneralSearchModule>()
  return {
    ...actual,
    getGeneralEditorSearchEntries: (
      ...args: Parameters<typeof actual.getGeneralEditorSearchEntries>
    ) => [
      ...actual.getGeneralEditorSearchEntries(...args),
      { title: 'Locale probe', keywords: [`locale-${localeState.language}`] }
    ]
  }
})

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      settingsSearchQuery: fake.query,
      worktreeVisibilitySourceDefaultsSupportedRuntimeEnvironmentId: undefined,
      worktreeVisibilityDefaultsSupportedRuntimeEnvironmentId: undefined
    })
}))

vi.mock('@/store/plugin-editor-themes', () => ({
  usePluginEditorThemeOptions: () => fake.options
}))

vi.mock('./GeneralEditorSettingsSection', () => ({
  GeneralEditorSettingsSection: () => <div>Editor settings section</div>
}))
vi.mock('./GeneralWorkspaceSettingsSection', () => ({
  GeneralWorkspaceSettingsSection: () => null
}))
vi.mock('./CliSection', () => ({ CliSection: () => null }))
vi.mock('./GeneralSupportSection', () => ({ GeneralSupportSection: () => null }))
vi.mock('./GeneralUpdateSettingsSection', () => ({ GeneralUpdateSettingsSection: () => null }))
vi.mock('./DefaultWindowsProjectRuntimeSetting', () => ({
  DefaultWindowsProjectRuntimeSetting: () => null
}))
vi.mock('./RecentTabOrderControl', () => ({ RecentTabOrderControl: () => null }))

import { GeneralPane } from './GeneralPane'

function pluginTheme(): PluginEditorThemeRegistration {
  const pluginKey = 'tests.general-search'
  const localId = 'oceanic'
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label: 'Oceanic Syntax',
    mode: 'dark',
    data: {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0614',
        'editor.foreground': '#f0e7f3'
      }
    }
  }
}

beforeEach(() => {
  fake.query = ''
  localeState.language = 'en'
  fake.options = []
})

afterEach(() => {
  cleanup()
})

it('keeps the editor section gate reactive to plugin label, public ID, and plugin key', () => {
  const registration = pluginTheme()
  const props = {
    settings: getDefaultSettings('/synthetic'),
    updateSettings: vi.fn(),
    fontSuggestions: []
  }
  fake.options = [registration]
  fake.query = registration.label

  const view = render(<GeneralPane {...props} />)
  expect(screen.getByText('Editor settings section')).toBeTruthy()

  fake.query = registration.id
  view.rerender(<GeneralPane {...props} />)
  expect(screen.getByText('Editor settings section')).toBeTruthy()

  fake.query = registration.pluginKey
  view.rerender(<GeneralPane {...props} />)
  expect(screen.getByText('Editor settings section')).toBeTruthy()

  fake.options = []
  view.rerender(<GeneralPane {...props} />)
  expect(screen.queryByText('Editor settings section')).toBeNull()
})

it('recomputes the outer editor search gate after the active locale changes', async () => {
  const props = {
    settings: getDefaultSettings('/synthetic'),
    updateSettings: vi.fn(),
    fontSuggestions: []
  }
  fake.query = 'locale-fr'
  const view = render(<GeneralPane {...props} />)
  expect(screen.queryByText('Editor settings section')).toBeNull()

  await localeState.changeLanguage('fr')
  view.rerender(<GeneralPane {...props} />)

  expect(screen.getByText('Editor settings section')).toBeTruthy()
})
