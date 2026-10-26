/**
 * The only module that talks to the generated AI IPC bindings (AD-7).
 *
 * Keeping this thin means a bindings change touches one adapter, and the rest
 * of the AI layer depends on plain structural types (`proxyFetch.ts`).
 */
import { Channel } from '@tauri-apps/api/core';

import { commands, type ProxyEvent } from '@/ipc/bindings';

import type { ProxyMessage, ProxyRequestPayload, ProxyTransport } from './proxyFetch';
import type { AuthStyle } from './providers';

export function toProxyMessage(event: ProxyEvent): ProxyMessage {
  switch (event.type) {
    case 'status':
      return {
        type: 'status',
        status: {
          code: event.payload.code,
          headers: event.payload.headers ?? [],
        },
      };
    case 'chunk':
      return { type: 'chunk', base64: event.payload };
    case 'done':
      return { type: 'done' };
    case 'error':
      return { type: 'error', message: event.payload };
  }
}

function toRequest(request: ProxyRequestPayload) {
  return {
    requestId: request.requestId,
    providerId: request.providerId,
    path: request.path,
    method: request.method,
    headers: request.headers,
    body: request.body ?? null,
  };
}

export const tauriProxyTransport: ProxyTransport = {
  invoke: async (request, onMessage) => {
    const channel = new Channel<ProxyEvent>();
    channel.onmessage = (event) => onMessage(toProxyMessage(event));
    await commands.aiProxy(toRequest(request), channel);
  },
  cancel: async (requestId) => {
    await commands.aiProxyCancel(requestId);
  },
  newRequestId: () => crypto.randomUUID(),
};

export interface SecretBinding {
  baseUrl: string;
  auth: AuthStyle;
  apiKey?: string;
}

/** Store a provider binding + key. The key never comes back out. */
export async function setProviderSecret(instanceId: string, binding: SecretBinding) {
  return commands.secretSet(instanceId, {
    baseUrl: binding.baseUrl,
    auth: binding.auth,
    apiKey: binding.apiKey ?? null,
  });
}

export async function providerSecretStatus(instanceId: string) {
  return commands.secretStatus(instanceId);
}

export async function deleteProviderSecret(instanceId: string) {
  return commands.secretDelete(instanceId);
}
