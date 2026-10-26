/**
 * `fetch`-compatible transport over the Rust `ai_proxy` channel (Task 6.3).
 *
 * The AI SDK is handed this function; every request therefore goes through the
 * IPC channel, keeps the CSP closed, and gains the Rust-side URL binding and
 * key injection. Requests outside the provider's bound base URL throw before
 * any IPC call.
 */

export interface ProxyHeader {
  name: string;
  value: string;
}

export interface ProxyStatus {
  code: number;
  headers: ProxyHeader[];
}

export interface ProxyRequestPayload {
  requestId: string;
  providerId: string;
  path: string;
  method: string;
  headers: ProxyHeader[];
  body?: string;
}

export type ProxyMessage =
  | { type: 'status'; status: ProxyStatus }
  | { type: 'chunk'; base64: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

export interface ProxyTransport {
  /** Starts a stream; `onMessage` receives events in order. */
  invoke: (
    request: ProxyRequestPayload,
    onMessage: (message: ProxyMessage) => void,
  ) => Promise<unknown>;
  cancel: (requestId: string) => Promise<unknown>;
  newRequestId: () => string;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
  }
  return 'The AI proxy request failed.';
}

/**
 * One fetch implementation per provider instance. `baseUrl` must be the same
 * normalized URL stored in the Rust binding.
 */
export function createProxyFetch(
  providerId: string,
  baseUrl: string,
  transport: ProxyTransport,
): typeof fetch {
  const base = baseUrl.replace(/\/+$/, '');

  return async function proxyFetch(input, init) {
    const request = new Request(input, init);
    const url = request.url;
    if (url !== base && !url.startsWith(`${base}/`)) {
      throw new TypeError(`AI proxy blocked a request outside ${base}`);
    }
    const path = url.slice(base.length) || '/';
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      throw new TypeError(`AI proxy does not allow ${method} requests`);
    }

    const headers: ProxyHeader[] = [];
    request.headers.forEach((value, name) => headers.push({ name, value }));

    const hasBody = method === 'POST';
    const body = hasBody ? await request.text() : undefined;

    const requestId = transport.newRequestId();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);

    const streamRef: { controller: ReadableStreamDefaultController<Uint8Array> | null } = {
      controller: null,
    };
    let settled = false;
    let statusReceived = false;
    let resolveStatus: (status: ProxyStatus) => void = () => undefined;
    let rejectStatus: (error: unknown) => void = () => undefined;
    const statusPromise = new Promise<ProxyStatus>((resolve, reject) => {
      resolveStatus = resolve;
      rejectStatus = reject;
    });

    const bodyStream = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamRef.controller = streamController;
      },
      cancel() {
        void transport.cancel(requestId);
      },
    });

    const cleanup = () => signal?.removeEventListener('abort', abort);

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectStatus(error);
      try {
        streamRef.controller?.error(error);
      } catch {
        // The consumer may already have cancelled.
      }
    };

    const onMessage = (message: ProxyMessage) => {
      if (settled) return;
      switch (message.type) {
        case 'status':
          statusReceived = true;
          resolveStatus(message.status);
          break;
        case 'chunk':
          try {
            streamRef.controller?.enqueue(decodeBase64(message.base64));
          } catch (error) {
            fail(error);
          }
          break;
        case 'done':
          settled = true;
          cleanup();
          try {
            streamRef.controller?.close();
          } catch {
            // Already cancelled.
          }
          break;
        case 'error':
          fail(new Error(message.message));
          break;
      }
    };

    const abort = () => {
      void transport.cancel(requestId);
      fail(new DOMException('The AI request was aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      abort();
    } else {
      signal?.addEventListener('abort', abort, { once: true });
    }

    void transport
      .invoke(
        {
          requestId,
          providerId,
          path,
          method,
          headers,
          ...(body !== undefined ? { body } : {}),
        },
        onMessage,
      )
      .then(() => {
        if (settled) return;
        if (!statusReceived) {
          fail(new Error('The AI proxy ended before a response arrived.'));
          return;
        }
        settled = true;
        cleanup();
        try {
          streamRef.controller?.close();
        } catch {
          // Already cancelled.
        }
      })
      .catch((error) => fail(new Error(errorMessage(error))));

    const status = await statusPromise;
    const responseHeaders = new Headers();
    for (const header of status.headers) responseHeaders.set(header.name, header.value);

    if (status.code === 204 || status.code === 205 || status.code === 304) {
      try {
        streamRef.controller?.close();
      } catch {
        // Already closed.
      }
      return new Response(null, { status: status.code, headers: responseHeaders });
    }
    return new Response(bodyStream, { status: status.code, headers: responseHeaders });
  };
}
