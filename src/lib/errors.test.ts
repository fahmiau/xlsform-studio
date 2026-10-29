import { describe, expect, it } from 'vitest';

import { appErrorMessage } from './errors';

describe('appErrorMessage', () => {
  it('maps FileLocked to actionable copy', () => {
    const message = appErrorMessage({ kind: 'FileLocked', detail: 'C:/a.xlsx' });
    expect(message).toContain('open in another program');
    expect(message).toContain('Save As');
  });

  it('maps the remaining AppError variants', () => {
    expect(appErrorMessage({ kind: 'NotFound', detail: 'C:/a.xlsx' })).toContain(
      'File not found: C:/a.xlsx',
    );
    expect(appErrorMessage({ kind: 'InvalidPath', detail: 'expected .xlsx' })).toBe(
      'expected .xlsx',
    );
    expect(appErrorMessage({ kind: 'Keyring', detail: 'no service' })).toContain(
      'credential store',
    );
    expect(appErrorMessage({ kind: 'Network', detail: 'timeout' })).toContain('Network error');
    expect(appErrorMessage({ kind: 'Provider', detail: '401' })).toContain('provider');
    expect(appErrorMessage({ kind: 'Window', detail: 'zoom out of range: 3' })).toBe(
      'Could not change the window: zoom out of range: 3',
    );
    expect(appErrorMessage({ kind: 'Io', detail: 'disk full' })).toContain('disk full');
  });

  it('falls back to Error messages and strings', () => {
    expect(appErrorMessage(new Error('boom'))).toBe('boom');
    expect(appErrorMessage('plain')).toBe('plain');
  });
});
