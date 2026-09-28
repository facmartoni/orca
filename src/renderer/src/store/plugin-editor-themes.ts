import { useEffect } from 'react'
import { create } from 'zustand'
import { parsePluginEditorThemeRegistration } from '../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../shared/plugins/plugin-editor-theme-artifact'

export type PluginEditorThemeCatalog = {
  byId: ReadonlyMap<string, PluginEditorThemeRegistration>
  all: readonly PluginEditorThemeRegistration[]
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

export type PluginEditorThemeRuntimeStatus = 'idle' | 'loading' | 'ready' | 'failed'

type PluginEditorThemeState = {
  pending: PendingPluginEditorThemes
  active: PluginEditorThemeCatalog
  loading: boolean
  error: string | null
  runtimeStatus: PluginEditorThemeRuntimeStatus
  commitActivePluginEditorThemes: (
    generation: number,
    catalog: PluginEditorThemeCatalog
  ) => void
}

const STARTUP_REQUEST_JOIN_WINDOW_MS = 10_000

let requestGeneration = 0
let latestRequestStartedAt: number | null = null
let disposePluginEditorThemeChangeBridge: (() => void) | undefined

const EMPTY_PLUGIN_EDITOR_THEME_REGISTRATIONS: readonly PluginEditorThemeRegistration[] = []

export const EMPTY_PLUGIN_EDITOR_THEME_CATALOG: PluginEditorThemeCatalog = {
  byId: new Map(),
  all: EMPTY_PLUGIN_EDITOR_THEME_REGISTRATIONS,
  dark: EMPTY_PLUGIN_EDITOR_THEME_REGISTRATIONS,
  light: EMPTY_PLUGIN_EDITOR_THEME_REGISTRATIONS,
  hcDark: EMPTY_PLUGIN_EDITOR_THEME_REGISTRATIONS,
  hcLight: EMPTY_PLUGIN_EDITOR_THEME_REGISTRATIONS,
  revision: 0
}

export const usePluginEditorThemeStore = create<PluginEditorThemeState>()((set) => ({
  pending: { generation: 0, registrations: [] },
  active: EMPTY_PLUGIN_EDITOR_THEME_CATALOG,
  loading: false,
  error: null,
  runtimeStatus: 'idle',
  commitActivePluginEditorThemes: (generation, catalog) =>
    set((state) =>
      !state.loading &&
      generation === state.pending.generation &&
      catalog.revision === generation
        ? { active: catalog }
        : state
    )
}))

export function createPluginEditorThemeCatalog(
  registrations: readonly PluginEditorThemeRegistration[],
  revision: number
): PluginEditorThemeCatalog {
  const all = [...registrations]
  all.sort(
    (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
  )

  const byId = new Map<string, PluginEditorThemeRegistration>()
  const dark: PluginEditorThemeRegistration[] = []
  const light: PluginEditorThemeRegistration[] = []
  const hcDark: PluginEditorThemeRegistration[] = []
  const hcLight: PluginEditorThemeRegistration[] = []

  for (const registration of all) {
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

  return { byId, all, dark, light, hcDark, hcLight, revision }
}

export function markPluginEditorThemeRuntimeLoading(): void {
  usePluginEditorThemeStore.setState({ runtimeStatus: 'loading' })
}

export function markPluginEditorThemeRuntimeReady(): void {
  usePluginEditorThemeStore.setState({ runtimeStatus: 'ready' })
}

export function markPluginEditorThemeRuntimeFailed(): void {
  usePluginEditorThemeStore.setState({
    runtimeStatus: 'failed',
    active: EMPTY_PLUGIN_EDITOR_THEME_CATALOG
  })
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

  const onChanged = window.api?.plugins?.onChanged
  if (!disposePluginEditorThemeChangeBridge && onChanged) {
    disposePluginEditorThemeChangeBridge = onChanged((event) => {
      if (event?.contentPacksChanged ?? true) {
        void refreshPluginEditorThemes()
      }
    })
    // Reacquisition may follow an HMR gap where plugins:changed was missed.
    // Refresh the authoritative snapshot unless a request already covers that gap.
    if (state.pending.generation > 0 && !joinsCurrentRequest) {
      void refreshPluginEditorThemes()
    }
  }
}

export function disposePluginEditorThemeChangeSubscription(): void {
  disposePluginEditorThemeChangeBridge?.()
  disposePluginEditorThemeChangeBridge = undefined
}

if (import.meta.hot) {
  import.meta.hot.dispose(disposePluginEditorThemeChangeSubscription)
}

export function commitActivePluginEditorThemes(
  generation: number,
  catalog: PluginEditorThemeCatalog
): void {
  usePluginEditorThemeStore.getState().commitActivePluginEditorThemes(generation, catalog)
}

export function usePluginEditorThemeOptions(): readonly PluginEditorThemeRegistration[] {
  return usePluginEditorThemeStore((state) => state.active.all)
}

export function usePluginEditorThemes(): PluginEditorThemeCatalog {
  const active = usePluginEditorThemeStore((state) => state.active)
  useEffect(() => {
    ensurePluginEditorThemesLoaded()
  }, [])
  return active
}
