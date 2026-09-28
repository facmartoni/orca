// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../shared/plugins/plugin-editor-theme-artifact'
import {
  createPluginEditorThemeCatalog,
  EMPTY_PLUGIN_EDITOR_THEME_CATALOG,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'
import { initializePluginEditorThemeRuntime } from '@/lib/plugin-editor-theme-runtime'
import { resolveEditorTheme } from '@/lib/monaco-themes'
import * as runtimeLoader from './usePluginEditorThemeRuntime'

function pluginTheme(): PluginEditorThemeRegistration {
  const pluginKey = 'tests.runtime-recovery'
  const localId = 'recoverable'
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label: 'Recoverable',
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

let disposeRuntime: (() => void) | undefined

beforeEach(() => {
  vi.stubGlobal('api', { plugins: {} })
  usePluginEditorThemeStore.setState({
    pending: { generation: 0, registrations: [] },
    active: EMPTY_PLUGIN_EDITOR_THEME_CATALOG,
    loading: false,
    error: null,
    runtimeStatus: 'idle'
  })
})

afterEach(() => {
  disposeRuntime?.()
  disposeRuntime = undefined
  vi.unstubAllGlobals()
})

describe('plugin editor theme runtime lazy loading', () => {
  it('settles after one rejected import is retried successfully', async () => {
    const loadRuntime = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('transient chunk failure'))
      .mockResolvedValueOnce({})

    await expect(
      runtimeLoader.loadPluginEditorThemeRuntimeWithRetry(loadRuntime)
    ).resolves.toBeUndefined()
    expect(loadRuntime).toHaveBeenCalledTimes(2)
  })

  it('stops after two rejected import attempts', async () => {
    const loadRuntime = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error('persistent chunk failure'))

    await expect(runtimeLoader.loadPluginEditorThemeRuntimeWithRetry(loadRuntime)).rejects.toThrow(
      'persistent chunk failure'
    )
    expect(loadRuntime).toHaveBeenCalledTimes(2)
  })

  it('publishes terminal fallback after persistent failure and recovers on a later success', async () => {
    const registration = pluginTheme()
    usePluginEditorThemeStore.setState({
      pending: { generation: 4, registrations: [registration] },
      active: createPluginEditorThemeCatalog([registration], 3),
      loading: true
    })
    const failedLoad = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error('persistent chunk failure'))

    await runtimeLoader.ensurePluginEditorThemeRuntimeLoaded(failedLoad)

    const failed = usePluginEditorThemeStore.getState()
    expect(failed.runtimeStatus).toBe('failed')
    expect(failed.active.all).toEqual([])
    expect(resolveEditorTheme({ editorThemeDark: registration.id }, true, failed.active)).toBe(
      'vs-dark'
    )

    usePluginEditorThemeStore.setState({
      pending: { generation: 5, registrations: [registration] },
      loading: false
    })
    await runtimeLoader.ensurePluginEditorThemeRuntimeLoaded(async () => {
      disposeRuntime = initializePluginEditorThemeRuntime({
        editor: { defineTheme: vi.fn() }
      })
    })

    const recovered = usePluginEditorThemeStore.getState()
    expect(recovered.runtimeStatus).toBe('ready')
    expect(recovered.active.revision).toBe(5)
    expect(resolveEditorTheme({ editorThemeDark: registration.id }, true, recovered.active)).toBe(
      registration.monacoName
    )
  })
})
