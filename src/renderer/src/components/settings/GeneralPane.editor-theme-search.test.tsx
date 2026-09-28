// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'

const fake = vi.hoisted(() => ({
  query: '',
  options: [] as PluginEditorThemeRegistration[]
}))

vi.mock('@/i18n/i18n', () => ({
  i18n: { language: 'en' },
  translate: (_key: string, fallback: string, values?: Record<string, string | number>) =>
    Object.entries(values ?? {}).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)),
      fallback
    )
}))

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
      colors: {}
    }
  }
}

beforeEach(() => {
  fake.query = ''
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
