import { beforeEach, describe, expect, it, vi } from 'vitest';

import { __clearCommandsForTests, registerCommands } from './commands';
import { installShortcuts, isReservedAccelerator } from './shortcuts';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

beforeEach(__clearCommandsForTests);

describe('installShortcuts', () => {
  it('runs the matching command and prevents the default action', () => {
    const run = vi.fn();
    registerCommands([
      {
        id: 'file.open',
        title: 'Open',
        shortcut: { code: 'KeyO', ctrlOrMeta: true },
        run,
      },
    ]);
    const uninstall = installShortcuts();
    const event = key({ code: 'KeyO', ctrlKey: true });
    window.dispatchEvent(event);
    expect(run).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    uninstall();
  });

  it('does not run in text inputs unless the command opts in', () => {
    const run = vi.fn();
    const unregister = registerCommands([
      { id: 'file.save', title: 'Save', shortcut: { code: 'KeyS', ctrlOrMeta: true }, run },
    ]);
    const uninstall = installShortcuts();
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();

    const blocked = key({ code: 'KeyS', ctrlKey: true });
    input.dispatchEvent(blocked);
    expect(run).not.toHaveBeenCalled();
    expect(blocked.defaultPrevented).toBe(false);

    unregister();
    registerCommands([
      {
        id: 'test.allow',
        title: 'Allow in input',
        shortcut: { code: 'KeyS', ctrlOrMeta: true },
        run,
        allowInInput: true,
      },
    ]);
    input.dispatchEvent(key({ code: 'KeyS', ctrlKey: true }));
    expect(run).toHaveBeenCalledOnce();

    uninstall();
    input.remove();
  });

  it('swallows reserved WebView accelerators (Ctrl+R, F5, Ctrl+G, …)', () => {
    const uninstall = installShortcuts();
    for (const event of [
      key({ code: 'KeyR', ctrlKey: true }),
      key({ code: 'F5' }),
      key({ code: 'KeyG', ctrlKey: true }),
      key({ code: 'KeyJ', ctrlKey: true }),
      key({ code: 'KeyF', ctrlKey: true }),
      key({ code: 'KeyP', ctrlKey: true }),
    ]) {
      window.dispatchEvent(event);
      expect(event.defaultPrevented, event.code).toBe(true);
    }
    uninstall();
  });

  it('leaves ordinary typing alone', () => {
    const uninstall = installShortcuts();
    const event = key({ code: 'KeyA' });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    uninstall();
  });

  it('recognises reserved accelerators directly', () => {
    expect(isReservedAccelerator(key({ code: 'F5' }))).toBe(true);
    expect(isReservedAccelerator(key({ code: 'KeyQ' }))).toBe(false);
  });
});
