import { describe, expect, it, vi } from 'vitest'

type EditorThemeMode = 'dark' | 'light' | 'hc-dark' | 'hc-light'
type EditorThemeArtifactApi = {
  parsePluginEditorThemeArtifact(raw: string, mode: EditorThemeMode): unknown
}

const artifactModulePath = './plugin-editor-theme-artifact'
const validTheme = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '8a9aa8', fontStyle: 'italic' },
    { token: 'string', foreground: '2aecc9' }
  ],
  colors: {
    'editor.background': '#0a0614',
    'editor.foreground': '#f0e7f3'
  }
}

async function parsePluginEditorThemeArtifact(
  raw: string,
  mode: EditorThemeMode
): Promise<unknown> {
  const artifactApi = await vi.importActual<EditorThemeArtifactApi>(artifactModulePath)
  return artifactApi.parsePluginEditorThemeArtifact(raw, mode)
}

function themeRaw(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...validTheme, ...overrides })
}

function tokenRules(count: number): Array<{ token: string }> {
  return Array.from({ length: count }, (_, index) => ({ token: `t${index}` }))
}

function editorColors(count: number): Record<string, string> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`editor.color${index}`, '#0a0614'])
  )
}

const rejectedArtifact = {
  ok: false,
  error: expect.stringMatching(/\S/)
}

describe('plugin editor theme artifacts', () => {
  it('parses a bounded dark theme whose base matches its mode', async () => {
    expect(await parsePluginEditorThemeArtifact(JSON.stringify(validTheme), 'dark')).toEqual({
      ok: true,
      data: validTheme
    })
  })

  it.each([
    ['light', 'vs'],
    ['hc-dark', 'hc-black'],
    ['hc-light', 'hc-light']
  ] as const)('accepts %s mode with the %s base', async (mode, base) => {
    expect(await parsePluginEditorThemeArtifact(themeRaw({ base }), mode)).toMatchObject({
      ok: true,
      data: { base }
    })
  })

  it('accepts six- and eight-digit colors in their documented formats', async () => {
    const theme = {
      ...validTheme,
      rules: [
        { token: 'foreground', foreground: '8a9aa8' },
        { token: 'background', background: '0a061480' }
      ],
      colors: {
        'editor.background': '#0a0614',
        'editor.selectionBackground': '#2aecc980'
      }
    }

    expect(await parsePluginEditorThemeArtifact(JSON.stringify(theme), 'dark')).toEqual({
      ok: true,
      data: theme
    })
  })

  it.each([
    ['malformed JSON', '{'],
    ['inherit false', themeRaw({ inherit: false })],
    ['unknown root key', themeRaw({ script: 'x' })]
  ] as const)('rejects %s', async (_name, raw) => {
    expect(await parsePluginEditorThemeArtifact(raw, 'dark')).toMatchObject(rejectedArtifact)
  })

  it.each([
    ['dark', 'vs'],
    ['light', 'vs-dark'],
    ['hc-dark', 'hc-light'],
    ['hc-light', 'hc-black']
  ] as const)('rejects %s mode with the %s base', async (mode, base) => {
    expect(await parsePluginEditorThemeArtifact(themeRaw({ base }), mode)).toMatchObject(
      rejectedArtifact
    )
  })

  it.each([
    [
      'token foreground with a hash prefix',
      themeRaw({ rules: [{ token: 'x', foreground: '#fff' }] })
    ],
    [
      'token background with a hash prefix',
      themeRaw({ rules: [{ token: 'x', background: '#0a0614' }] })
    ],
    ['short token color', themeRaw({ rules: [{ token: 'x', foreground: 'fff' }] })],
    ['non-hex token color', themeRaw({ rules: [{ token: 'x', foreground: 'zzzzzz' }] })],
    ['named editor color', themeRaw({ colors: { x: 'red' } })],
    ['editor color without a hash prefix', themeRaw({ colors: { x: '0a0614' } })]
  ] as const)('rejects invalid %s', async (_name, raw) => {
    expect(await parsePluginEditorThemeArtifact(raw, 'dark')).toMatchObject(rejectedArtifact)
  })

  it('rejects a disallowed fontStyle', async () => {
    const raw = themeRaw({ rules: [{ token: 'comment', fontStyle: 'oblique' }] })

    expect(await parsePluginEditorThemeArtifact(raw, 'dark')).toMatchObject(rejectedArtifact)
  })

  it('accepts exactly 4,096 token rules', async () => {
    const result = await parsePluginEditorThemeArtifact(
      themeRaw({ rules: tokenRules(4_096) }),
      'dark'
    )

    expect(result).toMatchObject({ ok: true })
  })

  it('rejects 4,097 token rules', async () => {
    const result = await parsePluginEditorThemeArtifact(
      themeRaw({ rules: tokenRules(4_097) }),
      'dark'
    )

    expect(result).toMatchObject(rejectedArtifact)
  })

  it('accepts exactly 2,048 editor colors', async () => {
    const result = await parsePluginEditorThemeArtifact(
      themeRaw({ colors: editorColors(2_048) }),
      'dark'
    )

    expect(result).toMatchObject({ ok: true })
  })

  it('rejects 2,049 editor colors', async () => {
    const result = await parsePluginEditorThemeArtifact(
      themeRaw({ colors: editorColors(2_049) }),
      'dark'
    )

    expect(result).toMatchObject(rejectedArtifact)
  })

  it.each([
    [
      'token name longer than 256 characters',
      themeRaw({ rules: [{ token: 'x'.repeat(257) }] })
    ],
    [
      'editor color key longer than 128 characters',
      themeRaw({ colors: { ['x'.repeat(129)]: '#0a0614' } })
    ],
    ['control character in a token name', themeRaw({ rules: [{ token: 'x\u0000y' }] })],
    [
      'control character in an editor color key',
      themeRaw({ colors: { ['editor.\u0000background']: '#0a0614' } })
    ]
  ] as const)('rejects %s', async (_name, raw) => {
    expect(await parsePluginEditorThemeArtifact(raw, 'dark')).toMatchObject(rejectedArtifact)
  })

  it.each(['__proto__', 'prototype', 'constructor'])('rejects editor color key %j', async (key) => {
    const colors = Object.fromEntries([[key, '#0a0614']])

    expect(
      await parsePluginEditorThemeArtifact(themeRaw({ colors }), 'dark')
    ).toMatchObject(rejectedArtifact)
  })
})
