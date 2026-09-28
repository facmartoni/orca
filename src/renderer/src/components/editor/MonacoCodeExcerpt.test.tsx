// @vitest-environment happy-dom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  createPluginEditorThemeCatalog,
  usePluginEditorThemeStore
} from '@/store/plugin-editor-themes'

const monacoMock = vi.hoisted(() => ({
  editor: {
    setTheme: vi.fn(),
    colorize: vi.fn(async () => '<span>colored</span>')
  }
}))

vi.mock('@/lib/monaco-setup', () => ({ monaco: monacoMock }))
vi.mock('./use-editor-theme', () => ({
  useEditorTheme: () => 'orca-plugin-theme-stable'
}))

import { useMonacoColorizedLines } from './MonacoCodeExcerpt'

beforeEach(() => {
  monacoMock.editor.setTheme.mockClear()
  monacoMock.editor.colorize.mockClear()
  usePluginEditorThemeStore.setState({
    pending: { generation: 1, registrations: [] },
    active: createPluginEditorThemeCatalog([], 1),
    loading: false,
    error: null
  })
})

afterEach(() => {
  cleanup()
})

it('recolorizes once when the active plugin revision changes under the same Monaco name', async () => {
  const lines = ['const answer = 42']
  const view = renderHook(() => useMonacoColorizedLines(lines, 'typescript'))
  await waitFor(() => expect(monacoMock.editor.colorize).toHaveBeenCalledTimes(1))

  view.rerender()
  expect(monacoMock.editor.colorize).toHaveBeenCalledTimes(1)

  act(() => {
    usePluginEditorThemeStore.setState({
      pending: { generation: 2, registrations: [] },
      active: createPluginEditorThemeCatalog([], 2)
    })
  })

  await waitFor(() => expect(monacoMock.editor.colorize).toHaveBeenCalledTimes(2))
  expect(monacoMock.editor.setTheme).toHaveBeenCalledTimes(1)
})
