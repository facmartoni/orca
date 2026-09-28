import { describe, expect, it, vi } from 'vitest'
import * as runtimeLoader from './usePluginEditorThemeRuntime'

describe('plugin editor theme runtime lazy loading', () => {
  it('settles after one rejected import is retried successfully', async () => {
    const loadRuntime = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('transient chunk failure'))
      .mockResolvedValueOnce({})

    await expect(
      runtimeLoader.loadPluginEditorThemeRuntimeWithRetry(loadRuntime)
    ).resolves.toBeUndefined()
    expect(loadRuntime).toHaveBeenCalledTimes(2)
  })

  it('stops after two rejected import attempts', async () => {
    const loadRuntime = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(new Error('persistent chunk failure'))

    await expect(runtimeLoader.loadPluginEditorThemeRuntimeWithRetry(loadRuntime)).rejects.toThrow(
      'persistent chunk failure'
    )
    expect(loadRuntime).toHaveBeenCalledTimes(2)
  })
})
