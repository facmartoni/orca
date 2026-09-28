import {
  commitActivePluginEditorThemes,
  ensurePluginEditorThemesLoaded,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'
import type {
  PendingPluginEditorThemes,
  PluginEditorThemeCatalog
} from '@/store/plugin-editor-themes'
import type { MonacoThemeRegistry } from './monaco-themes'

export function initializePluginEditorThemeRuntime(
  monacoInstance: MonacoThemeRegistry
): () => void {
  let disposed = false
  let processing = false
  let queued: PendingPluginEditorThemes | undefined
  let processed: PendingPluginEditorThemes | undefined

  const isSuperseded = (pending: PendingPluginEditorThemes): boolean =>
    disposed || (queued !== undefined && queued !== pending)

  const applyPending = (pending: PendingPluginEditorThemes): void => {
    const registrationsByOwner = new Map<
      string,
      PendingPluginEditorThemes['registrations'][number][]
    >()
    for (const registration of pending.registrations) {
      const registrations = registrationsByOwner.get(registration.pluginKey)
      if (registrations) {
        registrations.push(registration)
      } else {
        registrationsByOwner.set(registration.pluginKey, [registration])
      }
    }

    const successfulOwners = new Set<string>()
    for (const [pluginKey, registrations] of registrationsByOwner) {
      let ownerSucceeded = true
      try {
        for (const registration of registrations) {
          monacoInstance.editor.defineTheme(registration.monacoName, registration.data)
          if (isSuperseded(pending)) {
            return
          }
        }
      } catch (error) {
        ownerSucceeded = false
        console.error(`[Plugin Editor Themes] Failed to define themes for ${pluginKey}`, error)
      }

      if (ownerSucceeded) {
        successfulOwners.add(pluginKey)
      }
      if (isSuperseded(pending)) {
        return
      }
    }

    if (isSuperseded(pending)) {
      return
    }
    const all: PendingPluginEditorThemes['registrations'][number][] = []
    const byId = new Map<string, PendingPluginEditorThemes['registrations'][number]>()
    const dark: PendingPluginEditorThemes['registrations'][number][] = []
    const light: PendingPluginEditorThemes['registrations'][number][] = []
    const hcDark: PendingPluginEditorThemes['registrations'][number][] = []
    const hcLight: PendingPluginEditorThemes['registrations'][number][] = []
    for (const registration of pending.registrations) {
      if (!successfulOwners.has(registration.pluginKey)) {
        continue
      }
      all.push(registration)
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
    const catalog: PluginEditorThemeCatalog = {
      byId,
      all,
      dark,
      light,
      hcDark,
      hcLight,
      revision: pending.generation
    }
    commitActivePluginEditorThemes(pending.generation, catalog)
  }

  const drain = (): void => {
    if (processing || disposed) {
      return
    }
    processing = true
    try {
      while (!disposed && queued) {
        const pending = queued
        queued = undefined
        if (pending === processed) {
          continue
        }
        applyPending(pending)
        processed = pending
      }
    } finally {
      processing = false
    }
  }

  const queuePending = (pending: PendingPluginEditorThemes): void => {
    if (disposed || pending === processed || pending === queued) {
      return
    }
    queued = pending
    drain()
  }

  const unsubscribe = usePluginEditorThemeStore.subscribe((next, previous) => {
    if (next.pending !== previous.pending) {
      queuePending(next.pending)
    }
  })
  queuePending(usePluginEditorThemeStore.getState().pending)
  ensurePluginEditorThemesLoaded()

  return () => {
    if (disposed) {
      return
    }
    disposed = true
    queued = undefined
    unsubscribe()
  }
}
