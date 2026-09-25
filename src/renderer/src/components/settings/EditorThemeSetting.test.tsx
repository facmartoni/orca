// @vitest-environment happy-dom

import { join } from 'node:path'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: { settingsSearchQuery: string }) => unknown) =>
    selector({ settingsSearchQuery: '' })
}))

import { EditorThemeSetting } from './EditorThemeSetting'

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  if (root) {
    act(() => root?.unmount())
  }
  container?.remove()
  root = null
  container = null
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

describe('EditorThemeSetting', () => {
  it('renders dark and light theme selectors', () => {
    const { container } = renderSetting()
    const triggers = container.querySelectorAll('[role="combobox"]')
    expect(triggers.length).toBe(2)

    expect(triggers[0]?.getAttribute('aria-label')).toBe('Editor Theme (Dark Mode)')
    expect(triggers[1]?.getAttribute('aria-label')).toBe('Editor Theme (Light Mode)')
  })

  it('displays configured dark and light theme names', () => {
    const { container } = renderSetting({
      editorThemeDark: 'dracula',
      editorThemeLight: 'one-light'
    })
    const triggers = container.querySelectorAll('[role="combobox"]')
    expect(triggers[0]?.textContent).toContain('Dracula')
    expect(triggers[1]?.textContent).toContain('One Light')
  })
})
