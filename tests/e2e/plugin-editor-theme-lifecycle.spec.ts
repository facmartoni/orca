import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Locator, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import {
  activateGoldenWorktree,
  cleanupGoldenWorktree,
  createGoldenWorktree,
  GOLDEN_CHANGED_PATH,
  openGoldenSourceControl,
  seedGoldenSourceEdit
} from './helpers/golden-source-control'
import { waitForSessionReady } from './helpers/store'

const PLUGIN_KEY = 'orca-e2e.editor-theme-lifecycle'
const PLUGIN_NAME = 'Editor Theme Lifecycle'
const THEME_LOCAL_ID = 'lifecycle-dark'
const THEME_ID = `${PLUGIN_KEY}/${THEME_LOCAL_ID}`
const THEME_LABEL = 'Lifecycle Dark'
const GOLDEN_RENDERED_MARKER = 'golden daily loop'
const FIRST_THEME = {
  background: 'rgb(16, 41, 56)',
  keyword: 'rgb(18, 229, 163)'
}
const UPDATED_THEME = {
  background: 'rgb(47, 24, 62)',
  keyword: FIRST_THEME.keyword
}

function themeData(background: string): Record<string, unknown> {
  return {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'keyword', foreground: '12E5A3' }],
    colors: {
      'editor.background': background,
      'editor.foreground': '#D978FF',
      'editorLineNumber.foreground': '#6F8294'
    }
  }
}

async function createThemePlugin(): Promise<{ root: string; themePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), 'orca-editor-theme-e2e-'))
  const themesDir = path.join(root, 'themes')
  const themePath = path.join(themesDir, 'lifecycle.json')
  await mkdir(themesDir, { recursive: true })
  await Promise.all([
    writeFile(
      path.join(root, 'orca-plugin.json'),
      `${JSON.stringify(
        {
          manifestVersion: 1,
          id: 'editor-theme-lifecycle',
          publisher: 'orca-e2e',
          name: PLUGIN_NAME,
          version: '1.0.0',
          description: 'Exercises the declarative editor theme lifecycle in E2E.',
          engines: { orca: '>=1.0.0' },
          pluginApi: 1,
          contributes: {
            editorThemes: [
              {
                id: THEME_LOCAL_ID,
                label: THEME_LABEL,
                mode: 'dark',
                path: 'themes/lifecycle.json'
              }
            ]
          },
          capabilities: []
        },
        null,
        2
      )}\n`
    ),
    writeFile(themePath, `${JSON.stringify(themeData('#102938'), null, 2)}\n`)
  ])
  return { root, themePath }
}

async function replaceThemeFile(themePath: string, contents: string): Promise<void> {
  const staged = `${themePath}.next`
  await writeFile(staged, contents)
  await rename(staged, themePath)
}

async function replaceTheme(themePath: string, background: string): Promise<void> {
  await replaceThemeFile(themePath, `${JSON.stringify(themeData(background), null, 2)}\n`)
}

async function openSettings(page: Page, pane: 'plugins' | 'general'): Promise<void> {
  await page.evaluate((targetPane) => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    state.openSettingsTarget({ pane: targetPane, repoId: null })
    state.openSettingsPage()
  }, pane)
  await expect(page.locator(`[data-settings-section="${pane}"]`)).toBeVisible()
}

async function closeSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    state.closeSettingsPage()
  })
}

type RenderedTheme = { background: string; keyword: string }

async function readRenderedTheme(root: Locator): Promise<RenderedTheme | null> {
  return root.evaluate((element, marker) => {
    const background = element.matches('.monaco-editor-background')
      ? (element as HTMLElement)
      : element.querySelector<HTMLElement>('.monaco-editor-background')
    if (!background) {
      return null
    }

    const normalizeRenderedText = (value: string | null): string =>
      (value ?? '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
    const normalizedMarker = normalizeRenderedText(marker)
    const line = [...element.querySelectorAll<HTMLElement>('.view-line')].find((candidate) =>
      normalizeRenderedText(candidate.textContent).includes(normalizedMarker)
    )
    if (!line) {
      return null
    }

    const keyword = [...line.querySelectorAll<HTMLElement>('span')].find(
      (span) =>
        span.childElementCount === 0 &&
        normalizeRenderedText(span.textContent).includes('export')
    )
    if (!keyword) {
      return null
    }

    return {
      background: window.getComputedStyle(background).backgroundColor,
      keyword: window.getComputedStyle(keyword).color
    }
  }, GOLDEN_RENDERED_MARKER)
}

async function waitForRenderedTheme(root: Locator, timeout = 20_000): Promise<RenderedTheme> {
  const observed = { value: null as RenderedTheme | null }
  await expect
    .poll(async () => {
      observed.value = await readRenderedTheme(root)
      return observed.value
    }, { timeout })
    .not.toBeNull()
  if (!observed.value) {
    throw new Error('Monaco rendered theme unavailable after polling')
  }
  return observed.value
}

async function openSourceEditor(page: Page, worktreePath: string): Promise<Locator> {
  await page.evaluate(
    ({ filePath, relativePath }) => {
      const state = window.__store?.getState()
      if (!state?.activeWorktreeId) {
        throw new Error('active worktree unavailable')
      }
      state.openFile({
        filePath,
        relativePath,
        worktreeId: state.activeWorktreeId,
        language: 'typescript',
        mode: 'edit'
      })
    },
    {
      filePath: path.join(worktreePath, GOLDEN_CHANGED_PATH),
      relativePath: GOLDEN_CHANGED_PATH
    }
  )

  const markerLine = page.locator('.view-line').filter({ hasText: GOLDEN_RENDERED_MARKER })
  const editor = page.locator('.monaco-editor:visible').filter({ has: markerLine }).first()
  await expect(
    editor.locator('.view-line').filter({ hasText: GOLDEN_RENDERED_MARKER })
  ).toBeVisible({
    timeout: 20_000
  })
  return editor
}

async function approveThemePlugin(page: Page): Promise<void> {
  await openSettings(page, 'plugins')
  await page.getByRole('tab', { name: /^Installed/ }).click()
  const row = page.locator(`[data-plugin-key="${PLUGIN_KEY}"]`)
  await expect(row).toContainText('Needs review')
  await row.getByRole('button', { name: 'Review & enable' }).click()

  const consent = page.getByRole('dialog', { name: 'Review plugin', exact: true })
  await expect(consent).toBeVisible()
  await expect(consent).toContainText('validated content only')
  await consent.getByRole('button', { name: 'Enable plugin' }).click()
  await expect(consent).toBeHidden()
  await expect(row).toContainText('Enabled')
  await closeSettings(page)
}

async function selectDarkEditorTheme(page: Page): Promise<void> {
  await openSettings(page, 'general')
  const select = page.getByRole('combobox', { name: 'Editor Theme (Dark Mode)' })
  await select.click()
  const option = page.getByRole('option', { name: THEME_LABEL, exact: true })
  await expect(option).toBeVisible({ timeout: 15_000 })
  await option.click()
  await expect(select).toContainText(THEME_LABEL)
  await closeSettings(page)
}

async function expectDarkThemeUnavailable(page: Page): Promise<void> {
  await openSettings(page, 'general')
  const select = page.getByRole('combobox', { name: 'Editor Theme (Dark Mode)' })
  const unavailableLabel = `Unavailable — ${THEME_ID}`
  await expect(select).toContainText(unavailableLabel, { timeout: 15_000 })
  await select.click()
  await expect(page.getByRole('option', { name: unavailableLabel, exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await closeSettings(page)
}

async function setPluginEnabled(page: Page, enabled: boolean): Promise<void> {
  await openSettings(page, 'plugins')
  await page.getByRole('tab', { name: /^Installed/ }).click()
  const row = page.locator(`[data-plugin-key="${PLUGIN_KEY}"]`)
  await row
    .getByRole('switch', { name: `${enabled ? 'Enable' : 'Disable'} ${PLUGIN_NAME}` })
    .click()
  await expect(row).toContainText(enabled ? 'Enabled' : 'Disabled')
  await closeSettings(page)
}

async function setAppTheme(page: Page, theme: 'dark' | 'system'): Promise<void> {
  await page.evaluate(async (nextTheme) => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    await state.updateSettingsOrThrow({ theme: nextTheme })
  }, theme)
}

test('applies, falls back, restores, and refreshes a declarative editor theme', async ({
  orcaPage,
  testRepoPath,
  registerPostElectronShutdownCleanup
}) => {
  test.setTimeout(180_000)
  const plugin = await createThemePlugin()
  registerPostElectronShutdownCleanup(() => rm(plugin.root, { recursive: true, force: true }))

  const fixture = createGoldenWorktree(testRepoPath, 'plugin-editor-theme')
  registerPostElectronShutdownCleanup(async () =>
    cleanupGoldenWorktree(testRepoPath, fixture)
  )
  seedGoldenSourceEdit(fixture.worktreePath)

  await waitForSessionReady(orcaPage)
  await activateGoldenWorktree(orcaPage, testRepoPath, fixture.worktreePath)
  await orcaPage.evaluate(
    async ({ pluginRoot, pluginKey }) => {
      const state = window.__store?.getState()
      if (!state) {
        throw new Error('store unavailable')
      }
      await state.updateSettingsOrThrow({
        pluginSystemEnabled: true,
        devPluginPaths: [pluginRoot],
        theme: 'dark',
        editorThemeDark: 'vs-dark',
        editorThemeLight: 'vs',
        uiLanguage: 'en'
      })
      const discovered = await window.api.plugins.refresh()
      if (!discovered.some((entry) => entry.pluginKey === pluginKey)) {
        throw new Error('theme plugin was not discovered')
      }
    },
    { pluginRoot: plugin.root, pluginKey: PLUGIN_KEY }
  )

  const fileEditor = await openSourceEditor(orcaPage, fixture.worktreePath)
  const fallback = await waitForRenderedTheme(fileEditor)
  expect(fallback.background).not.toBe(FIRST_THEME.background)
  expect(fallback.keyword).not.toBe(FIRST_THEME.keyword)

  await approveThemePlugin(orcaPage)
  await selectDarkEditorTheme(orcaPage)
  await expect
    .poll(() => readRenderedTheme(fileEditor), { timeout: 15_000 })
    .toEqual(FIRST_THEME)

  await openGoldenSourceControl(orcaPage, testRepoPath, fixture)
  const changedFile = orcaPage
    .locator('[data-testid="source-control-entry"]')
    .filter({ hasText: path.basename(GOLDEN_CHANGED_PATH) })
  await expect(changedFile).toBeVisible({ timeout: 15_000 })
  await changedFile.click()
  const modifiedMarkerLine = orcaPage
    .locator('.view-line')
    .filter({ hasText: GOLDEN_RENDERED_MARKER })
  const modifiedDiff = orcaPage
    .locator('.monaco-diff-editor:visible .modified-in-monaco-diff-editor')
    .filter({ has: modifiedMarkerLine })
    .first()
  await expect(
    modifiedDiff.locator('.view-line').filter({ hasText: GOLDEN_RENDERED_MARKER })
  ).toBeVisible({ timeout: 20_000 })
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 15_000 })
    .toEqual(FIRST_THEME)

  await setPluginEnabled(orcaPage, false)
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 15_000 })
    .toEqual(fallback)
  await expectDarkThemeUnavailable(orcaPage)

  await setPluginEnabled(orcaPage, true)
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 15_000 })
    .toEqual(FIRST_THEME)

  await orcaPage.emulateMedia({ colorScheme: 'light' })
  await setAppTheme(orcaPage, 'system')
  await expect(orcaPage.locator('html')).toHaveClass(/light/)
  await expect
    .poll(async () => {
      const rendered = await readRenderedTheme(modifiedDiff)
      return rendered?.background ?? FIRST_THEME.background
    }, { timeout: 15_000 })
    .not.toBe(FIRST_THEME.background)
  await expect
    .poll(async () => {
      const rendered = await readRenderedTheme(modifiedDiff)
      return rendered?.keyword ?? FIRST_THEME.keyword
    }, { timeout: 15_000 })
    .not.toBe(FIRST_THEME.keyword)

  await orcaPage.emulateMedia({ colorScheme: 'dark' })
  await expect(orcaPage.locator('html')).toHaveClass(/dark/)
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 15_000 })
    .toEqual(FIRST_THEME)
  await orcaPage.emulateMedia({ colorScheme: null })
  await setAppTheme(orcaPage, 'dark')

  await replaceTheme(plugin.themePath, '#2F183E')
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 20_000 })
    .toEqual(UPDATED_THEME)

  await replaceThemeFile(plugin.themePath, '{"base":')
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 20_000 })
    .toEqual(fallback)
  await expect(
    modifiedDiff.locator('.view-line').filter({ hasText: GOLDEN_RENDERED_MARKER })
  ).toBeVisible()

  await replaceTheme(plugin.themePath, '#2F183E')
  await expect
    .poll(() => readRenderedTheme(modifiedDiff), { timeout: 20_000 })
    .toEqual(UPDATED_THEME)
})
