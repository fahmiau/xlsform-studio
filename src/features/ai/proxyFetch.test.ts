import { describe, expect, it } from 'vitest';

import {
  createProxyFetch,
  type ProxyMessage,
  type ProxyRequestPayload,
  type ProxyTransport,
} from './proxyFetch';

class FakeTransport implements ProxyTransport {
  requests: ProxyRequestPayload[] = [];
  cancelled: string[] = [];
  private emit: ((message: ProxyMessage) => void) | null = null;
  private resolveInvoke: (() => void) | null = null;
  private nextId = 0;

  invoke = (request: ProxyRequestPayload, onMessage: (message: ProxyMessage) => void) => {
    this.requests.push(request);
    this.emit = onMessage;
    return new Promise<unknown>((resolve) => {
      this.resolveInvoke = () => resolve(null);
    });
  };

  cancel = async (requestId: string) => {
    this.cancelled.push(requestId);
  };

  newRequestId = () => `req-${(this.nextId += 1)}`;

  send(message: ProxyMessage): void {
    this.emit?.(message);
  }

  finish(): void {
    this.resolveInvoke?.();
  }
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function base64(value: string): string {
  return btoa(value);
}

const BASE = 'https://api.example.test/v1';

function setup() {
  const transport = new FakeTransport();
  const fetchImpl = createProxyFetch('instance-1', BASE, transport);
  return { transport, fetchImpl };
}

async function started(transport: FakeTransport, fetchImpl: typeof fetch, url: string) {
  const responsePromise = fetchImpl(url, { method: 'GET' });
  // Let the transport receive the request.
  await tick();
  transport.send({ type: 'status', status: { code: 200, headers: [] } });
  const response = await responsePromise;
  return response;
}

describe('createProxyFetch', () => {
  it('rejects URLs outside the bound base before any IPC call', async () => {
    const { transport, fetchImpl } = setup();
    await expect(fetchImpl('https://evil.example/v1/models')).rejects.toThrow(/outside/);
    await expect(fetchImpl(`${BASE}evil/models`)).rejects.toThrow(/outside/);
    expect(transport.requests).toHaveLength(0);
  });

  it('sends the relative path, method, headers, and body', async () => {
    const { transport, fetchImpl } = setup();
    const responsePromise = fetchImpl(`${BASE}/chat/completions?beta=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-title': 'test' },
      body: '{"model":"x"}',
    });
    await tick();
    expect(transport.requests[0]).toMatchObject({
      providerId: 'instance-1',
      path: '/chat/completions?beta=1',
      method: 'POST',
      body: '{"model":"x"}',
    });
    expect(transport.requests[0]?.headers).toEqual(
      expect.arrayContaining([
        { name: 'content-type', value: 'application/json' },
        { name: 'x-title', value: 'test' },
      ]),
    );
    transport.send({ type: 'status', status: { code: 200, headers: [] } });
    transport.send({ type: 'done' });
    transport.finish();
    await responsePromise;
  });

  it('does not send a body for GET', async () => {
    const { transport, fetchImpl } = setup();
    const responsePromise = started(transport, fetchImpl, `${BASE}/models`);
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect(transport.requests[0]?.method).toBe('GET');
    expect(transport.requests[0]?.body).toBeUndefined();
    transport.send({ type: 'done' });
    transport.finish();
    await response.text();
  });

  it('streams chunks in order and builds the response', async () => {
    const { transport, fetchImpl } = setup();
    const response = await started(transport, fetchImpl, `${BASE}/models`);
    transport.send({ type: 'chunk', base64: base64('data: one\n\n') });
    transport.send({ type: 'chunk', base64: base64('data: two\n\n') });
    transport.send({ type: 'done' });
    transport.finish();
    await expect(response.text()).resolves.toBe('data: one\n\ndata: two\n\n');
  });

  it('copies status and response headers', async () => {
    const transport = new FakeTransport();
    const fetchImpl = createProxyFetch('p', BASE, transport);
    const responsePromise = fetchImpl(`${BASE}/models`);
    await tick();
    transport.send({
      type: 'status',
      status: {
        code: 429,
        headers: [{ name: 'retry-after', value: '30' }],
      },
    });
    const response = await responsePromise;
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    transport.send({ type: 'done' });
    transport.finish();
  });

  it('rejects when the provider errors before a status arrives', async () => {
    const transport = new FakeTransport();
    const fetchImpl = createProxyFetch('p', BASE, transport);
    const responsePromise = fetchImpl(`${BASE}/models`);
    await tick();
    transport.send({ type: 'error', message: 'provider unreachable' });
    await expect(responsePromise).rejects.toThrow('provider unreachable');
  });

  it('errors the body stream when the provider errors mid-stream', async () => {
    const { transport, fetchImpl } = setup();
    const response = await started(transport, fetchImpl, `${BASE}/models`);
    transport.send({ type: 'chunk', base64: base64('partial') });
    transport.send({ type: 'error', message: 'stream broke' });
    transport.finish();
    await expect(response.text()).rejects.toThrow('stream broke');
  });

  it('rejects when the IPC command throws', async () => {
    const transport: ProxyTransport = {
      invoke: async () => {
        throw { kind: 'Network', detail: 'no route' };
      },
      cancel: async () => undefined,
      newRequestId: () => 'req-x',
    };
    const fetchImpl = createProxyFetch('p', BASE, transport);
    await expect(fetchImpl(`${BASE}/models`)).rejects.toThrow('no route');
  });

  it('closes the stream gracefully when the command resolves after a status', async () => {
    const { transport, fetchImpl } = setup();
    const response = await started(transport, fetchImpl, `${BASE}/models`);
    transport.send({ type: 'chunk', base64: base64('ok') });
    transport.finish();
    await expect(response.text()).resolves.toBe('ok');
  });

  it('cancels through the transport when the signal aborts', async () => {
    const transport = new FakeTransport();
    const fetchImpl = createProxyFetch('p', BASE, transport);
    const controller = new AbortController();
    const responsePromise = fetchImpl(`${BASE}/models`, { signal: controller.signal });
    await tick();
    transport.send({ type: 'status', status: { code: 200, headers: [] } });
    const response = await responsePromise;
    controller.abort();
    expect(transport.cancelled).toEqual(['req-1']);
    await expect(response.text()).rejects.toThrow(/abort/i);
  });

  it('aborts before the status arrives', async () => {
    const transport = new FakeTransport();
    const fetchImpl = createProxyFetch('p', BASE, transport);
    const controller = new AbortController();
    const responsePromise = fetchImpl(`${BASE}/models`, { signal: controller.signal });
    await tick();
    controller.abort();
    await expect(responsePromise).rejects.toThrow(/abort/i);
    expect(transport.cancelled).toEqual(['req-1']);
  });

  it('returns an empty body for 204 responses', async () => {
    const transport = new FakeTransport();
    const fetchImpl = createProxyFetch('p', BASE, transport);
    const responsePromise = fetchImpl(`${BASE}/models`);
    await tick();
    transport.send({ type: 'status', status: { code: 204, headers: [] } });
    const response = await responsePromise;
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe('');
  });
});
