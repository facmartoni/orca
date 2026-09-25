import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { netFetch } = vi.hoisted(() => ({ netFetch: vi.fn() }))
vi.mock('electron', () => ({ net: { fetch: netFetch } }))

import type { Session } from 'electron'
import {
  armMainDocumentCallStackPolicy,
  JS_CALL_STACK_DOCUMENT_POLICY
} from './main-document-call-stack-policy'

type Handler = (request: Request) => Promise<Response>

function fakeSession(alreadyHandled = false) {
  let handler: Handler | null = null
  const protocol = {
    isProtocolHandled: vi.fn(() => alreadyHandled || handler !== null),
    handle: vi.fn((_scheme: string, next: Handler) => {
      handler = next
    }),
    unhandle: vi.fn(() => {
      handler = null
    })
  }
  return {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the policy only uses session.protocol's three members stubbed here.
    session: { protocol } as unknown as Session,
    protocol,
    serve: (url: string) => {
      if (!handler) {
        throw new Error('file scheme is not handled')
      }
      return handler(new Request(url))
    }
  }
}

const documentPath = join(process.cwd(), 'out', 'renderer', 'index.html')
const documentUrl = pathToFileURL(documentPath).href

describe('armMainDocumentCallStackPolicy', () => {
  beforeEach(() => {
    netFetch.mockReset()
    netFetch.mockImplementation(
      async () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } })
    )
  })

  it('opts the main document into JS call stacks, then hands file:// back to Chromium', async () => {
    const { session, protocol, serve } = fakeSession()
    armMainDocumentCallStackPolicy(session, documentPath)

    const response = await serve(documentUrl)

    expect(response.headers.get('Document-Policy')).toBe(JS_CALL_STACK_DOCUMENT_POLICY)
    expect(response.headers.get('content-type')).toBe('text/html')
    expect(await response.text()).toBe('<html></html>')
    expect(protocol.unhandle).toHaveBeenCalledWith('file')
    expect(netFetch).toHaveBeenCalledWith(expect.any(Request), {
      bypassCustomProtocolHandlers: true
    })
  })

  it('passes other file:// requests through untouched while armed', async () => {
    const { session, protocol, serve } = fakeSession()
    armMainDocumentCallStackPolicy(session, documentPath)

    const other = pathToFileURL(join(process.cwd(), 'out', 'renderer', 'assets', 'a.js')).href
    const response = await serve(other)

    expect(response.headers.get('Document-Policy')).toBeNull()
    expect(protocol.unhandle).not.toHaveBeenCalled()
  })

  it('never replaces a file handler it did not install', () => {
    const { session, protocol } = fakeSession(true)
    armMainDocumentCallStackPolicy(session, documentPath)
    expect(protocol.handle).not.toHaveBeenCalled()
  })
})
