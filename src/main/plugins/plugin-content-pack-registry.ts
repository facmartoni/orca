import type { PluginContentVerifier } from './plugin-content-integrity'
import {
  isInvalidDiscoveredPlugin,
  type DiscoveredPlugin,
  type ValidDiscoveredPlugin
} from './plugin-discovery'
import { PluginLanguagePackRegistry } from './plugin-language-pack-registry'
import { PluginVmRecipeRegistry } from './plugin-vm-recipe-registry'
import { PluginCommandRegistry } from './plugin-command-registry'
import { PluginEditorThemeRegistry } from './plugin-editor-theme-registry'
import { verifyInstructionalPluginContent } from './plugin-instructional-content-integrity'
import type { KeybindingOverrides } from '../../shared/keybindings'

export class PluginContentPackRegistry {
  readonly languagePacks: PluginLanguagePackRegistry
  readonly vmRecipes: PluginVmRecipeRegistry
  readonly commands: PluginCommandRegistry
  readonly editorThemes: PluginEditorThemeRegistry
  private readonly activationErrors = new Map<string, string>()

  constructor(
    contentVerifier: PluginContentVerifier,
    /** Revocation chokepoint: no caller-supplied predicate can readmit
     * killed plugin language packs, VM recipes, commands, or editor themes. */
    private readonly isKilled: (pluginKey: string) => boolean
  ) {
    this.languagePacks = new PluginLanguagePackRegistry(contentVerifier)
    this.vmRecipes = new PluginVmRecipeRegistry()
    this.commands = new PluginCommandRegistry()
    this.editorThemes = new PluginEditorThemeRegistry(contentVerifier)
  }

  async reconcile(
    discovered: readonly DiscoveredPlugin[],
    isApproved: (plugin: ValidDiscoveredPlugin) => boolean,
    keybindings: KeybindingOverrides = {}
  ): Promise<void> {
    const validDiscovered = discovered.filter(
      (plugin): plugin is ValidDiscoveredPlugin => !isInvalidDiscoveredPlugin(plugin)
    )
    const approvedKeys = new Set(
      validDiscovered
        .filter((plugin) => isApproved(plugin) && !this.isKilled(plugin.pluginKey))
        .map((plugin) => plugin.pluginKey)
    )
    const excluded = new Set<string>()
    this.activationErrors.clear()

    await Promise.all(
      discovered.map(async (plugin) => {
        if (
          isInvalidDiscoveredPlugin(plugin) ||
          !approvedKeys.has(plugin.pluginKey) ||
          plugin.manifest.contributes.vmRecipes.length > 0
        ) {
          return
        }
        try {
          await verifyInstructionalPluginContent(plugin)
        } catch (error) {
          excluded.add(plugin.pluginKey)
          this.activationErrors.set(
            plugin.pluginKey,
            error instanceof Error ? error.message : String(error)
          )
        }
      })
    )

    while (true) {
      // `approvedKeys` is a snapshot from before the awaited verification
      // above, so a kill list arriving during that wait would otherwise still
      // publish. Re-read revocation here, the last gate before publication.
      const approveAtomically = (plugin: ValidDiscoveredPlugin): boolean =>
        approvedKeys.has(plugin.pluginKey) &&
        !excluded.has(plugin.pluginKey) &&
        !this.isKilled(plugin.pluginKey)
      const languagePacks = this.languagePacks.reconcile(discovered, approveAtomically)
      const vmRecipes = this.vmRecipes.reconcile(discovered, approveAtomically)
      this.commands.reconcile(discovered, approveAtomically, keybindings)
      const editorThemes = this.editorThemes.reconcile(validDiscovered, approveAtomically)
      await Promise.all([languagePacks, vmRecipes, editorThemes])

      let foundNewError = false
      for (const pluginKey of approvedKeys) {
        const error = this.registryError(pluginKey)
        if (error && !excluded.has(pluginKey)) {
          excluded.add(pluginKey)
          this.activationErrors.set(pluginKey, error)
          foundNewError = true
        }
      }
      if (!foundNewError) {
        break
      }
    }
  }

  error(pluginKey: string): string | null {
    return this.activationErrors.get(pluginKey) ?? this.registryError(pluginKey)
  }

  private registryError(pluginKey: string): string | null {
    return (
      this.languagePacks.error(pluginKey) ??
      this.vmRecipes.error(pluginKey) ??
      this.commands.error(pluginKey) ??
      this.editorThemes.error(pluginKey)
    )
  }
}
