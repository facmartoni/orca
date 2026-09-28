import {
  parsePluginEditorThemeArtifact,
  pluginEditorThemeId,
  pluginEditorThemeMonacoName,
  type PluginEditorThemeRegistration
} from '../../shared/plugins/plugin-editor-theme-artifact'
import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import {
  PLUGIN_EDITOR_THEME_MAX_BYTES,
  readContainedPluginArtifactText
} from './plugin-artifact-validation'
import type { PluginContentVerifier } from './plugin-content-integrity'
import type { ValidDiscoveredPlugin } from './plugin-discovery'

const EDITOR_THEME_LOAD_CONCURRENCY = 4

type EditorThemeLoadResult =
  | {
      plugin: ValidDiscoveredPlugin
      registrations: PluginEditorThemeRegistration[]
    }
  | {
      plugin: ValidDiscoveredPlugin
      error: string
    }

type EditorThemeSnapshot = {
  active: PluginEditorThemeRegistration[]
  errors: Map<string, string>
}

export class PluginEditorThemeRegistry {
  private snapshot: EditorThemeSnapshot = {
    active: [],
    errors: new Map<string, string>()
  }

  constructor(private readonly contentVerifier: PluginContentVerifier) {}

  list(): readonly PluginEditorThemeRegistration[] {
    return this.snapshot.active
  }

  error(pluginKey: string): string | null {
    return this.snapshot.errors.get(pluginKey) ?? null
  }

  async reconcile(
    discovered: readonly ValidDiscoveredPlugin[],
    isApproved: (plugin: ValidDiscoveredPlugin) => boolean
  ): Promise<void> {
    const candidates = discovered.filter(
      (plugin) => isApproved(plugin) && plugin.manifest.contributes.editorThemes.length > 0
    )
    const loaded = await mapWithConcurrency(
      candidates,
      EDITOR_THEME_LOAD_CONCURRENCY,
      async (plugin): Promise<EditorThemeLoadResult> => {
        try {
          await this.contentVerifier.verify(plugin)
          const registrations: PluginEditorThemeRegistration[] = []
          for (const contribution of plugin.manifest.contributes.editorThemes) {
            const raw = await readContainedPluginArtifactText(
              plugin.rootDir,
              contribution.path,
              PLUGIN_EDITOR_THEME_MAX_BYTES
            )
            const parsed = parsePluginEditorThemeArtifact(raw, contribution.mode)
            if (!parsed.ok) {
              throw new Error(
                `editor theme "${contribution.id}" ${contribution.path}: ${parsed.error}`
              )
            }
            const id = pluginEditorThemeId(plugin.pluginKey, contribution.id)
            registrations.push({
              id,
              monacoName: pluginEditorThemeMonacoName(id),
              pluginKey: plugin.pluginKey,
              localId: contribution.id,
              label: contribution.label,
              mode: contribution.mode,
              data: parsed.data
            })
          }
          return { plugin, registrations }
        } catch (error) {
          return {
            plugin,
            error: `editor theme load failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          }
        }
      }
    )

    const approvedResults = loaded.filter((result) => isApproved(result.plugin))
    const errors = new Map<string, string>()
    const successful = approvedResults.filter(
      (
        result
      ): result is Extract<EditorThemeLoadResult, { registrations: PluginEditorThemeRegistration[] }> => {
        if ('error' in result) {
          errors.set(result.plugin.pluginKey, result.error)
          return false
        }
        return true
      }
    )

    const ownersById = new Map<string, typeof successful>()
    for (const result of successful) {
      for (const registration of result.registrations) {
        const owners = ownersById.get(registration.id)
        if (owners) {
          owners.push(result)
        } else {
          ownersById.set(registration.id, [result])
        }
      }
    }

    const conflictedPluginKeys = new Set<string>()
    for (const [id, owners] of ownersById) {
      if (owners.length < 2) {
        continue
      }
      for (const owner of owners) {
        conflictedPluginKeys.add(owner.plugin.pluginKey)
        errors.set(
          owner.plugin.pluginKey,
          `editor theme id "${id}" is contributed by multiple discovered owners`
        )
      }
    }

    const active = successful
      .filter(
        (result) =>
          !errors.has(result.plugin.pluginKey) &&
          !conflictedPluginKeys.has(result.plugin.pluginKey)
      )
      .flatMap((result) => result.registrations)
      .sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id))

    this.snapshot = { active, errors }
  }
}
