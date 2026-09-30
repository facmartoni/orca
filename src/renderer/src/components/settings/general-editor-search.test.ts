import { describe, expect, it } from 'vitest'
import { getGeneralEditorSearchEntries, getGeneralPaneSearchEntries } from './general-search'
import { matchesSettingsSearch } from './settings-search'

describe('collapse unchanged settings search', () => {
  it.each(['collapse unchanged', 'collapse', 'hide unchanged', 'fold', 'diff'])(
    'keeps the setting reachable through both search gates for "%s"',
    (query) => {
      const editorEntries = getGeneralEditorSearchEntries()
      const entry = editorEntries.find((item) => item.title === 'Collapse Unchanged Regions')

      expect(entry).toBeDefined()
      expect(matchesSettingsSearch(query, entry!)).toBe(true)
      expect(matchesSettingsSearch(query, editorEntries)).toBe(true)
      expect(matchesSettingsSearch(query, getGeneralPaneSearchEntries())).toBe(true)
    }
  )
})

describe('editor theme settings search', () => {
  it.each([
    'dracula',
    'nord',
    'one dark',
    'tokyo night',
    'catppuccin',
    'monokai',
    'solarized',
    'one light',
    'github dark',
    'github light'
  ])('keeps the editor theme setting reachable through both search gates for "%s"', (query) => {
    const editorEntries = getGeneralEditorSearchEntries()
    expect(matchesSettingsSearch(query, editorEntries)).toBe(true)
    expect(matchesSettingsSearch(query, getGeneralPaneSearchEntries())).toBe(true)
  })
})
