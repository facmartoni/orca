// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../shared/plugins/plugin-editor-theme-artifact'
import {
  createPluginEditorThemeCatalog,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'
import type { MonacoThemeRegistry } from './monaco-themes'

const BASE_BY_MODE = {
  dark: 'vs-dark',
  light: 'vs',
  'hc-dark': 'hc-black',
  'hc-light': 'hc-light'
} as const satisfies Record<
  PluginEditorThemeRegistration['mode'],
  PluginEditorThemeRegistration['data']['base']
>

function theme(
  pluginKey: string,
  localId: string,
  mode: PluginEditorThemeRegistration['mode'] = 'dark',
  label = localId,
  colors: Record<string, string> = {}
): PluginEditorThemeRegistration {
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label,
    mode,
    data: {
      base: BASE_BY_MODE[mode],
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#0a0614',
        'editor.foreground': '#f0e7f3',
        ...colors
      }
    }
  }
}

function registry(defineTheme: MonacoThemeRegistry['editor']['defineTheme']): MonacoThemeRegistry {
  return { editor: { defineTheme } }
}

const RUNTIME_MODULE_PATH = './plugin-editor-theme-runtime'

async function loadRuntime() {
  // Dynamic import is intentional: RED has no runtime module yet, so collection must not resolve it.
  return import(/* @vite-ignore */ RUNTIME_MODULE_PATH)
}

let disposeRuntime: (() => void) | undefined

beforeEach(() => {
  vi.stubGlobal('api', { plugins: {} })
  usePluginEditorThemeStore.setState({
    pending: { generation: 1, registrations: [] },
    active: createPluginEditorThemeCatalog([], 0),
    loading: false,
    error: null
  })
})

afterEach(() => {
  disposeRuntime?.()
  disposeRuntime = undefined
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('plugin editor theme runtime', () => {
  it('processes a pending snapshot that predates runtime initialization', async () => {
    const registration = theme('tests.snapshot-owner', 'snapshot')
    usePluginEditorThemeStore.setState({
      pending: { generation: 7, registrations: [registration] }
    })
    const defineTheme = vi.fn()
    const { initializePluginEditorThemeRuntime } = await loadRuntime()

    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))

    expect(defineTheme).toHaveBeenCalledExactlyOnceWith(
      registration.monacoName,
      registration.data
    )
    const active = usePluginEditorThemeStore.getState().active
    expect(active.revision).toBe(7)
    expect(active.all).toEqual([registration])
    expect(active.byId.get(registration.id)).toBe(registration)
  })

  it('defines every accepted theme before publishing one final active catalog', async () => {
    const first = theme('tests.atomic-owner-a', 'first', 'dark', 'Alpha')
    const second = theme('tests.atomic-owner-b', 'second', 'light', 'Bravo')
    usePluginEditorThemeStore.setState({
      pending: { generation: 8, registrations: [first, second] }
    })
    const initialActive = usePluginEditorThemeStore.getState().active
    const activeDuringDefinitions: unknown[] = []
    const defineTheme = vi.fn(() => {
      activeDuringDefinitions.push(usePluginEditorThemeStore.getState().active)
    })
    const { initializePluginEditorThemeRuntime } = await loadRuntime()

    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))

    expect(activeDuringDefinitions).toEqual([initialActive, initialActive])
    const active = usePluginEditorThemeStore.getState().active
    expect(active.revision).toBe(8)
    expect(active.all).toEqual([first, second])
  })

  it('excludes an entire failing owner while retaining successful owners', async () => {
    const failedFirst = theme('tests.failing-owner', 'first', 'dark', 'Alpha')
    const retained = theme('tests.retained-owner', 'retained', 'dark', 'Bravo')
    const failedSecond = theme('tests.failing-owner', 'second', 'dark', 'Charlie')
    usePluginEditorThemeStore.setState({
      pending: {
        generation: 9,
        registrations: [failedFirst, retained, failedSecond]
      }
    })
    const defineTheme = vi.fn((name: string) => {
      if (name === failedSecond.monacoName) {
        throw new Error('owner definition failed')
      }
    })
    const { initializePluginEditorThemeRuntime } = await loadRuntime()

    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))

    expect(defineTheme).toHaveBeenCalledWith(failedFirst.monacoName, failedFirst.data)
    expect(defineTheme).toHaveBeenCalledWith(failedSecond.monacoName, failedSecond.data)
    expect(defineTheme).toHaveBeenCalledWith(retained.monacoName, retained.data)
    const active = usePluginEditorThemeStore.getState().active
    expect(active.revision).toBe(9)
    expect(active.all).toEqual([retained])
    expect(active.byId.has(failedFirst.id)).toBe(false)
    expect(active.byId.has(failedSecond.id)).toBe(false)
    expect(active.byId.get(retained.id)).toBe(retained)
  })

  it('redefines the same public ID when a newer generation changes its data', async () => {
    const original = theme('tests.refresh-owner', 'stable-id', 'dark', 'Stable', {
      'editor.foreground': '#111111'
    })
    const updated = theme('tests.refresh-owner', 'stable-id', 'dark', 'Stable', {
      'editor.foreground': '#222222'
    })
    usePluginEditorThemeStore.setState({
      pending: { generation: 10, registrations: [original] }
    })
    const defineTheme = vi.fn()
    const { initializePluginEditorThemeRuntime } = await loadRuntime()
    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))

    usePluginEditorThemeStore.setState({
      pending: { generation: 11, registrations: [updated] }
    })

    expect(original.id).toBe(updated.id)
    expect(original.monacoName).toBe(updated.monacoName)
    expect(defineTheme).toHaveBeenCalledTimes(2)
    expect(defineTheme).toHaveBeenNthCalledWith(1, original.monacoName, original.data)
    expect(defineTheme).toHaveBeenNthCalledWith(2, updated.monacoName, updated.data)
    const active = usePluginEditorThemeStore.getState().active
    expect(active.revision).toBe(11)
    expect(active.byId.get(updated.id)).toBe(updated)
  })

  it('stops definitions and active commits after its disposer runs', async () => {
    const initial = theme('tests.dispose-owner', 'initial')
    const ignored = theme('tests.dispose-owner', 'ignored')
    usePluginEditorThemeStore.setState({
      pending: { generation: 12, registrations: [initial] }
    })
    const defineTheme = vi.fn()
    const { initializePluginEditorThemeRuntime } = await loadRuntime()
    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))
    const activeBeforeDispose = usePluginEditorThemeStore.getState().active

    if (!disposeRuntime) {
      throw new Error('runtime did not return a disposer')
    }
    disposeRuntime()
    disposeRuntime = undefined
    usePluginEditorThemeStore.setState({
      pending: { generation: 13, registrations: [ignored] }
    })

    expect(defineTheme).toHaveBeenCalledExactlyOnceWith(initial.monacoName, initial.data)
    expect(usePluginEditorThemeStore.getState().active).toBe(activeBeforeDispose)
    expect(usePluginEditorThemeStore.getState().active.revision).toBe(12)
  })
})

describe('plugin editor theme runtime races', () => {
  it('drains a newer pending generation non-recursively and skips the obsolete remainder', async () => {
    const oldA = theme('tests.reentrant-owner', 'old-a', 'dark', 'Old A')
    const oldB = theme('tests.reentrant-owner', 'old-b', 'dark', 'Old B')
    const current = theme('tests.current-owner', 'current', 'dark', 'Current')
    usePluginEditorThemeStore.setState({
      pending: { generation: 20, registrations: [oldA, oldB] }
    })
    const calls: string[] = []
    let callDepth = 0
    let maxCallDepth = 0
    const defineTheme = vi.fn((name: string) => {
      callDepth += 1
      maxCallDepth = Math.max(maxCallDepth, callDepth)
      try {
        calls.push(name)
        if (name === oldA.monacoName) {
          usePluginEditorThemeStore.setState({
            pending: { generation: 21, registrations: [current] }
          })
        }
      } finally {
        callDepth -= 1
      }
    })
    const { initializePluginEditorThemeRuntime } = await loadRuntime()

    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))

    expect(maxCallDepth).toBe(1)
    expect(calls).toEqual([oldA.monacoName, current.monacoName])
    expect(calls).not.toContain(oldB.monacoName)
    const active = usePluginEditorThemeStore.getState().active
    expect(active.revision).toBe(21)
    expect(active.all).toEqual([current])
  })

  it('does not redefine themes when only loading, error, or active changes', async () => {
    const registration = theme('tests.pending-only-trigger', 'stable')
    usePluginEditorThemeStore.setState({
      pending: { generation: 22, registrations: [registration] }
    })
    const defineTheme = vi.fn()
    const { initializePluginEditorThemeRuntime } = await loadRuntime()
    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))

    usePluginEditorThemeStore.setState({ loading: true })
    usePluginEditorThemeStore.setState({ error: 'refresh failed' })
    usePluginEditorThemeStore.setState({
      active: createPluginEditorThemeCatalog([], 22)
    })

    expect(defineTheme).toHaveBeenCalledExactlyOnceWith(
      registration.monacoName,
      registration.data
    )
  })

  it('stops the current drain without a commit when disposed during the first definition', async () => {
    usePluginEditorThemeStore.setState({
      pending: { generation: 30, registrations: [] }
    })
    const first = theme('tests.dispose-during-owner', 'first', 'dark', 'First')
    const second = theme('tests.dispose-during-owner', 'second', 'dark', 'Second')
    const calls: string[] = []
    const defineTheme = vi.fn((name: string) => {
      calls.push(name)
      if (name === first.monacoName) {
        disposeRuntime?.()
      }
    })
    const { initializePluginEditorThemeRuntime } = await loadRuntime()
    disposeRuntime = initializePluginEditorThemeRuntime(registry(defineTheme))
    const activeBeforeDrain = usePluginEditorThemeStore.getState().active

    usePluginEditorThemeStore.setState({
      pending: { generation: 31, registrations: [first, second] }
    })

    expect(calls).toEqual([first.monacoName])
    expect(calls).not.toContain(second.monacoName)
    expect(usePluginEditorThemeStore.getState().active).toBe(activeBeforeDrain)
    expect(usePluginEditorThemeStore.getState().active.revision).toBe(30)
  })
})
