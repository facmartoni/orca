// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'

const monacoSetupLoaded = vi.hoisted(() => vi.fn())

vi.mock('@/lib/monaco-setup', () => {
  monacoSetupLoaded()
  return { monaco: {} }
})

vi.mock('./use-settings-store-model', () => ({
  useSettingsStoreModel: () => ({ settings: {} })
}))

vi.mock('./use-settings-interaction-controller', () => ({
  useSettingsInteractionController: () => ({})
}))

vi.mock('./use-settings-page-effects', () => ({
  useSettingsPageEffects: () => undefined
}))

vi.mock('./use-settings-navigation-model', () => ({
  useSettingsNavigationModel: () => ({})
}))

vi.mock('./use-settings-terminal-model', () => ({
  useSettingsTerminalModel: () => ({})
}))

vi.mock('./use-settings-repo-scroll-effects', () => ({
  useSettingsRepoScrollEffects: () => undefined
}))

vi.mock('./settings-view-model', () => ({
  buildSettingsViewModel: () => ({}),
  useSettingsNavigationActions: () => ({})
}))

vi.mock('./settings-page-renderer', () => ({
  renderSettingsLoading: () => 'Loading settings',
  renderSettingsPage: () => 'Accounts settings'
}))

import Settings from './Settings'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
  vi.restoreAllMocks()
})

it('mounts a non-editor Settings page without initializing Monaco', async () => {
  monacoSetupLoaded.mockClear()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  await act(async () => {
    root?.render(<Settings />)
    const flush = Promise.withResolvers<void>()
    setTimeout(flush.resolve, 0)
    await flush.promise
  })

  expect(container?.textContent).toBe('Accounts settings')
  expect(monacoSetupLoaded).not.toHaveBeenCalled()
})
