import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PluginEditorThemeMode } from '../../shared/plugins/plugin-content-pack-contributions'
import { fingerprintPluginConsent } from '../../shared/plugins/plugin-consent-fingerprint'
import type {
  PluginEditorThemeData,
  PluginEditorThemeRegistration
} from '../../shared/plugins/plugin-editor-theme-artifact'
import { pluginManifestSchema } from '../../shared/plugins/plugin-manifest'
import { hashPluginTree } from './plugin-content-hash'
import { PluginContentVerifier } from './plugin-content-integrity'
import type { ValidDiscoveredPlugin } from './plugin-discovery'

const roots: string[] = []
const registryModulePath = './plugin-editor-theme-registry'
const artifactModulePath = '../../shared/plugins/plugin-editor-theme-artifact'

const darkTheme: PluginEditorThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [{ token: 'comment', foreground: '8a9aa8', fontStyle: 'italic' }],
  colors: {
    'editor.background': '#0a0614',
    'editor.foreground': '#f0e7f3'
  }
}

const updatedDarkTheme: PluginEditorThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [{ token: 'string', foreground: '2aecc9' }],
  colors: {
    'editor.background': '#170b2d',
    'editor.foreground': '#fff7ff'
  }
}

type ThemeInput = {
  id: string
  label: string
  mode?: PluginEditorThemeMode
  path?: string
  data?: PluginEditorThemeData
  raw?: string
}

type ThemePluginFixture = {
  plugin: ValidDiscoveredPlugin
  themePaths: string[]
}

type EditorThemeRegistry = {
  list(): readonly PluginEditorThemeRegistration[]
  error(pluginKey: string): string | null
  reconcile(
    discovered: readonly ValidDiscoveredPlugin[],
    isApproved: (plugin: ValidDiscoveredPlugin) => boolean
  ): Promise<void>
}

type EditorThemeRegistryModule = {
  PluginEditorThemeRegistry: new (contentVerifier: PluginContentVerifier) => EditorThemeRegistry
}

type EditorThemeArtifactModule = {
  isPluginEditorThemeRegistration(value: unknown): value is PluginEditorThemeRegistration
}

async function createRegistry(
  contentVerifier = new PluginContentVerifier()
): Promise<EditorThemeRegistry> {
  const registryApi = await vi.importActual<EditorThemeRegistryModule>(registryModulePath)
  return new registryApi.PluginEditorThemeRegistry(contentVerifier)
}

async function createThemePlugin(options: {
  publisher?: string
  id?: string
  version?: string
  themes?: ThemeInput[]
  installed?: boolean
} = {}): Promise<ThemePluginFixture> {
  const publisher = options.publisher ?? 'orca-samples'
  const id = options.id ?? 'editor-theme'
  const themes = options.themes ?? [{ id: 'robbydev', label: 'RobbyDev' }]
  const rootDir = await mkdtemp(join(tmpdir(), 'orca-plugin-editor-theme-registry-'))
  roots.push(rootDir)
  await mkdir(join(rootDir, 'themes'))

  const contributions = themes.map((theme, index) => ({
    id: theme.id,
    label: theme.label,
    mode: theme.mode ?? ('dark' as const),
    path: theme.path ?? `themes/${index}-${theme.id}.json`
  }))
  const manifest = pluginManifestSchema.parse({
    manifestVersion: 1,
    id,
    publisher,
    name: `${publisher} ${id}`,
    version: options.version ?? '1.0.0',
    engines: { orca: '>=1.0.0' },
    pluginApi: 1,
    contributes: { editorThemes: contributions },
    capabilities: []
  })

  const themePaths = contributions.map((contribution) => join(rootDir, contribution.path))
  await Promise.all([
    writeFile(join(rootDir, 'orca-plugin.json'), JSON.stringify(manifest)),
    ...themePaths.map((themePath, index) =>
      writeFile(themePath, themes[index]!.raw ?? JSON.stringify(themes[index]!.data ?? darkTheme))
    )
  ])

  let contentHash: string | null = null
  if (options.installed) {
    const content = await hashPluginTree(rootDir)
    if (!content.ok) {
      throw new Error(content.error)
    }
    contentHash = content.hash
  }
  const pluginKey = `${publisher}.${id}`
  return {
    plugin: {
      pluginKey,
      rootDir,
      manifest,
      consentFingerprint:
        contentHash === null
          ? fingerprintPluginConsent(manifest)
          : fingerprintPluginConsent(manifest, contentHash),
      consentContentHash: contentHash,
      contentHash,
      isDev: contentHash === null
    },
    themePaths
  }
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('PluginEditorThemeRegistry', () => {
  it('publishes an approved theme under its qualified public identity', async () => {
    const { plugin } = await createThemePlugin({
      publisher: 'robbyfuu',
      id: 'robbydev-editor-theme'
    })
    const registry = await createRegistry()

    await registry.reconcile([plugin], () => true)

    expect(registry.list()).toEqual([
      {
        id: 'robbyfuu.robbydev-editor-theme/robbydev',
        monacoName:
          'orca-plugin-theme-726f6262796675752e726f6262796465762d656469746f722d7468656d652f726f626279646576',
        pluginKey: 'robbyfuu.robbydev-editor-theme',
        localId: 'robbydev',
        label: 'RobbyDev',
        mode: 'dark',
        data: darkTheme
      }
    ])
    expect(registry.error(plugin.pluginKey)).toBeNull()
  })

  it('publishes plain registrations accepted by the shared runtime guard', async () => {
    const { plugin } = await createThemePlugin()
    const registry = await createRegistry()
    const artifactApi = await vi.importActual<EditorThemeArtifactModule>(artifactModulePath)

    await registry.reconcile([plugin], () => true)

    const registration = registry.list()[0]!
    const roundTripped: unknown = JSON.parse(JSON.stringify(registration))
    expect(roundTripped).toEqual(registration)
    expect(artifactApi.isPluginEditorThemeRegistration(roundTripped)).toBe(true)
    expect(
      artifactApi.isPluginEditorThemeRegistration({
        ...registration,
        data: {
          ...registration.data,
          rules: [{ token: 'comment', foreground: 42 }]
        }
      })
    ).toBe(false)
  })

  it('does not read or report an unapproved plugin with invalid theme JSON', async () => {
    const { plugin } = await createThemePlugin({
      id: 'unapproved-theme',
      themes: [{ id: 'broken', label: 'Broken', raw: '{"base":' }]
    })
    const registry = await createRegistry()

    await registry.reconcile([plugin], () => false)

    expect(registry.list()).toEqual([])
    expect(registry.error(plugin.pluginKey)).toBeNull()
  })

  it('isolates an invalid owner without removing another plugin theme', async () => {
    const valid = await createThemePlugin({
      id: 'valid-theme',
      themes: [{ id: 'valid', label: 'Valid' }]
    })
    const invalid = await createThemePlugin({
      id: 'invalid-theme',
      themes: [{ id: 'broken', label: 'Broken', raw: '{"base":' }]
    })
    const registry = await createRegistry()

    await registry.reconcile([invalid.plugin, valid.plugin], () => true)

    expect(registry.list().map((theme) => theme.id)).toEqual([
      'orca-samples.valid-theme/valid'
    ])
    expect(registry.error(valid.plugin.pluginKey)).toBeNull()
    expect(registry.error(invalid.plugin.pluginKey)).toEqual(expect.stringMatching(/editor theme/i))
  })

  it('keeps the same local id distinct under two plugin keys', async () => {
    const first = await createThemePlugin({
      publisher: 'alpha',
      id: 'theme',
      themes: [{ id: 'shared', label: 'Alpha' }]
    })
    const second = await createThemePlugin({
      publisher: 'beta',
      id: 'theme',
      themes: [{ id: 'shared', label: 'Beta' }]
    })
    const registry = await createRegistry()

    await registry.reconcile([second.plugin, first.plugin], () => true)

    const registrations = registry.list()
    expect(registrations.map((theme) => theme.id)).toEqual([
      'alpha.theme/shared',
      'beta.theme/shared'
    ])
    expect(new Set(registrations.map((theme) => theme.monacoName)).size).toBe(2)
    expect(registry.error(first.plugin.pluginKey)).toBeNull()
    expect(registry.error(second.plugin.pluginKey)).toBeNull()
  })

  it('rejects every contribution from duplicate discovered owners of one qualified id', async () => {
    const first = await createThemePlugin({
      id: 'duplicate-owner',
      themes: [
        { id: 'shared', label: 'Shared from first' },
        { id: 'first-only', label: 'First only' }
      ]
    })
    const second = await createThemePlugin({
      id: 'duplicate-owner',
      themes: [
        { id: 'shared', label: 'Shared from second', data: updatedDarkTheme },
        { id: 'second-only', label: 'Second only' }
      ]
    })
    const registry = await createRegistry()

    await registry.reconcile([first.plugin, second.plugin], () => true)

    expect(registry.list()).toEqual([])
    expect(registry.error(first.plugin.pluginKey)).toEqual(expect.stringMatching(/editor theme/i))
    expect(registry.error(first.plugin.pluginKey)).toEqual(
      expect.stringMatching(/multiple|collision/i)
    )
  })

  it('excludes an installed owner when content integrity verification fails', async () => {
    const fixture = await createThemePlugin({ id: 'tampered-theme', installed: true })
    await writeFile(fixture.themePaths[0]!, JSON.stringify(updatedDarkTheme))
    const registry = await createRegistry()

    await registry.reconcile([fixture.plugin], () => true)

    expect(registry.list()).toEqual([])
    expect(registry.error(fixture.plugin.pluginKey)).toEqual(
      expect.stringMatching(/integrity verification/i)
    )
  })

  it('keeps the previous catalog and errors visible until an update snapshot is complete', async () => {
    const versionA = await createThemePlugin({
      id: 'atomic-theme',
      version: '1.0.0',
      themes: [{ id: 'shared', label: 'Shared', data: darkTheme }]
    })
    const oldInvalid = await createThemePlugin({
      id: 'old-invalid',
      themes: [{ id: 'broken', label: 'Broken', raw: '{"base":' }]
    })
    const versionB = await createThemePlugin({
      id: 'atomic-theme',
      version: '1.1.0',
      themes: [{ id: 'shared', label: 'Shared', data: updatedDarkTheme }]
    })
    const contentVerifier = new PluginContentVerifier()
    const registry = await createRegistry(contentVerifier)
    await registry.reconcile([versionA.plugin, oldInvalid.plugin], () => true)
    expect(registry.error(oldInvalid.plugin.pluginKey)).toEqual(
      expect.stringMatching(/editor theme/i)
    )

    let releaseVerification!: () => void
    const verificationGate = new Promise<void>((resolve) => {
      releaseVerification = resolve
    })
    let markVerificationStarted!: () => void
    const verificationStarted = new Promise<void>((resolve) => {
      markVerificationStarted = resolve
    })
    vi.spyOn(contentVerifier, 'verify').mockImplementation(async (plugin) => {
      if (plugin.rootDir === versionB.plugin.rootDir) {
        markVerificationStarted()
        await verificationGate
      }
    })

    const updating = registry.reconcile([versionB.plugin], () => true)
    await verificationStarted

    expect(registry.list()[0]?.data).toEqual(darkTheme)
    expect(registry.error(oldInvalid.plugin.pluginKey)).toEqual(
      expect.stringMatching(/editor theme/i)
    )

    releaseVerification()
    await updating

    expect(registry.list()).toMatchObject([
      {
        id: 'orca-samples.atomic-theme/shared',
        data: updatedDarkTheme
      }
    ])
    expect(registry.error(oldInvalid.plugin.pluginKey)).toBeNull()
  })

  it('removes and restores the same theme as approval changes', async () => {
    const { plugin } = await createThemePlugin({ id: 'approval-lifecycle' })
    const registry = await createRegistry()

    await registry.reconcile([plugin], () => true)
    expect(registry.list().map((theme) => theme.id)).toEqual([
      'orca-samples.approval-lifecycle/robbydev'
    ])

    await registry.reconcile([plugin], () => false)
    expect(registry.list()).toEqual([])
    expect(registry.error(plugin.pluginKey)).toBeNull()

    await registry.reconcile([plugin], () => true)
    expect(registry.list().map((theme) => theme.id)).toEqual([
      'orca-samples.approval-lifecycle/robbydev'
    ])
  })

  it('clears catalog and stale owner errors when discovery becomes empty', async () => {
    const invalid = await createThemePlugin({
      id: 'removed-invalid',
      themes: [{ id: 'broken', label: 'Broken', raw: '{"base":' }]
    })
    const registry = await createRegistry()
    await registry.reconcile([invalid.plugin], () => true)
    expect(registry.error(invalid.plugin.pluginKey)).toEqual(
      expect.stringMatching(/editor theme/i)
    )

    await registry.reconcile([], () => true)

    expect(registry.list()).toEqual([])
    expect(registry.error(invalid.plugin.pluginKey)).toBeNull()
  })

  it('orders registrations by label and then qualified id', async () => {
    const { plugin } = await createThemePlugin({
      id: 'ordered-theme',
      themes: [
        { id: 'zulu', label: 'Zulu' },
        { id: 'beta', label: 'Alpha' },
        { id: 'alpha', label: 'Alpha' }
      ]
    })
    const registry = await createRegistry()

    await registry.reconcile([plugin], () => true)

    expect(registry.list().map(({ label, id }) => [label, id])).toEqual([
      ['Alpha', 'orca-samples.ordered-theme/alpha'],
      ['Alpha', 'orca-samples.ordered-theme/beta'],
      ['Zulu', 'orca-samples.ordered-theme/zulu']
    ])
  })
})
