// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName,
  type PluginEditorThemeRegistration
} from '../../../shared/plugins/plugin-editor-theme-artifact'
import type * as PluginEditorThemeModule from './plugin-editor-themes'

const BASE_BY_MODE = {
  dark: 'vs-dark',
  light: 'vs',
  'hc-dark': 'hc-black',
  'hc-light': 'hc-light'
} as const satisfies Record<
  PluginEditorThemeRegistration['mode'],
  PluginEditorThemeRegistration['data']['base']
>

let editorThemes: typeof PluginEditorThemeModule

function theme(
  localId: string,
  mode: PluginEditorThemeRegistration['mode'] = 'dark',
  label = localId
): PluginEditorThemeRegistration {
  const pluginKey = 'tests.editor-themes'
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
      colors: {}
    }
  }
}

beforeEach(async () => {
  vi.resetModules()
  // Dynamic import is intentional: each test needs fresh module-owned store state.
  editorThemes = await import('./plugin-editor-themes')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('plugin editor theme store', () => {
  it('keeps the newest pending response when an older request finishes last', async () => {
    const first = Promise.withResolvers<PluginEditorThemeRegistration[]>()
    const second = Promise.withResolvers<PluginEditorThemeRegistration[]>()
    const listEditorThemes = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('api', { plugins: { listEditorThemes } })

    const firstLoad = editorThemes.refreshPluginEditorThemes()
    const secondLoad = editorThemes.refreshPluginEditorThemes()
    const newest = theme('newest')
    second.resolve([newest])
    await secondLoad
    const newestGeneration = editorThemes.usePluginEditorThemeStore.getState().pending.generation
    first.resolve([theme('older')])
    await firstLoad

    const state = editorThemes.usePluginEditorThemeStore.getState()
    expect(state.pending.generation).toBe(newestGeneration)
    expect(state.pending.registrations).toEqual([newest])
    expect(state.loading).toBe(false)
  })

  it('publishes a completed response as pending without activating it', async () => {
    const registration = theme('pending-only')
    vi.stubGlobal('api', {
      plugins: { listEditorThemes: vi.fn().mockResolvedValue([registration]) }
    })
    const activeBefore = editorThemes.usePluginEditorThemeStore.getState().active

    await editorThemes.refreshPluginEditorThemes()

    const state = editorThemes.usePluginEditorThemeStore.getState()
    expect(state.pending.generation).toBeGreaterThan(0)
    expect(state.pending.registrations).toEqual([registration])
    expect(state.active).toBe(activeBefore)
    expect(state.active.byId.has(registration.id)).toBe(false)
  })

  it('validates theme data once and publishes the normalized registration', async () => {
    const expectedRegistration = theme('single-validation')
    const expectedData = expectedRegistration.data
    let dataReads = 0
    const registration: PluginEditorThemeRegistration = {
      ...expectedRegistration,
      get data() {
        dataReads += 1
        if (dataReads > 1) {
          throw new Error('theme data read more than once')
        }
        return expectedData
      }
    }
    vi.stubGlobal('api', {
      plugins: { listEditorThemes: vi.fn().mockResolvedValue([registration]) }
    })

    await editorThemes.refreshPluginEditorThemes()

    const validated = editorThemes.usePluginEditorThemeStore.getState().pending.registrations[0]
    expect(validated).toEqual(expectedRegistration)
    expect(validated!.data).not.toBe(expectedData)
    expect(dataReads).toBe(1)
  })

  it('fences a stale active-catalog commit and admits the current generation', async () => {
    const older = theme('older-definition')
    const current = theme('current-definition')
    const listEditorThemes = vi
      .fn()
      .mockResolvedValueOnce([older])
      .mockResolvedValueOnce([current])
    vi.stubGlobal('api', { plugins: { listEditorThemes } })

    await editorThemes.refreshPluginEditorThemes()
    const olderGeneration = editorThemes.usePluginEditorThemeStore.getState().pending.generation
    const olderCatalog = editorThemes.createPluginEditorThemeCatalog([older], olderGeneration)
    await editorThemes.refreshPluginEditorThemes()
    const pending = editorThemes.usePluginEditorThemeStore.getState().pending
    const activeBefore = editorThemes.usePluginEditorThemeStore.getState().active

    editorThemes.commitActivePluginEditorThemes(olderGeneration, olderCatalog)
    expect(editorThemes.usePluginEditorThemeStore.getState().active).toBe(activeBefore)

    const currentCatalog = editorThemes.createPluginEditorThemeCatalog(
      pending.registrations,
      pending.generation
    )
    editorThemes.commitActivePluginEditorThemes(pending.generation, currentCatalog)
    expect(editorThemes.usePluginEditorThemeStore.getState().active).toBe(currentCatalog)
  })

  it('rejects an active catalog whose revision disagrees with the pending generation', async () => {
    const registration = theme('mismatched-revision')
    vi.stubGlobal('api', {
      plugins: { listEditorThemes: vi.fn().mockResolvedValue([registration]) }
    })
    await editorThemes.refreshPluginEditorThemes()
    const pending = editorThemes.usePluginEditorThemeStore.getState().pending
    const activeBefore = editorThemes.usePluginEditorThemeStore.getState().active
    const mismatchedCatalog = editorThemes.createPluginEditorThemeCatalog(
      pending.registrations,
      pending.generation + 1
    )

    editorThemes.commitActivePluginEditorThemes(pending.generation, mismatchedCatalog)

    expect(editorThemes.usePluginEditorThemeStore.getState().active).toBe(activeBefore)
  })

  it.each([
    ['a non-array response', { registrations: [] }],
    [
      'a registration that forges a built-in Monaco name',
      [{ ...theme('forged-name'), monacoName: 'vs-dark' }]
    ]
  ])('fails closed for %s without replacing the active React catalog', async (_name, payload) => {
    const installed = theme('already-active')
    const listEditorThemes = vi
      .fn()
      .mockResolvedValueOnce([installed])
      .mockResolvedValueOnce(payload)
    vi.stubGlobal('api', { plugins: { listEditorThemes } })

    await editorThemes.refreshPluginEditorThemes()
    const installedPending = editorThemes.usePluginEditorThemeStore.getState().pending
    const installedCatalog = editorThemes.createPluginEditorThemeCatalog(
      installedPending.registrations,
      installedPending.generation
    )
    editorThemes.commitActivePluginEditorThemes(installedPending.generation, installedCatalog)

    await expect(editorThemes.refreshPluginEditorThemes()).resolves.toBeUndefined()
    const consumer = renderHook(() => editorThemes.usePluginEditorThemes())
    const state = editorThemes.usePluginEditorThemeStore.getState()

    expect(state.pending.registrations).toEqual([])
    expect(state.active).toBe(installedCatalog)
    expect(consumer.result.current).toBe(installedCatalog)
  })

  it('groups a catalog deterministically while preserving public and Monaco identities', () => {
    const darkA = theme('a-dark', 'dark', 'Same label')
    const darkZ = theme('z-dark', 'dark', 'Same label')
    const light = theme('light', 'light', 'Alpha')
    const hcDark = theme('hc-dark', 'hc-dark', 'Bravo')
    const hcLight = theme('hc-light', 'hc-light', 'Charlie')
    const registrations = [darkZ, hcLight, light, darkA, hcDark]

    const catalog = editorThemes.createPluginEditorThemeCatalog(registrations, 47)
    const reversed = editorThemes.createPluginEditorThemeCatalog([...registrations].reverse(), 47)
    expect([...catalog.byId.keys()]).toEqual([...reversed.byId.keys()])
    expect(catalog.dark.map((registration) => registration.id)).toEqual([darkA.id, darkZ.id])
    expect(catalog.light.map((registration) => registration.id)).toEqual([light.id])
    expect(catalog.hcDark.map((registration) => registration.id)).toEqual([hcDark.id])
    expect(catalog.hcLight.map((registration) => registration.id)).toEqual([hcLight.id])
    expect(catalog.byId.get(darkA.id)).toBe(darkA)
    expect(catalog.byId.get(darkA.id)).toMatchObject({
      id: darkA.id,
      monacoName: pluginEditorThemeMonacoName(darkA.id)
    })
    expect(darkA.monacoName).not.toMatch(/[./]/)
    expect(catalog.revision).toBe(47)
  })
})
