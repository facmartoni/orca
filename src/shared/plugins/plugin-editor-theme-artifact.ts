import { z } from 'zod'
import {
  PLUGIN_EDITOR_THEME_MODES,
  type PluginEditorThemeMode
} from './plugin-content-pack-contributions'
import { isSafePluginId } from './plugin-manifest-fields'
import { isQualifiedPluginKey } from './plugin-tab-key'

export type PluginEditorThemeData = {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'
  inherit: boolean
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

export type PluginEditorThemeRegistration = {
  id: PluginEditorThemeId
  monacoName: string
  pluginKey: string
  localId: string
  label: string
  mode: PluginEditorThemeMode
  data: PluginEditorThemeData
}

const TOKEN_RULE_LIMIT = 4_096
const EDITOR_COLOR_LIMIT = 2_048
const TOKEN_NAME_LIMIT = 256
const EDITOR_COLOR_KEY_LIMIT = 128
const DANGEROUS_KEYS = {
  ['__proto__']: true,
  prototype: true,
  constructor: true
} as const satisfies Record<string, true>
const CONTROL_CHARACTER_RE = /[\u0000-\u001f\u007f-\u009f]/
const TOKEN_COLOR_RE = /^[0-9a-f]{6}(?:[0-9a-f]{2})?$/i
const EDITOR_COLOR_RE = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i
const FONT_STYLE_RE =
  /^(?:(?:italic|bold|underline|strikethrough)(?: (?:italic|bold|underline|strikethrough))*)?$/

function formatErrorPath(path: readonly PropertyKey[]): string {
  return path
    .map((segment) => {
      const value = typeof segment === 'symbol' ? String(segment) : segment
      const serialized = JSON.stringify(value)
      if (serialized === undefined) return '""'
      return serialized.replace(
        /[\u007f-\u009f]/g,
        (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
      )
    })
    .join('.')
}

function invalidEditorThemeArtifact(error: string): { ok: false; error: string } {
  return {
    ok: false,
    error: error.replace(
      /[\u0000-\u001f\u007f-\u009f]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
    )
  }
}

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
    inherit: z.boolean(),
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


export function parsePluginEditorThemeRegistration(
  value: unknown
): PluginEditorThemeRegistration | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const registration = value as Record<string, unknown>
  if (
    typeof registration.id !== 'string' ||
    typeof registration.monacoName !== 'string' ||
    typeof registration.pluginKey !== 'string' ||
    !isQualifiedPluginKey(registration.pluginKey) ||
    typeof registration.localId !== 'string' ||
    !isSafePluginId(registration.localId) ||
    typeof registration.label !== 'string' ||
    registration.label.length === 0 ||
    registration.label.length > 256 ||
    registration.label.trim() !== registration.label ||
    typeof registration.mode !== 'string' ||
    !PLUGIN_EDITOR_THEME_MODES.includes(registration.mode as PluginEditorThemeMode)
  ) {
    return null
  }

  const id = `${registration.pluginKey}/${registration.localId}` as PluginEditorThemeId
  const mode = registration.mode as PluginEditorThemeMode
  const sourceData = registration.data
  if (
    registration.id !== id ||
    registration.monacoName !== pluginEditorThemeMonacoName(id) ||
    dangerousOwnEditorColorKey(sourceData) !== undefined
  ) {
    return null
  }
  const data = pluginEditorThemeArtifactSchema.safeParse(sourceData)
  if (!data.success || data.data.base !== BASE_BY_MODE[mode]) {
    return null
  }
  return {
    id,
    monacoName: registration.monacoName,
    pluginKey: registration.pluginKey,
    localId: registration.localId,
    label: registration.label,
    mode,
    data: data.data
  }
}

export function isPluginEditorThemeRegistration(
  value: unknown
): value is PluginEditorThemeRegistration {
  return parsePluginEditorThemeRegistration(value) !== null
}
export function parsePluginEditorThemeArtifact(
  raw: string,
  mode: PluginEditorThemeMode
): PluginEditorThemeArtifactResult {
  let source: unknown
  try {
    source = JSON.parse(raw)
  } catch {
    return invalidEditorThemeArtifact('editor theme artifact must contain valid JSON')
  }

  const dangerousColorKey = dangerousOwnEditorColorKey(source)
  if (dangerousColorKey !== undefined) {
    return invalidEditorThemeArtifact(
      `invalid editor theme artifact at ${formatErrorPath(['colors', dangerousColorKey])}: must not be a prototype key`
    )
  }

  const parsed = pluginEditorThemeArtifactSchema.safeParse(source)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const location = issue?.path.length ? ` at ${formatErrorPath(issue.path)}` : ''
    return invalidEditorThemeArtifact(
      `invalid editor theme artifact${location}: ${issue?.message ?? 'unknown error'}`
    )
  }

  const expectedBase = BASE_BY_MODE[mode]
  if (parsed.data.base !== expectedBase) {
    return invalidEditorThemeArtifact(
      `editor theme base ${parsed.data.base} does not match ${mode}; expected ${expectedBase}`
    )
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
