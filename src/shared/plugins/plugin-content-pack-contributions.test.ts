import { describe, expect, it } from 'vitest'
import { parsePluginManifest, pluginManifestSchema } from './plugin-manifest'
import { pluginEditorThemeContributionSchema } from './plugin-content-pack-contributions'

function manifest(contributes: Record<string, unknown>): Record<string, unknown> {
  return {
    manifestVersion: 1,
    id: 'content-pack',
    publisher: 'orca-samples',
    name: 'Content pack',
    version: '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    contributes,
    capabilities: []
  }
}

const editorThemeContribution = (overrides: Record<string, unknown> = {}) => ({
  id: 'robbydev',
  label: 'RobbyDev',
  mode: 'dark',
  path: 'themes/robbydev.json',
  ...overrides
})

describe('content-pack manifest contributions', () => {
  it('accepts the documented P1 contribution set without a worker', () => {
    const parsed = pluginManifestSchema.parse(
      manifest({
        languagePacks: [{ locale: 'pt-BR', path: 'locales/pt-BR.json' }],
        commands: [
          {
            id: 'workspace.openTasks',
            title: 'Open tasks',
            context: 'worktree',
            action: 'view.tasks'
          }
        ],
        keybindings: [{ command: 'workspace.openTasks', key: 'Mod+Alt+T' }],
        vmRecipes: [{ path: 'recipes/fly.json' }],
        agents: [{ path: 'agents/custom.json' }]
      })
    )

    expect(parsed.main).toBeUndefined()
    expect(parsed.contributes.languagePacks[0]?.locale).toBe('pt-BR')
    expect(parsed.contributes.keybindings[0]?.key).toBe('Mod+Alt+T')
  })

  it('defaults every contribution registry to an empty array', () => {
    const parsed = pluginManifestSchema.parse(manifest({}))

    expect(parsed.contributes).toEqual({
      panels: [],
      commands: [],
      events: [],
      languagePacks: [],
      keybindings: [],
      vmRecipes: [],
      editorThemes: [],
      agents: []
    })
  })

  it('rejects the removed plugin skills contribution', () => {
    expect(parsePluginManifest(manifest({ skills: [{ path: 'skills' }] }))).toMatchObject({
      ok: false,
      error: expect.stringContaining('Unrecognized key')
    })
  })

  it('still requires a worker entry for non-alias commands', () => {
    expect(
      parsePluginManifest(
        manifest({ commands: [{ id: 'content-pack.run', title: 'Run content pack' }] })
      )
    ).toMatchObject({ ok: false, error: expect.stringContaining('worker command') })
  })

  it.each([
    [
      'unknown alias target',
      {
        commands: [{ id: 'open', title: 'Open', action: 'missing.action' }]
      },
      'unknown built-in action'
    ],
    [
      'unknown command reference',
      { keybindings: [{ command: 'missing', key: 'Mod+K' }] },
      'unknown contributed command'
    ],
    [
      'invalid chord',
      {
        commands: [{ id: 'open', title: 'Open', action: 'view.tasks' }],
        keybindings: [{ command: 'open', key: 'Mod+NotAKey' }]
      },
      'key'
    ],
    [
      'global binding for a worktree command',
      {
        commands: [{ id: 'open', title: 'Open', context: 'worktree', action: 'view.tasks' }],
        keybindings: [{ command: 'open', key: 'Mod+K', when: 'global' }]
      },
      'command context'
    ],
    [
      'platform-equivalent duplicate chords',
      {
        commands: [
          { id: 'first', title: 'First', action: 'view.tasks' },
          { id: 'second', title: 'Second', action: 'sidebar.left.toggle' }
        ],
        keybindings: [
          { command: 'first', key: 'Mod+K' },
          { command: 'second', key: 'Ctrl+K' }
        ]
      },
      'duplicate keybinding'
    ]
  ])('rejects %s', (_label, contributes, error) => {
    expect(parsePluginManifest(manifest(contributes))).toMatchObject({
      ok: false,
      error: expect.stringContaining(error)
    })
  })

  it.each([
    ['language pack', { languagePacks: [{ locale: 'en_US', path: 'locale.json' }] }],
    ['language pack path', { languagePacks: [{ locale: 'pt-BR', path: '../outside.json' }] }],
    ['VM recipe', { vmRecipes: [{ path: '\\\\server\\recipe.json' }] }],
    ['agent profile', { agents: [{ path: 'agents/../profile.json' }] }]
  ])('rejects unsafe or malformed %s contributions', (_label, contributes) => {
    expect(parsePluginManifest(manifest(contributes)).ok).toBe(false)
  })

  it('rejects duplicate ids, locales, paths, and bindings', () => {
    const parsed = pluginManifestSchema.safeParse(
      manifest({
        languagePacks: [
          { locale: 'pt-BR', path: 'pt-br.json' },
          { locale: 'pt-br', path: 'other.json' }
        ],
        commands: [{ id: 'open', title: 'Open', action: 'view.tasks' }],
        keybindings: [
          { command: 'open', key: 'Mod+T' },
          { command: 'open', key: 'mod+t' }
        ]
      })
    )

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(parsed.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          'duplicate language pack locale: pt-br',
          'duplicate keybinding: mod+t'
        ])
      )
    }
  })

  it('keeps existing manifests without editorThemes valid', () => {
    const parsed = pluginManifestSchema.safeParse(
      manifest({
        languagePacks: [{ locale: 'pt-BR', path: 'locales/pt-BR.json' }]
      })
    )

    expect(parsed.success).toBe(true)
  })

  it.each(['dark', 'light', 'hc-dark', 'hc-light'])(
    'accepts supported editor theme mode %j',
    (mode) => {
      const parsed = pluginEditorThemeContributionSchema.safeParse(
        editorThemeContribution({ mode })
      )

      expect(parsed.success).toBe(true)
    }
  )

  it.each(['sepia', '', 'DARK'])('rejects unsupported editor theme mode %j', (mode) => {
    const parsed = pluginEditorThemeContributionSchema.safeParse(editorThemeContribution({ mode }))

    expect(parsed.success).toBe(false)
  })

  it.each(['', '   ', 'x'.repeat(257)])('rejects invalid editor theme label %j', (label) => {
    const parsed = pluginEditorThemeContributionSchema.safeParse(editorThemeContribution({ label }))

    expect(parsed.success).toBe(false)
  })

  it.each(['', '../robbydev.json', '/themes/robbydev.json', 'themes/../robbydev.json'])(
    'rejects unsafe editor theme path %j',
    (path) => {
      const parsed = pluginEditorThemeContributionSchema.safeParse(
        editorThemeContribution({ path })
      )

      expect(parsed.success).toBe(false)
    }
  )

  it('accepts 16 editor themes and rejects a seventeenth', () => {
    const editorThemes = Array.from({ length: 16 }, (_, index) =>
      editorThemeContribution({ id: `theme-${index}` })
    )

    expect(pluginManifestSchema.safeParse(manifest({ editorThemes })).success).toBe(true)
    expect(
      pluginManifestSchema.safeParse(
        manifest({
          editorThemes: [...editorThemes, editorThemeContribution({ id: 'theme-overflow' })]
        })
      ).success
    ).toBe(false)
  })

  it('rejects duplicate local editor theme ids', () => {
    const unique = pluginManifestSchema.safeParse(
      manifest({
        editorThemes: [
          editorThemeContribution(),
          editorThemeContribution({ id: 'robbydev-light', mode: 'light' })
        ]
      })
    )
    expect(unique.success).toBe(true)

    const duplicate = pluginManifestSchema.safeParse(
      manifest({
        editorThemes: [
          editorThemeContribution(),
          editorThemeContribution({ label: 'RobbyDev Alternate' })
        ]
      })
    )
    expect(duplicate.success).toBe(false)
  })
})
