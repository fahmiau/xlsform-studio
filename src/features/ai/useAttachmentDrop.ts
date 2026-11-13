/**
 * Shared drag-and-drop + clipboard image paste hook for ChatView and BuildView.
 *
 * Supports both Tauri's native `onDragDropEvent` (OS file drops when
 * `dragDropEnabled` is true) and HTML5 `DataTransfer` drops (browser / e2e).
 */
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
} from 'react';
import { toast } from 'sonner';

import { appErrorMessage } from '@/lib/errors';

import {
  MAX_ATTACHMENTS,
  attachFiles,
  attachPaths,
  clipboardImageFiles,
  type ChatAttachment,
} from './attachments';

export function isDropInside(
  element: HTMLElement | null,
  position: { x: number; y: number },
): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const dpr = window.devicePixelRatio || 1;
  const x = position.x / dpr;
  const y = position.y / dpr;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function hasFileTransfer(data: DataTransfer | null): boolean {
  if (!data) return false;
  return data.files.length > 0 || Array.from(data.types ?? []).includes('Files');
}

export interface UseAttachmentDropOptions {
  containerRef: RefObject<HTMLElement | null>;
  pendingCount: number;
  existingNames?: readonly string[];
  disabled: boolean;
  onAttach: (attachments: ChatAttachment[]) => void;
}

export function useAttachmentDrop({
  containerRef,
  pendingCount,
  existingNames = [],
  disabled,
  onAttach,
}: UseAttachmentDropOptions) {
  const [dragging, setDragging] = useState(false);
  const stateRef = useRef({ containerRef, pendingCount, disabled, onAttach });

  useEffect(() => {
    stateRef.current = { containerRef, pendingCount, disabled, onAttach };
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          const {
            containerRef: ref,
            pendingCount: count,
            disabled: isDisabled,
            onAttach: add,
          } = stateRef.current;
          const payload = event.payload;
          if (payload.type === 'leave') {
            setDragging(false);
            return;
          }
          const inside = isDropInside(ref.current, payload.position);
          if (payload.type === 'enter' || payload.type === 'over') {
            setDragging(!isDisabled && inside);
            return;
          }
          setDragging(false);
          if (isDisabled || !inside || payload.paths.length === 0) return;
          const remaining = MAX_ATTACHMENTS - count;
          if (remaining <= 0) {
            toast.warning(`Up to ${MAX_ATTACHMENTS} files can be attached.`);
            return;
          }
          void attachPaths(payload.paths, remaining)
            .then((picked) => {
              if (picked.length > 0) add(picked);
              if (payload.paths.length > remaining) {
                toast.warning(
                  `Attached ${picked.length} of ${payload.paths.length} files (limit ${MAX_ATTACHMENTS}).`,
                );
              }
            })
            .catch((caught: unknown) => {
              toast.error('Could not attach the file', { description: appErrorMessage(caught) });
            });
        }),
      )
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const addFiles = (files: readonly File[], imagesOnly: boolean) => {
    if (disabled || files.length === 0) return;
    const remaining = MAX_ATTACHMENTS - pendingCount;
    if (remaining <= 0) {
      toast.warning(`Up to ${MAX_ATTACHMENTS} files can be attached.`);
      return;
    }
    void attachFiles(files, remaining, { imagesOnly, existingNames })
      .then((picked) => {
        if (picked.length > 0) onAttach(picked);
        if (files.length > remaining) {
          toast.warning(
            `Attached ${picked.length} of ${files.length} files (limit ${MAX_ATTACHMENTS}).`,
          );
        }
      })
      .catch((caught: unknown) => {
        toast.error('Could not attach the file', { description: appErrorMessage(caught) });
      });
  };

  const onDragEnter = (event: DragEvent<HTMLElement>) => {
    if (disabled || !hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(true);
  };

  const onDragOver = (event: DragEvent<HTMLElement>) => {
    if (disabled || !hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    if (!dragging) setDragging(true);
  };

  const onDragLeave = (event: DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setDragging(false);
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    if (!hasFileTransfer(event.dataTransfer)) return;
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) addFiles(files, false);
  };

  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    const images = clipboardImageFiles(event.clipboardData);
    if (images.length === 0) return;
    if (!event.clipboardData?.getData('text/plain')) {
      event.preventDefault();
    }
    addFiles(images, true);
  };

  return {
    dragging: !disabled && dragging,
    dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop, onPaste },
  };
}
