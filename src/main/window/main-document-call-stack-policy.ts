import { net, type Session } from 'electron'
import { fileURLToPath } from 'node:url'
import { normalize } from 'node:path'

// Why: Chromium only returns a hung frame's JS stack (collectJavaScriptCallStack)
// when the document opted in with this header; without it the result is a refusal string.
export const JS_CALL_STACK_DOCUMENT_POLICY = 'include-js-call-stacks-in-crash-reports'

function comparablePath(filePath: string): string {
  const normalized = normalize(filePath)
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isDocumentRequest(requestUrl: string, documentPath: string): boolean {
  try {
    return comparablePath(fileURLToPath(requestUrl)) === comparablePath(documentPath)
  } catch {
    return false
  }
}

/**
 * Serves the next file:// load of `documentPath` with the JS-call-stack Document-Policy.
 * file:// responses carry no headers and webRequest never sees them, so a one-shot
 * `file` handler adds it, then unhandles so later loads keep Chromium's native file path.
 */
export function armMainDocumentCallStackPolicy(session: Session, documentPath: string): void {
  const { protocol } = session
  // Already armed by an earlier load that never fetched its document, or owned by someone else.
  if (protocol.isProtocolHandled('file')) {
    return
  }
  protocol.handle('file', async (request) => {
    const response = await net.fetch(request, { bypassCustomProtocolHandlers: true })
    if (!isDocumentRequest(request.url, documentPath)) {
      return response
    }
    protocol.unhandle('file')
    const headers = new Headers(response.headers)
    headers.set('Document-Policy', JS_CALL_STACK_DOCUMENT_POLICY)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    })
  })
}
