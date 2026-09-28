// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'
import {
  createPluginEditorThemeCatalog,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'

function pluginTheme(): PluginEditorThemeRegistration {
  const pluginKey = 'tests.hook-theme'
  const localId = 'reactive'
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label: 'Reactive Theme',
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

let mockSettings: Partial<GlobalSettings> = {
  theme: 'system',
  editorThemeDark: 'dracula',
  editorThemeLight: 'one-light'
}
let mockIsDark = true

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: { settings: Partial<GlobalSettings> }) => unknown) =>
    selector({ settings: mockSettings })
}))

vi.mock('./use-document-dark-theme', () => ({
  useDocumentDarkTheme: () => mockIsDark
}))

import { useEditorTheme } from './use-editor-theme'

beforeEach(() => {
  usePluginEditorThemeStore.setState({
    pending: { generation: 1, registrations: [] },
    active: createPluginEditorThemeCatalog([], 1),
    loading: false,
    error: null
  })
})

afterEach(() => {
  cleanup()
})

describe('useEditorTheme', () => {
  beforeEach(() => {
    mockSettings = {
      theme: 'system',
      editorThemeDark: 'dracula',
      editorThemeLight: 'one-light'
    }
    mockIsDark = true
  })

  it('returns configured dark theme when document theme is dark', () => {
    mockIsDark = true
    const { result } = renderHook(() => useEditorTheme())
    expect(result.current).toBe('dracula')
  })

  it('returns configured light theme when document theme is light', () => {
    mockIsDark = false
    const { result } = renderHook(() => useEditorTheme())
    expect(result.current).toBe('one-light')
  })

  it('falls back to default themes when configured themes are not set', () => {
    mockSettings = {}
    mockIsDark = true
    const { result: darkResult } = renderHook(() => useEditorTheme())
    expect(darkResult.current).toBe('vs-dark')

    mockIsDark = false
    const { result: lightResult } = renderHook(() => useEditorTheme())
    expect(lightResult.current).toBe('vs')
  })
})

describe('plugin editor theme reactivity', () => {
  it('falls back and recovers when the active catalog changes without mutating settings', () => {
    const registration = pluginTheme()
    const active = createPluginEditorThemeCatalog([registration], 2)
    mockIsDark = true
    mockSettings = {
      theme: 'dark',
      editorThemeDark: registration.id
    }
    usePluginEditorThemeStore.setState({
      pending: { generation: 2, registrations: [registration] },
      active
    })

    const { result } = renderHook(() => useEditorTheme())
    expect(result.current).toBe(registration.monacoName)

    act(() => {
      usePluginEditorThemeStore.setState({
        active: createPluginEditorThemeCatalog([], 2)
      })
    })
    expect(result.current).toBe('vs-dark')

    act(() => {
      usePluginEditorThemeStore.setState({ active })
    })
    expect(result.current).toBe(registration.monacoName)
    expect(mockSettings.editorThemeDark).toBe(registration.id)
  })
})
