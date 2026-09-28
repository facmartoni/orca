// @vitest-environment happy-dom

import { join } from 'node:path'
import { screen } from '@testing-library/react'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  pluginEditorThemeId,
  pluginEditorThemeMonacoName
} from '../../../../shared/plugins/plugin-editor-theme-artifact'
import type { PluginEditorThemeRegistration } from '../../../../shared/plugins/plugin-editor-theme-artifact'
import { DARK_EDITOR_THEMES, LIGHT_EDITOR_THEMES } from '@/lib/monaco-themes'
import {
  createPluginEditorThemeCatalog,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'

const searchState = vi.hoisted(() => ({ query: '' }))
const monacoSetupLoaded = vi.hoisted(() => vi.fn())

vi.mock('@/lib/monaco-setup', () => {
  monacoSetupLoaded()
  return { monaco: {} }
})

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: searchState.query })
}))

vi.mock('../ui/select', async () => {
  const ReactModule = await import('react')
  const { ALL_EDITOR_THEMES } = await import('@/lib/monaco-themes')
  const SelectContext = ReactModule.createContext<{
    value?: string
    onValueChange?: (value: string) => void
  }>({})

  return {
    Select: ({
      value,
      onValueChange,
      children
    }: {
      value: string
      onValueChange: (value: string) => void
      children: React.ReactNode
    }) => {
      const contextValue = ReactModule.useMemo(
        () => ({ value, onValueChange }),
        [value, onValueChange]
      )
      return (
        <SelectContext.Provider value={contextValue}>
          <div data-slot="select" data-value={value}>
            {children}
          </div>
        </SelectContext.Provider>
      )
    },
    SelectTrigger: ({ children, ...props }: React.ComponentProps<'button'>) => (
      <button type="button" role="combobox" data-slot="select-trigger" {...props}>
        {children}
      </button>
    ),
    SelectValue: () => {
      const { value } = ReactModule.useContext(SelectContext)
      const label = ALL_EDITOR_THEMES.find((theme) => theme.id === value)?.name ?? value
      return <span data-slot="select-value">{label}</span>
    },
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div data-slot="select-content">{children}</div>
    ),
    SelectItem: ({
      value,
      disabled,
      children
    }: {
      value: string
      disabled?: boolean
      children: React.ReactNode
    }) => {
      const { onValueChange } = ReactModule.useContext(SelectContext)
      return (
        <button
          type="button"
          role="option"
          data-slot="select-item"
          data-value={value}
          disabled={disabled}
          onClick={() => onValueChange?.(value)}
        >
          {children}
        </button>
      )
    }
  }
})

import { EditorThemeSetting } from './EditorThemeSetting'

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
  mode: PluginEditorThemeRegistration['mode'],
  label: string,
  pluginKey = 'tests.settings-theme'
): PluginEditorThemeRegistration {
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

function publishThemeOptions(
  pending: readonly PluginEditorThemeRegistration[],
  pendingGeneration: number,
  active: readonly PluginEditorThemeRegistration[],
  activeRevision: number,
  loading = false
): void {
  act(() => {
    usePluginEditorThemeStore.setState({
      pending: { generation: pendingGeneration, registrations: pending },
      active: createPluginEditorThemeCatalog(active, activeRevision),
      loading,
      error: null
    })
  })
}

function optionValues(select: Element): string[] {
  return Array.from(select.querySelectorAll('[role="option"]')).map(
    (option) => option.getAttribute('data-value') ?? ''
  )
}

let root: Root | null = null
let container: HTMLDivElement | null = null

beforeEach(() => {
  monacoSetupLoaded.mockClear()
  searchState.query = ''
  vi.stubGlobal('api', { plugins: {} })
  publishThemeOptions([], 1, [], 1)
})

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
  vi.unstubAllGlobals()
})

function renderSetting(
  props: { editorThemeDark?: string; editorThemeLight?: string } = {},
  updateSettings = vi.fn()
) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <EditorThemeSetting
        settings={{
          ...getDefaultSettings(join('test', 'home')),
          ...props
        }}
        updateSettings={updateSettings}
      />
    )
  })
  return { container, updateSettings }
}

it('loads Monaco setup when Settings mounts before any editor', async () => {
  renderSetting()

  await vi.waitFor(() => {
    expect(monacoSetupLoaded).toHaveBeenCalledOnce()
  })
})

describe('EditorThemeSetting', () => {
  it('renders dark and light theme selectors', () => {
    const { container } = renderSetting()
    const triggers = container.querySelectorAll('[role="combobox"]')
    expect(triggers.length).toBe(2)

    expect(triggers[0]?.getAttribute('aria-label')).toBe('Editor Theme (Dark Mode)')
    expect(triggers[1]?.getAttribute('aria-label')).toBe('Editor Theme (Light Mode)')
  })

  it('displays configured dark and light theme values and visible labels', () => {
    const { container } = renderSetting({
      editorThemeDark: 'dracula',
      editorThemeLight: 'one-light'
    })
    const selects = container.querySelectorAll('[data-slot="select"]')
    expect(selects[0]?.getAttribute('data-value')).toBe('dracula')
    expect(selects[1]?.getAttribute('data-value')).toBe('one-light')

    const triggers = container.querySelectorAll('[role="combobox"]')
    expect(triggers[0]?.textContent).toContain('Dracula')
    expect(triggers[1]?.textContent).toContain('One Light')
  })

  it('updates dark editor theme when a dark theme is selected', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting({}, updateSettings)
    const draculaOption = container.querySelector<HTMLButtonElement>(
      'button[role="option"][data-value="dracula"]'
    )
    expect(draculaOption).not.toBeNull()

    act(() => draculaOption?.click())
    expect(updateSettings).toHaveBeenCalledWith({ editorThemeDark: 'dracula' })
  })

  it('updates light editor theme when a light theme is selected', () => {
    const updateSettings = vi.fn()
    const { container } = renderSetting({}, updateSettings)
    const oneLightOption = container.querySelector<HTMLButtonElement>(
      'button[role="option"][data-value="one-light"]'
    )
    expect(oneLightOption).not.toBeNull()

    act(() => oneLightOption?.click())
    expect(updateSettings).toHaveBeenCalledWith({ editorThemeLight: 'one-light' })
  })
})

describe('plugin editor themes in Settings', () => {
  it('keeps built-ins first and plugin options ordered after them', () => {
    const alphaDark = pluginTheme('alpha-dark', 'dark', 'Alpha')
    const betaLight = pluginTheme('beta-light', 'light', 'Beta')
    const zetaDark = pluginTheme('zeta-dark', 'dark', 'Zeta')
    publishThemeOptions(
      [alphaDark, betaLight, zetaDark],
      2,
      [alphaDark, betaLight, zetaDark],
      2
    )

    const { container } = renderSetting()
    const selects = container.querySelectorAll('[data-slot="select"]')
    const darkValues = optionValues(selects[0]!)
    const lightValues = optionValues(selects[1]!)

    expect(darkValues.slice(0, DARK_EDITOR_THEMES.length)).toEqual(
      DARK_EDITOR_THEMES.map((theme) => theme.id)
    )
    expect(darkValues.slice(DARK_EDITOR_THEMES.length)).toEqual([alphaDark.id, zetaDark.id])
    expect(lightValues.slice(0, LIGHT_EDITOR_THEMES.length)).toEqual(
      LIGHT_EDITOR_THEMES.map((theme) => theme.id)
    )
    expect(lightValues.slice(LIGHT_EDITOR_THEMES.length)).toEqual([betaLight.id])
  })

  it('keeps active options and shows loading while pending is ahead', () => {
    const pendingOnly = pluginTheme('pending-only', 'dark', 'Pending Only')
    const active = pluginTheme('active', 'dark', 'Active')
    publishThemeOptions([pendingOnly], 4, [active], 3)

    const { container } = renderSetting()
    const darkValues = optionValues(container.querySelectorAll('[data-slot="select"]')[0]!)

    expect(darkValues).toContain(active.id)
    expect(darkValues).not.toContain(pendingOnly.id)
    expect(container.textContent).toMatch(/loading/i)
  })

  it('uses the owner-isolated active options once its revision matches pending', () => {
    const admitted = pluginTheme('admitted', 'dark', 'Admitted')
    const excluded = pluginTheme('excluded', 'dark', 'Excluded')
    publishThemeOptions([admitted, excluded], 5, [admitted], 5)

    const { container } = renderSetting()
    const darkValues = optionValues(container.querySelectorAll('[data-slot="select"]')[0]!)

    expect(darkValues).toContain(admitted.id)
    expect(darkValues).not.toContain(excluded.id)
  })

  it('limits each selector to its dark or light family, including high contrast', () => {
    const dark = pluginTheme('dark', 'dark', 'Dark')
    const hcDark = pluginTheme('hc-dark', 'hc-dark', 'HC Dark')
    const light = pluginTheme('light', 'light', 'Light')
    const hcLight = pluginTheme('hc-light', 'hc-light', 'HC Light')
    publishThemeOptions(
      [dark, hcDark, light, hcLight],
      6,
      [dark, hcDark, light, hcLight],
      6
    )

    const { container } = renderSetting()
    const selects = container.querySelectorAll('[data-slot="select"]')
    const darkValues = optionValues(selects[0]!)
    const lightValues = optionValues(selects[1]!)

    expect(darkValues).toEqual(expect.arrayContaining([dark.id, hcDark.id]))
    expect(darkValues).not.toEqual(expect.arrayContaining([light.id, hcLight.id]))
    expect(lightValues).toEqual(expect.arrayContaining([light.id, hcLight.id]))
    expect(lightValues).not.toEqual(expect.arrayContaining([dark.id, hcDark.id]))
  })

  it('persists the selected plugin public ID instead of its Monaco name', () => {
    const registration = pluginTheme('public-selection', 'dark', 'Public Selection')
    publishThemeOptions([registration], 7, [registration], 7)
    const updateSettings = vi.fn()
    const { container } = renderSetting({}, updateSettings)
    const option = container.querySelector<HTMLButtonElement>(
      `button[role="option"][data-value="${registration.id}"]`
    )

    expect(option).not.toBeNull()
    expect(registration.id).not.toBe(registration.monacoName)
    act(() => option?.click())
    expect(updateSettings).toHaveBeenCalledExactlyOnceWith({
      editorThemeDark: registration.id
    })
  })

  it('marks a selected theme unavailable only after absence is settled', () => {
    const missingId = pluginEditorThemeId('tests.missing-owner', 'missing')
    publishThemeOptions([], 0, [], 0, true)
    const { container } = renderSetting({ editorThemeDark: missingId })
    const darkSelect = container.querySelectorAll('[data-slot="select"]')[0]!

    expect(container.textContent).toMatch(/loading/i)
    expect(darkSelect.textContent).not.toContain('Unavailable')
    expect(darkSelect.querySelector(`button[data-value="${missingId}"]`)).toBeNull()

    publishThemeOptions([], 8, [], 8, false)

    const settledDarkSelect = container.querySelectorAll('[data-slot="select"]')[0]!
    expect(container.textContent).not.toMatch(/loading/i)
    const unavailable = settledDarkSelect.querySelector<HTMLButtonElement>(
      `button[data-value="${missingId}"]`
    )
    expect(unavailable?.disabled).toBe(true)
    expect(unavailable?.textContent).toContain('Unavailable')
    expect(unavailable?.textContent).toContain(missingId)
  })

  it('marks a selected theme unavailable when it belongs to the opposite family', () => {
    const lightOnly = pluginTheme('light-only', 'light', 'Light Only')
    publishThemeOptions([lightOnly], 9, [lightOnly], 9)

    const { container } = renderSetting({ editorThemeDark: lightOnly.id })
    const selects = container.querySelectorAll('[data-slot="select"]')
    const unavailable = selects[0]!.querySelector<HTMLButtonElement>(
      `button[data-value="${lightOnly.id}"]`
    )
    const available = selects[1]!.querySelector<HTMLButtonElement>(
      `button[data-value="${lightOnly.id}"]`
    )

    expect(unavailable?.disabled).toBe(true)
    expect(unavailable?.textContent).toContain('Unavailable')
    expect(unavailable?.textContent).toContain(lightOnly.id)
    expect(available?.disabled).toBe(false)
  })

  it('gives duplicate labels unique accessible names with each plugin key', () => {
    const first = pluginTheme('first', 'dark', 'Dracula', 'tests.first-owner')
    const second = pluginTheme('second', 'dark', 'Dracula', 'tests.second-owner')
    publishThemeOptions([first, second], 10, [first, second], 10)

    renderSetting()

    expect(
      screen.getByRole('option', { name: /^Dracula — tests\.first-owner$/ })
    ).toBeTruthy()
    expect(
      screen.getByRole('option', { name: /^Dracula — tests\.second-owner$/ })
    ).toBeTruthy()
  })
})

describe('editor theme inner search metadata', () => {
  it.each([...DARK_EDITOR_THEMES, ...LIGHT_EDITOR_THEMES].map((theme) => [theme.id, theme.name] as const))(
    'keeps a selector visible for the catalog name %s',
    (_id, visibleName) => {
      searchState.query = visibleName

      const { container } = renderSetting()

      expect(container.querySelector('[data-slot="select"]')).not.toBeNull()
    }
  )

  it.each(['label', 'public ID', 'plugin key'] as const)(
    'keeps the plugin option visible when searching by %s',
    (field) => {
      const registration = pluginTheme(
        'searchable',
        'dark',
        'Searchable Theme',
        'tests.searchable-owner'
      )
      publishThemeOptions([registration], 12, [registration], 12)
      searchState.query =
        field === 'label'
          ? registration.label
          : field === 'public ID'
            ? registration.id
            : registration.pluginKey

      const { container } = renderSetting()

      expect(
        container.querySelector(`button[data-value="${registration.id}"]`)
      ).not.toBeNull()
    }
  )
})
