import type { Repo } from '../../../shared/repo-types'
import type { PluginEditorThemeRegistration } from '../../../shared/plugins/plugin-editor-theme-artifact'

export type SettingsNavigationBuildOptions = {
  isMac: boolean
  isWindows: boolean
  isLocalWindowsHost: boolean
  isWindowsTerminalHost: boolean
  isWebClient: boolean
  managedBrowserCreationEnabled: boolean
  mobileEmulatorCreationEnabled: boolean
  isDev: boolean
  isLinearConnected: boolean
  pluginEditorThemes?: readonly PluginEditorThemeRegistration[]
  repos: readonly Repo[]
}
