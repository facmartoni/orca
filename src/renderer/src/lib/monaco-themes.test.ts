import { describe, expect, it, vi } from 'vitest'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeCatalog } from '@/store/plugin-editor-themes'
import {
  ALL_EDITOR_THEMES,
  DARK_EDITOR_THEMES,
  DEFAULT_EDITOR_THEME_DARK,
  DEFAULT_EDITOR_THEME_LIGHT,
  LIGHT_EDITOR_THEMES,
  isKnownEditorTheme,
  registerMonacoThemes,
  resolveEditorTheme,
  type MonacoThemeRegistry
} from './monaco-themes'

const BASE_BY_MODE = {
  dark: 'vs-dark',
  light: 'vs',
  'hc-dark': 'hc-black',
  'hc-light': 'hc-light'
} as const satisfies Record<
  PluginEditorThemeRegistration['mode'],
  PluginEditorThemeRegistration['data']['base']
>

function pluginTheme(
  localId: string,
  mode: PluginEditorThemeRegistration['mode'] = 'dark',
  pluginKey = 'tests.resolver'
): PluginEditorThemeRegistration {
  const id = pluginEditorThemeId(pluginKey, localId)
  return {
    id,
    monacoName: pluginEditorThemeMonacoName(id),
    pluginKey,
    localId,
    label: localId,
    mode,
    data: {
      base: BASE_BY_MODE[mode],
      inherit: true,
      rules: [],
      colors: {}
    }
  }
}

function pluginCatalog(
  registrations: readonly PluginEditorThemeRegistration[],
  poisonedBuiltInEntries: readonly (readonly [string, PluginEditorThemeRegistration])[] = []
): PluginEditorThemeCatalog {
  return {
    byId: new Map([
      ...registrations.map((registration) => [registration.id, registration] as const),
      ...poisonedBuiltInEntries
    ]),
    all: registrations,
    dark: registrations.filter((registration) => registration.mode === 'dark'),
    light: registrations.filter((registration) => registration.mode === 'light'),
    hcDark: registrations.filter((registration) => registration.mode === 'hc-dark'),
    hcLight: registrations.filter((registration) => registration.mode === 'hc-light'),
    revision: 1
  }
}

describe('monaco-themes', () => {
  it('contains expected default themes and popular presets', () => {
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'vs-dark')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'dracula')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'one-dark-pro')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'github-dark')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'catppuccin-mocha')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'tokyo-night')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'nord')).toBe(true)
    expect(DARK_EDITOR_THEMES.some((t) => t.id === 'solarized-dark')).toBe(true)

    expect(LIGHT_EDITOR_THEMES.some((t) => t.id === 'vs')).toBe(true)
    expect(LIGHT_EDITOR_THEMES.some((t) => t.id === 'github-light')).toBe(true)
    expect(LIGHT_EDITOR_THEMES.some((t) => t.id === 'one-light')).toBe(true)
    expect(LIGHT_EDITOR_THEMES.some((t) => t.id === 'catppuccin-latte')).toBe(true)
    expect(LIGHT_EDITOR_THEMES.some((t) => t.id === 'solarized-light')).toBe(true)

    expect(ALL_EDITOR_THEMES.length).toBe(DARK_EDITOR_THEMES.length + LIGHT_EDITOR_THEMES.length)
  })

  it('validates known themes by mode', () => {
    expect(isKnownEditorTheme('dracula', 'dark')).toBe(true)
    expect(isKnownEditorTheme('dracula', 'light')).toBe(false)
    expect(isKnownEditorTheme('github-light', 'light')).toBe(true)
    expect(isKnownEditorTheme('github-light', 'dark')).toBe(false)
    expect(isKnownEditorTheme('non-existent')).toBe(false)
  })

  it('registers custom themes into monaco', () => {
    const defineTheme = vi.fn()
    const mockMonaco: MonacoThemeRegistry = {
      editor: { defineTheme }
    }

    registerMonacoThemes(mockMonaco)

    // Should define themes that have custom data
    expect(defineTheme).toHaveBeenCalledWith('dracula', expect.any(Object))
    expect(defineTheme).toHaveBeenCalledWith('one-dark-pro', expect.any(Object))
    expect(defineTheme).toHaveBeenCalledWith('github-dark', expect.any(Object))
    expect(defineTheme).toHaveBeenCalledWith('github-light', expect.any(Object))
    // vs and vs-dark are built into Monaco, so they don't have custom data
    expect(defineTheme).not.toHaveBeenCalledWith('vs', expect.any(Object))
    expect(defineTheme).not.toHaveBeenCalledWith('vs-dark', expect.any(Object))
  })

  it('resolves editor theme according to dark/light document mode and settings', () => {
    // Default dark
    expect(resolveEditorTheme({ theme: 'dark' })).toBe(DEFAULT_EDITOR_THEME_DARK)
    // Custom dark
    expect(resolveEditorTheme({ theme: 'dark', editorThemeDark: 'dracula' })).toBe('dracula')
    // Invalid dark falls back to default
    expect(resolveEditorTheme({ theme: 'dark', editorThemeDark: 'unknown-theme' })).toBe(
      DEFAULT_EDITOR_THEME_DARK
    )

    // Default light
    expect(resolveEditorTheme({ theme: 'light' })).toBe(DEFAULT_EDITOR_THEME_LIGHT)
    // Custom light
    expect(resolveEditorTheme({ theme: 'light', editorThemeLight: 'github-light' })).toBe(
      'github-light'
    )
    // Invalid light falls back to default
    expect(resolveEditorTheme({ theme: 'light', editorThemeLight: 'unknown-theme' })).toBe(
      DEFAULT_EDITOR_THEME_LIGHT
    )

    // System mode with matchMedia
    expect(
      resolveEditorTheme(
        { theme: 'system', editorThemeDark: 'dracula', editorThemeLight: 'one-light' },
        () => ({ matches: true })
      )
    ).toBe('dracula')

    expect(
      resolveEditorTheme(
        { theme: 'system', editorThemeDark: 'dracula', editorThemeLight: 'one-light' },
        () => ({ matches: false })
      )
    ).toBe('one-light')

    // Explicit isDark boolean parameter
    expect(
      resolveEditorTheme({ editorThemeDark: 'dracula', editorThemeLight: 'one-light' }, true)
    ).toBe('dracula')
    expect(
      resolveEditorTheme({ editorThemeDark: 'dracula', editorThemeLight: 'one-light' }, false)
    ).toBe('one-light')
  })
})

describe('plugin editor theme resolution', () => {
  it('resolves an active public ID to its Monaco-safe name', () => {
    const registration = pluginTheme('robbydev')
    const settings = { editorThemeDark: registration.id }

    expect(resolveEditorTheme(settings, true, pluginCatalog([registration]))).toBe(
      registration.monacoName
    )
  })

  it('falls back for an inactive public ID without mutating persisted settings', () => {
    const registration = pluginTheme('disabled')
    const settings = Object.freeze({ editorThemeDark: registration.id })

    expect(resolveEditorTheme(settings, true, pluginCatalog([]))).toBe(
      DEFAULT_EDITOR_THEME_DARK
    )
    expect(settings.editorThemeDark).toBe(registration.id)
  })

  it('rejects plugin themes from the opposite document family', () => {
    const light = pluginTheme('light-only', 'light')
    const dark = pluginTheme('dark-only', 'dark')
    const catalog = pluginCatalog([light, dark])

    expect(resolveEditorTheme({ editorThemeDark: light.id }, true, catalog)).toBe(
      DEFAULT_EDITOR_THEME_DARK
    )
    expect(resolveEditorTheme({ editorThemeLight: dark.id }, false, catalog)).toBe(
      DEFAULT_EDITOR_THEME_LIGHT
    )
  })

  it('treats high-contrast modes only as members of their manual dark or light family', () => {
    const hcDark = pluginTheme('hc-dark', 'hc-dark')
    const hcLight = pluginTheme('hc-light', 'hc-light')
    const catalog = pluginCatalog([hcDark, hcLight])

    expect(resolveEditorTheme({ editorThemeDark: hcDark.id }, true, catalog)).toBe(
      hcDark.monacoName
    )
    expect(resolveEditorTheme({ editorThemeLight: hcLight.id }, false, catalog)).toBe(
      hcLight.monacoName
    )
    expect(resolveEditorTheme({ editorThemeDark: hcLight.id }, true, catalog)).toBe(
      DEFAULT_EDITOR_THEME_DARK
    )
    expect(resolveEditorTheme({ editorThemeLight: hcDark.id }, false, catalog)).toBe(
      DEFAULT_EDITOR_THEME_LIGHT
    )
  })

  it('gives built-in IDs precedence over poisoned plugin lookup keys', () => {
    const darkPoison = pluginTheme('dark-poison', 'dark')
    const lightPoison = pluginTheme('light-poison', 'light')
    const catalog = pluginCatalog([], [
      ['vs', darkPoison],
      ['vs-dark', lightPoison]
    ])

    expect(resolveEditorTheme({ editorThemeDark: 'vs' }, true, catalog)).toBe(
      DEFAULT_EDITOR_THEME_DARK
    )
    expect(resolveEditorTheme({ editorThemeLight: 'vs-dark' }, false, catalog)).toBe(
      DEFAULT_EDITOR_THEME_LIGHT
    )
  })

  it('falls back while disabled and restores the same public ID after re-enable', () => {
    const registration = pluginTheme('stable-selection')
    const settings = { editorThemeDark: registration.id }
    const enabled = pluginCatalog([registration])
    const disabled = pluginCatalog([])

    expect(resolveEditorTheme(settings, true, enabled)).toBe(registration.monacoName)
    expect(resolveEditorTheme(settings, true, disabled)).toBe(DEFAULT_EDITOR_THEME_DARK)
    expect(resolveEditorTheme(settings, true, enabled)).toBe(registration.monacoName)
    expect(settings.editorThemeDark).toBe(registration.id)
  })
})
