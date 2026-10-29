import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __clearCommandsForTests,
  findCommandForEvent,
  isEditableTarget,
  matchesShortcut,
  registerCommands,
  shortcutLabel,
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

describe('shortcutLabel', () => {
  it('prints digits and the zoom keys', () => {
    expect(shortcutLabel({ code: 'Digit0', ctrlOrMeta: true })).toBe('Ctrl+0');
    expect(shortcutLabel({ code: 'Digit1' })).toBe('1');
    expect(shortcutLabel({ code: 'Equal', ctrlOrMeta: true })).toBe('Ctrl+=');
    expect(shortcutLabel({ code: 'Minus', ctrlOrMeta: true })).toBe('Ctrl+-');
  });

  it('keeps the existing letter, bracket, and bare-code behavior', () => {
    expect(shortcutLabel({ code: 'KeyS', ctrlOrMeta: true, shift: true })).toBe('Ctrl+Shift+S');
    expect(shortcutLabel({ code: 'BracketLeft', ctrlOrMeta: true })).toBe('Ctrl+[');
    expect(shortcutLabel({ code: 'BracketRight', ctrlOrMeta: true })).toBe('Ctrl+]');
    expect(shortcutLabel({ code: 'F8', shift: true })).toBe('Shift+F8');
    expect(shortcutLabel(undefined)).toBe('');
  });
});
