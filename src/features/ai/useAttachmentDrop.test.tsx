import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PhysicalPosition } from '@tauri-apps/api/dpi';
import type { DragDropEvent } from '@tauri-apps/api/webview';

const { readAttachment, onDragDropEvent, toastError, toastWarning } = vi.hoisted(() => ({
  readAttachment: vi.fn(async () => ({ mediaType: 'image/png', base64: 'AQID' })),
  onDragDropEvent: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
}));

vi.mock('@/ipc/bindings', () => ({
  commands: { readAttachment },
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: toastError, warning: toastWarning, info: vi.fn() },
}));

import { useStagingStore } from '@/state/stagingStore';

import { BuildView } from './BuildView';
import { ChatView } from './ChatView';
import { presetById } from './providers';
import { isDropInside } from './useAttachmentDrop';
import type { AiConfig } from './useAiConfig';

function makeConfig(): AiConfig {
  const preset = presetById('openai')!;
  return {
    preset,
    provider: {
      instanceId: 'p1',
      presetId: 'openai',
      label: 'OpenAI',
      modelId: 'gpt-4o',
    },
    baseUrl: preset.baseUrl,
    fetchImpl: globalThis.fetch,
  };
}

describe('AI drag-and-drop and clipboard paste', () => {
  beforeEach(() => {
    readAttachment.mockClear();
    onDragDropEvent.mockReset();
    toastError.mockClear();
    toastWarning.mockClear();
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    useStagingStore.setState({
      base: null,
      draft: null,
      diff: null,
      lint: null,
      running: false,
    });
  });

  it('hit-tests physical Tauri drop coordinates against logical element bounds', () => {
    const el = document.createElement('div');
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 300,
      top: 50,
      bottom: 250,
      width: 200,
      height: 200,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    expect(isDropInside(el, { x: 300, y: 200 })).toBe(true); // 150, 100 logical
    expect(isDropInside(el, { x: 100, y: 200 })).toBe(false); // 50, 100 logical
    expect(isDropInside(null, { x: 300, y: 200 })).toBe(false);
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  it('attaches dropped files and pasted clipboard images in ChatView', async () => {
    render(<ChatView config={makeConfig()} />);
    const view = screen.getByTestId('ai-chat-view');
    const dropped = new File([new Uint8Array([1, 2])], 'diagram.pdf', { type: 'application/pdf' });

    fireEvent.dragEnter(view, { dataTransfer: { types: ['Files'], files: [dropped] } });
    expect(screen.getByTestId('ai-drop-overlay')).toBeInTheDocument();

    fireEvent.drop(view, { dataTransfer: { types: ['Files'], files: [dropped] } });
    expect(screen.queryByTestId('ai-drop-overlay')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId('ai-attachment-chip')).toHaveLength(1));
    expect(screen.getByTestId('ai-attachment-chip')).toHaveTextContent('diagram.pdf');

    const input = screen.getByTestId('ai-chat-input');
    const pasted1 = new File([new Uint8Array([3, 4])], '', { type: 'image/png' });
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', getAsFile: () => pasted1 }],
        files: [pasted1],
        getData: () => '',
      },
    });
    await waitFor(() => expect(screen.getAllByTestId('ai-attachment-chip')).toHaveLength(2));
    expect(screen.getAllByTestId('ai-attachment-chip')[1]).toHaveTextContent('image_1.png');

    const pasted2 = new File([new Uint8Array([5, 6])], 'image.png', { type: 'image/png' });
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', getAsFile: () => pasted2 }],
        files: [pasted2],
        getData: () => '',
      },
    });
    await waitFor(() => expect(screen.getAllByTestId('ai-attachment-chip')).toHaveLength(3));
    expect(screen.getAllByTestId('ai-attachment-chip')[2]).toHaveTextContent('image_2.png');
  });

  it('ignores non-image plain text paste in ChatView', () => {
    render(<ChatView config={makeConfig()} />);
    const input = screen.getByTestId('ai-chat-input');
    fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'string', getAsFile: () => null }],
        files: [],
        getData: () => 'hello',
      },
    });
    expect(screen.queryByTestId('ai-attachment-chip')).not.toBeInTheDocument();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('attaches Tauri native dropped paths in BuildView only inside bounds', async () => {
    let listener: ((event: { payload: DragDropEvent }) => void) | undefined;
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    onDragDropEvent.mockImplementation(async (cb: (event: { payload: DragDropEvent }) => void) => {
      listener = cb;
      return () => {};
    });

    render(<BuildView config={makeConfig()} />);
    const view = screen.getByTestId('ai-build-view');
    vi.spyOn(view, 'getBoundingClientRect').mockReturnValue({
      left: 500,
      right: 800,
      top: 0,
      bottom: 600,
      width: 300,
      height: 600,
      x: 500,
      y: 0,
      toJSON: () => ({}),
    });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });

    await waitFor(() => expect(listener).toBeDefined());

    await act(async () => {
      listener!({
        payload: {
          type: 'enter',
          paths: ['C:\\scan.png'],
          position: new PhysicalPosition(600, 100),
        },
      });
    });
    expect(screen.getByTestId('ai-drop-overlay')).toBeInTheDocument();

    await act(async () => {
      listener!({
        payload: {
          type: 'drop',
          paths: ['C:\\outside.png'],
          position: new PhysicalPosition(100, 100),
        },
      });
    });
    expect(readAttachment).not.toHaveBeenCalled();

    await act(async () => {
      listener!({
        payload: {
          type: 'drop',
          paths: ['C:\\scan.png'],
          position: new PhysicalPosition(600, 100),
        },
      });
    });
    await waitFor(() => expect(screen.getAllByTestId('ai-attachment-chip')).toHaveLength(1));
    expect(readAttachment).toHaveBeenCalledWith('C:\\scan.png');
    expect(screen.getByTestId('ai-attachment-chip')).toHaveTextContent('scan.png');
  });
});
