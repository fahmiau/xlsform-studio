import { describe, expect, it } from 'vitest';

import { base64ToBytes, bytesToBase64 } from './base64';

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    expect(bytesToBase64(bytes)).toBe('AAECf4D+/w==');
    expect([...base64ToBytes(bytesToBase64(bytes))]).toEqual([...bytes]);
  });

  it('handles empty input', () => {
    expect(bytesToBase64(new Uint8Array())).toBe('');
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('handles payloads larger than one chunk', () => {
    const bytes = new Uint8Array(100_000).map((_, index) => index % 256);
    const encoded = bytesToBase64(bytes);
    expect(base64ToBytes(encoded)).toEqual(bytes);
  });
});
