import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __clearCommandsForTests,
  findCommandForEvent,
  isEditableTarget,
  matchesShortcut,
  registerCommands,
  type AppCommand,
} from './commands';

function key(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
}

beforeEach(__clearCommandsForTests);

describe('command registry', () => {
  it('registers, matches, and unregisters commands', () => {
    const run = vi.fn();
    const unregister = registerCommands([
      {
        id: 'file.save',
        title: 'Save',
        shortcut: { code: 'KeyS', ctrlOrMeta: true },
        run,
      },
    ]);

    expect(findCommandForEvent(key({ code: 'KeyS', ctrlKey: true }))?.id).toBe('file.save');
    expect(findCommandForEvent(key({ code: 'KeyS' }))).toBeUndefined();
    void findCommandForEvent(key({ code: 'KeyS', ctrlKey: true }))?.run();
    expect(run).toHaveBeenCalledOnce();

    unregister();
    expect(findCommandForEvent(key({ code: 'KeyS', ctrlKey: true }))).toBeUndefined();
  });

  it('requires exact modifiers', () => {
    const shortcut = { code: 'KeyS', ctrlOrMeta: true } as const;
    expect(matchesShortcut(key({ code: 'KeyS', ctrlKey: true }), shortcut)).toBe(true);
    expect(matchesShortcut(key({ code: 'KeyS', metaKey: true }), shortcut)).toBe(true);
    expect(matchesShortcut(key({ code: 'KeyS', ctrlKey: true, shiftKey: true }), shortcut)).toBe(
      false,
    );
    expect(matchesShortcut(key({ code: 'KeyS', ctrlKey: true, altKey: true }), shortcut)).toBe(
      false,
    );
    expect(matchesShortcut(key({ code: 'KeyX', ctrlKey: true }), shortcut)).toBe(false);
  });

  it('skips commands whose `when` is false', () => {
    registerCommands([
      {
        id: 'disabled',
        title: 'Disabled',
        shortcut: { code: 'F2' },
        when: () => false,
        run: () => undefined,
      },
    ]);
    expect(findCommandForEvent(key({ code: 'F2' }))).toBeUndefined();
  });

  it('detects editable targets', () => {
    const input = document.createElement('input');
    const div = document.createElement('div');
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(editable)).toBe(true);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('returns commands in registration order', () => {
    const commands: AppCommand[] = [
      { id: 'a', title: 'A', shortcut: { code: 'F1' }, run: () => undefined },
      { id: 'b', title: 'B', shortcut: { code: 'F1' }, run: () => undefined },
    ];
    registerCommands(commands);
    expect(findCommandForEvent(key({ code: 'F1' }))?.id).toBe('a');
  });
});
