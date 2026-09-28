import { useEffect } from 'react'
import { create } from 'zustand'
import {
  parsePluginEditorThemeRegistration,
  type PluginEditorThemeRegistration
} from '../../../shared/plugins/plugin-editor-theme-artifact'

export type PluginEditorThemeCatalog = {
  byId: ReadonlyMap<string, PluginEditorThemeRegistration>
  dark: readonly PluginEditorThemeRegistration[]
  light: readonly PluginEditorThemeRegistration[]
  hcDark: readonly PluginEditorThemeRegistration[]
  hcLight: readonly PluginEditorThemeRegistration[]
  revision: number
}

export type PendingPluginEditorThemes = {
  generation: number
  registrations: readonly PluginEditorThemeRegistration[]
}

type PluginEditorThemeState = {
  pending: PendingPluginEditorThemes
  active: PluginEditorThemeCatalog
  loading: boolean
  error: string | null
  commitActivePluginEditorThemes: (
    generation: number,
    catalog: PluginEditorThemeCatalog
  ) => void
}

const STARTUP_REQUEST_JOIN_WINDOW_MS = 10_000

let requestGeneration = 0
let latestRequestStartedAt: number | null = null
let changeSubscriptionStarted = false

const initialCatalog: PluginEditorThemeCatalog = {
  byId: new Map(),
  dark: [],
  light: [],
  hcDark: [],
  hcLight: [],
  revision: 0
}

export const usePluginEditorThemeStore = create<PluginEditorThemeState>()((set) => ({
  pending: { generation: 0, registrations: [] },
  active: initialCatalog,
  loading: false,
  error: null,
  commitActivePluginEditorThemes: (generation, catalog) =>
    set((state) =>
      generation === state.pending.generation && catalog.revision === generation
        ? { active: catalog }
        : state
    )
}))

export function createPluginEditorThemeCatalog(
  registrations: readonly PluginEditorThemeRegistration[],
  revision: number
): PluginEditorThemeCatalog {
  const ordered = [...registrations]
  ordered.sort(
    (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
  )

  const byId = new Map<string, PluginEditorThemeRegistration>()
  const dark: PluginEditorThemeRegistration[] = []
  const light: PluginEditorThemeRegistration[] = []
  const hcDark: PluginEditorThemeRegistration[] = []
  const hcLight: PluginEditorThemeRegistration[] = []

  for (const registration of ordered) {
    byId.set(registration.id, registration)
    switch (registration.mode) {
      case 'dark':
        dark.push(registration)
        break
      case 'light':
        light.push(registration)
        break
      case 'hc-dark':
        hcDark.push(registration)
        break
      case 'hc-light':
        hcLight.push(registration)
        break
    }
  }

  return { byId, dark, light, hcDark, hcLight, revision }
}

export async function refreshPluginEditorThemes(): Promise<void> {
  const generation = ++requestGeneration
  latestRequestStartedAt = Date.now()
  usePluginEditorThemeStore.setState({ loading: true, error: null })

  const pluginsApi = window.api?.plugins
  if (!pluginsApi?.listEditorThemes) {
    if (generation === requestGeneration) {
      latestRequestStartedAt = null
      usePluginEditorThemeStore.setState({
        pending: { generation, registrations: [] },
        loading: false,
        error: null
      })
    }
    return
  }

  try {
    const response: unknown = await pluginsApi.listEditorThemes()
    const registrations: PluginEditorThemeRegistration[] = []
    if (Array.isArray(response)) {
      for (const candidate of response) {
        const registration = parsePluginEditorThemeRegistration(candidate)
        if (registration !== null) {
          registrations.push(registration)
        }
      }
    }
    if (generation === requestGeneration) {
      usePluginEditorThemeStore.setState({
        pending: { generation, registrations },
        loading: false,
        error: null
      })
    }
  } catch (error) {
    if (generation === requestGeneration) {
      usePluginEditorThemeStore.setState({
        pending: { generation, registrations: [] },
        loading: false,
        error:
          error instanceof Error ? error.message : 'Failed to load plugin editor themes'
      })
    }
  } finally {
    if (generation === requestGeneration) {
      latestRequestStartedAt = null
    }
  }
}

export function ensurePluginEditorThemesLoaded(): void {
  const state = usePluginEditorThemeStore.getState()
  const joinsCurrentRequest =
    latestRequestStartedAt !== null &&
    Date.now() - latestRequestStartedAt < STARTUP_REQUEST_JOIN_WINDOW_MS
  if (state.pending.generation === 0 && !joinsCurrentRequest) {
    void refreshPluginEditorThemes()
  }

  if (!changeSubscriptionStarted && window.api?.plugins?.onChanged) {
    window.api.plugins.onChanged((event) => {
      if (event?.contentPacksChanged ?? true) {
        void refreshPluginEditorThemes()
      }
    })
    changeSubscriptionStarted = true
  }
}

export function commitActivePluginEditorThemes(
  generation: number,
  catalog: PluginEditorThemeCatalog
): void {
  usePluginEditorThemeStore.getState().commitActivePluginEditorThemes(generation, catalog)
}

export function usePluginEditorThemes(): PluginEditorThemeCatalog {
  const active = usePluginEditorThemeStore((state) => state.active)
  useEffect(() => {
    ensurePluginEditorThemesLoaded()
  }, [])
  return active
}
