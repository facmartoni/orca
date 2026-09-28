// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../shared/constants'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName,
  type PluginEditorThemeRegistration
} from '../../../shared/plugins/plugin-editor-theme-artifact'
import type { Repo } from '../../../shared/repo-types'
import {
  buildCmdJSettingsResults,
  rankCmdJMiddleResults
} from '@/components/cmd-j/palette-results'
import type { SettingsNavSection } from '@/lib/settings-navigation-types'
import type { RuntimeEnvironmentStatus } from '@/store/slices/runtime-status-types'

const navState = vi.hoisted(() => ({
  settings: null as GlobalSettings | null,
  repos: [] as Repo[]
}))
const monacoSetupLoaded = vi.hoisted(() => vi.fn())

type MockedSettingsNavState = {
  settings: GlobalSettings | null
  repos: Repo[]
  activeWorktreeId: null
  runtimeEnvironments: []
  runtimeStatusByEnvironmentId: Map<string, RuntimeEnvironmentStatus>
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: MockedSettingsNavState) => unknown) =>
    selector({
      settings: navState.settings,
      repos: navState.repos,
      activeWorktreeId: null,
      runtimeEnvironments: [],
      runtimeStatusByEnvironmentId: new Map()
    })
}))

vi.mock('@/hooks/useLinearProviderConnected', () => ({
  useLinearProviderConnected: () => false
}))

vi.mock('@/lib/web-client-location', () => ({
  isWebClientLocation: () => false
}))

vi.mock('@/lib/monaco-setup', () => {
  monacoSetupLoaded()
  return { monaco: {} }
})

import { useSettingsNavigationMetadata } from './useSettingsNavigationMetadata'
import {
  disposePluginEditorThemeChangeSubscription,
  EMPTY_PLUGIN_EDITOR_THEME_CATALOG,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'

function pluginTheme(): PluginEditorThemeRegistration {
  const pluginKey = 'robbyfuu.robbydev-editor-theme'
  const localId = 'robbydev'
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label: 'RobbyDev Cold',
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

function cmdJFindsGeneral(sections: readonly SettingsNavSection[], query: string): boolean {
  return rankCmdJMiddleResults({
    query,
    settingsResults: buildCmdJSettingsResults(sections),
    actionResults: []
  }).some((result) => result.id === 'settings:general')
}

beforeEach(() => {
  navState.settings = getDefaultSettings('/tmp')
  navState.repos = []
  monacoSetupLoaded.mockClear()
  usePluginEditorThemeStore.setState({
    pending: { generation: 0, registrations: [] },
    active: EMPTY_PLUGIN_EDITOR_THEME_CATALOG,
    loading: false,
    error: null,
    runtimeStatus: 'idle'
  })
})

afterEach(() => {
  cleanup()
  disposePluginEditorThemeChangeSubscription()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('loads cold Cmd+J theme discovery from IPC without loading Monaco', async () => {
  const request = Promise.withResolvers<PluginEditorThemeRegistration[]>()
  const listEditorThemes = vi.fn(() => request.promise)
  const onChanged = vi.fn(() => vi.fn())
  vi.stubGlobal('api', { plugins: { listEditorThemes, onChanged } })

  const metadata = renderHook(() => useSettingsNavigationMetadata())

  expect(cmdJFindsGeneral(metadata.result.current, 'Dracula')).toBe(true)
  expect(cmdJFindsGeneral(metadata.result.current, 'Monokai')).toBe(true)
  expect(listEditorThemes).toHaveBeenCalledOnce()
  expect(monacoSetupLoaded).not.toHaveBeenCalled()

  const registration = pluginTheme()
  await act(async () => {
    request.resolve([registration])
    await request.promise
  })

  expect(cmdJFindsGeneral(metadata.result.current, registration.label)).toBe(true)
  expect(cmdJFindsGeneral(metadata.result.current, registration.id)).toBe(true)
  expect(cmdJFindsGeneral(metadata.result.current, registration.pluginKey)).toBe(true)
  expect(monacoSetupLoaded).not.toHaveBeenCalled()
})
