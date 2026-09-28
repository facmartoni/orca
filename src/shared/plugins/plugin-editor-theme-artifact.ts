import { z } from 'zod'
import type { PluginEditorThemeMode } from './plugin-content-pack-contributions'

export type PluginEditorThemeData = {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  inherit: true
  rules: Array<{
    token: string
    foreground?: string
    background?: string
    fontStyle?: string
  }>
  colors: Record<string, string>
}

export type PluginEditorThemeArtifactResult =
  | { ok: true; data: PluginEditorThemeData }
  | { ok: false; error: string }

export type PluginEditorThemeId = `${string}.${string}/${string}`

const TOKEN_RULE_LIMIT = 4_096
const EDITOR_COLOR_LIMIT = 2_048
const TOKEN_NAME_LIMIT = 256
const EDITOR_COLOR_KEY_LIMIT = 128
const DANGEROUS_KEYS = {
  ['__proto__']: true,
  prototype: true,
  constructor: true
} as const satisfies Record<string, true>
const CONTROL_CHARACTER_RE = /[\u0000-\u001f]/
const TOKEN_COLOR_RE = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i
const EDITOR_COLOR_RE = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i
const FONT_STYLE_RE =
  /^(?:(?:italic|bold|underline|strikethrough)(?: (?:italic|bold|underline|strikethrough))*)?$/

const tokenNameSchema = z
  .string()
  .max(TOKEN_NAME_LIMIT)
  .refine((value) => !CONTROL_CHARACTER_RE.test(value), 'must not contain control characters')

const tokenColorSchema = z
  .string()
  .regex(TOKEN_COLOR_RE, 'must be RRGGBB or RRGGBBAA without #')

const tokenRuleSchema = z
  .object({
    token: tokenNameSchema,
    foreground: tokenColorSchema.optional(),
    background: tokenColorSchema.optional(),
    fontStyle: z
      .string()
      .max(64)
      .regex(FONT_STYLE_RE, 'contains unsupported font style')
      .optional()
  })
  .strict()

const editorColorKeySchema = z
  .string()
  .min(1)
  .max(EDITOR_COLOR_KEY_LIMIT)
  .refine((value) => DANGEROUS_KEYS[value] !== true, 'must not be a prototype key')
  .refine((value) => !CONTROL_CHARACTER_RE.test(value), 'must not contain control characters')

const editorColorSchema = z
  .string()
  .regex(EDITOR_COLOR_RE, 'must be #RRGGBB or #RRGGBBAA')

const pluginEditorThemeArtifactSchema = z
  .object({
    base: z.enum(['vs', 'vs-dark', 'hc-black', 'hc-light']),
    inherit: z.literal(true),
    rules: z.array(tokenRuleSchema).max(TOKEN_RULE_LIMIT),
    colors: z
      .record(editorColorKeySchema, editorColorSchema)
      .refine(
        (colors) => Object.keys(colors).length <= EDITOR_COLOR_LIMIT,
        `must contain at most ${EDITOR_COLOR_LIMIT} entries`
      )
  })
  .strict()

function dangerousOwnEditorColorKey(source: unknown): string | undefined {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    return undefined
  }
  const colors = (source as Record<string, unknown>).colors
  if (typeof colors !== 'object' || colors === null || Array.isArray(colors)) {
    return undefined
  }
  for (const key of Object.keys(colors)) {
    if (Object.prototype.hasOwnProperty.call(DANGEROUS_KEYS, key)) {
      return key
    }
  }
  return undefined
}

const BASE_BY_MODE = {
  dark: 'vs-dark',
  light: 'vs',
  'hc-dark': 'hc-black',
  'hc-light': 'hc-light'
} as const satisfies Record<PluginEditorThemeMode, PluginEditorThemeData['base']>

export function parsePluginEditorThemeArtifact(
  raw: string,
  mode: PluginEditorThemeMode
): PluginEditorThemeArtifactResult {
  let source: unknown
  try {
    source = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'editor theme artifact must contain valid JSON' }
  }

  const dangerousColorKey = dangerousOwnEditorColorKey(source)
  if (dangerousColorKey !== undefined) {
    return {
      ok: false,
      error: `invalid editor theme artifact at colors.${dangerousColorKey}: must not be a prototype key`
    }
  }

  const parsed = pluginEditorThemeArtifactSchema.safeParse(source)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const location = issue?.path.length ? ` at ${issue.path.join('.')}` : ''
    return {
      ok: false,
      error: `invalid editor theme artifact${location}: ${issue?.message ?? 'unknown error'}`
    }
  }

  const expectedBase = BASE_BY_MODE[mode]
  if (parsed.data.base !== expectedBase) {
    return {
      ok: false,
      error: `editor theme base ${parsed.data.base} does not match ${mode}; expected ${expectedBase}`
    }
  }

  return { ok: true, data: parsed.data }
}

export function pluginEditorThemeId(
  pluginKey: string,
  localId: string
): PluginEditorThemeId {
  return `${pluginKey}/${localId}` as PluginEditorThemeId
}

export function pluginEditorThemeMonacoName(id: PluginEditorThemeId): string {
  const bytes = new TextEncoder().encode(id)
  let encoded = ''
  for (const byte of bytes) encoded += byte.toString(16).padStart(2, '0')
  return `orca-plugin-theme-${encoded}`
}
