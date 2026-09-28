// @vitest-environment happy-dom

import { StrictMode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginChangeEvent } from '../../../shared/plugins/plugin-change-event'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName,
  type PluginEditorThemeRegistration
} from '../../../shared/plugins/plugin-editor-theme-artifact'
import type * as PluginEditorThemeModule from './plugin-editor-themes'

let editorThemes: typeof PluginEditorThemeModule

function theme(localId: string): PluginEditorThemeRegistration {
  const pluginKey = 'tests.editor-themes'
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label: localId,
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

function installBridge() {
  const requests: PromiseWithResolvers<PluginEditorThemeRegistration[]>[] = []
  const listEditorThemes = vi.fn(() => {
    const request = Promise.withResolvers<PluginEditorThemeRegistration[]>()
    requests.push(request)
    return request.promise
  })
  const listeners: ((event?: PluginChangeEvent) => void)[] = []
  const unsubscribers: ReturnType<typeof vi.fn>[] = []
  const onChanged = vi.fn((listener: (event?: PluginChangeEvent) => void) => {
    listeners.push(listener)
    const unsubscribe = vi.fn(() => {
      const index = listeners.indexOf(listener)
      if (index >= 0) {
        listeners.splice(index, 1)
      }
    })
    unsubscribers.push(unsubscribe)
    return unsubscribe
  })
  vi.stubGlobal('api', { plugins: { listEditorThemes, onChanged } })
  return { requests, listEditorThemes, listeners, onChanged, unsubscribers }
}

beforeEach(async () => {
  vi.resetModules()
  // Dynamic import is intentional: each test needs fresh generation and subscription state.
  editorThemes = await import('./plugin-editor-themes')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('plugin editor theme startup ownership', () => {
  it.each([false, true])(
    'shares one request and one subscription across consumers (StrictMode: %s)',
    async (strict) => {
      const bridge = installBridge()
      const wrapper = strict ? StrictMode : undefined
      const first = renderHook(() => editorThemes.usePluginEditorThemes(), { wrapper })
      const second = renderHook(() => editorThemes.usePluginEditorThemes(), { wrapper })
      const initialActive = first.result.current

      expect(bridge.listEditorThemes).toHaveBeenCalledTimes(1)
      expect(bridge.onChanged).toHaveBeenCalledTimes(1)

      const registration = theme('startup')
      await act(async () => {
        bridge.requests[0]!.resolve([registration])
        await bridge.requests[0]!.promise
      })

      const state = editorThemes.usePluginEditorThemeStore.getState()
      expect(state.pending.registrations).toEqual([registration])
      expect(first.result.current).toBe(initialActive)
      expect(second.result.current).toBe(initialActive)
    }
  )

  it('ignores unrelated changes and lets a content change supersede startup', async () => {
    const bridge = installBridge()
    editorThemes.ensurePluginEditorThemesLoaded()

    bridge.listeners[0]!({ contentPacksChanged: false })
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(1)
    bridge.listeners[0]!({ contentPacksChanged: true })
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(2)

    const changed = theme('changed')
    await act(async () => {
      bridge.requests[1]!.resolve([changed])
      await bridge.requests[1]!.promise
    })
    await act(async () => {
      bridge.requests[0]!.resolve([theme('stale-startup')])
      await bridge.requests[0]!.promise
    })

    editorThemes.ensurePluginEditorThemesLoaded()
    const state = editorThemes.usePluginEditorThemeStore.getState()
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(2)
    expect(state.pending.registrations).toEqual([changed])
    expect(state.loading).toBe(false)
  })

  it('treats a legacy change without payload as a content change and fails closed', async () => {
    const bridge = installBridge()
    editorThemes.ensurePluginEditorThemesLoaded()

    expect(() => bridge.listeners[0]!()).not.toThrow()
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(2)

    await act(async () => {
      bridge.requests[1]!.reject(new Error('legacy refresh failed'))
      await bridge.requests[1]!.promise.catch(() => undefined)
    })
    await act(async () => {
      bridge.requests[0]!.resolve([theme('stale-startup')])
      await bridge.requests[0]!.promise
    })

    const state = editorThemes.usePluginEditorThemeStore.getState()
    expect(state.pending.generation).toBeGreaterThan(0)
    expect(state.pending.registrations).toEqual([])
    expect(state.loading).toBe(false)
  })

  it('keeps the shared startup request alive after one consumer unmounts', async () => {
    const bridge = installBridge()
    const first = renderHook(() => editorThemes.usePluginEditorThemes())
    const initialActive = first.result.current
    first.unmount()
    const second = renderHook(() => editorThemes.usePluginEditorThemes())

    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(1)
    const retained = theme('retained')
    await act(async () => {
      bridge.requests[0]!.resolve([retained])
      await bridge.requests[0]!.promise
    })

    expect(editorThemes.usePluginEditorThemeStore.getState().pending.registrations).toEqual([
      retained
    ])
    expect(second.result.current).toBe(initialActive)
  })

  it('joins a startup request for 10 seconds and supersedes it after the window', async () => {
    vi.useFakeTimers()
    const bridge = installBridge()

    editorThemes.ensurePluginEditorThemesLoaded()
    vi.advanceTimersByTime(9_000)
    editorThemes.ensurePluginEditorThemesLoaded()
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2_000)
    editorThemes.ensurePluginEditorThemesLoaded()
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(2)

    const recovered = theme('recovered')
    await act(async () => {
      bridge.requests[1]!.resolve([recovered])
      await bridge.requests[1]!.promise
    })
    expect(editorThemes.usePluginEditorThemeStore.getState().pending.registrations).toEqual([
      recovered
    ])
  })

  it('fails closed with an older bridge and admits a later explicit refresh', async () => {
    const oldOnChanged = vi.fn(() => () => {})
    vi.stubGlobal('api', { plugins: { onChanged: oldOnChanged } })

    const consumer = renderHook(() => editorThemes.usePluginEditorThemes())
    const initialActive = consumer.result.current
    const failedClosed = editorThemes.usePluginEditorThemeStore.getState()
    expect(failedClosed.pending.generation).toBeGreaterThan(0)
    expect(failedClosed.pending.registrations).toEqual([])
    expect(failedClosed.loading).toBe(false)
    expect(failedClosed.active).toBe(initialActive)
    expect(oldOnChanged).toHaveBeenCalledTimes(1)

    const bridge = installBridge()
    const refresh = editorThemes.refreshPluginEditorThemes()
    const available = theme('available')
    await act(async () => {
      bridge.requests[0]!.resolve([available])
      await refresh
    })

    const recovered = editorThemes.usePluginEditorThemeStore.getState()
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(1)
    expect(recovered.pending.registrations).toEqual([available])
    expect(recovered.active).toBe(initialActive)
    expect(consumer.result.current).toBe(initialActive)
  })
})

describe('plugin editor theme store HMR cleanup', () => {
  it('releases the retained change bridge and lets the replacement subscribe once', () => {
    const bridge = installBridge()
    editorThemes.ensurePluginEditorThemesLoaded()
    expect(bridge.onChanged).toHaveBeenCalledOnce()
    expect(bridge.listeners).toHaveLength(1)

    editorThemes.disposePluginEditorThemeChangeSubscription()

    expect(bridge.unsubscribers[0]).toHaveBeenCalledOnce()
    expect(bridge.listeners).toHaveLength(0)

    editorThemes.ensurePluginEditorThemesLoaded()
    expect(bridge.onChanged).toHaveBeenCalledTimes(2)
    expect(bridge.listeners).toHaveLength(1)
  })

  it('refreshes the snapshot after bridge reacquisition and handles the next event', async () => {
    const bridge = installBridge()
    editorThemes.ensurePluginEditorThemesLoaded()
    const initial = theme('initial-snapshot')
    await act(async () => {
      bridge.requests[0]!.resolve([initial])
      await bridge.requests[0]!.promise
    })

    await vi.waitFor(() =>
      expect(editorThemes.usePluginEditorThemeStore.getState().loading).toBe(false)
    )
    editorThemes.disposePluginEditorThemeChangeSubscription()
    editorThemes.ensurePluginEditorThemesLoaded()

    expect(bridge.onChanged).toHaveBeenCalledTimes(2)
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(2)
    const reacquired = theme('reacquired-snapshot')
    await act(async () => {
      bridge.requests[1]!.resolve([reacquired])
      await bridge.requests[1]!.promise
    })
    expect(editorThemes.usePluginEditorThemeStore.getState().pending.registrations).toEqual([
      reacquired
    ])

    bridge.listeners[0]!({ contentPacksChanged: true })
    expect(bridge.listEditorThemes).toHaveBeenCalledTimes(3)
    const changed = theme('event-snapshot')
    await act(async () => {
      bridge.requests[2]!.resolve([changed])
      await bridge.requests[2]!.promise
    })
    expect(editorThemes.usePluginEditorThemeStore.getState().pending.registrations).toEqual([
      changed
    ])
  })
})
