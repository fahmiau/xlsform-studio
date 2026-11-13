/**
 * Image and PDF attachments for Chat and Build (Task 6.8).
 *
 * Dialog-picked and Tauri-dropped paths cross IPC via `readAttachment`; Rust
 * reads the bytes so the WebView needs no filesystem plugin. Clipboard images
 * and HTML5-dropped files are read directly in memory with the same limits.
 */
import { open } from '@tauri-apps/plugin-dialog';

import { commands } from '@/ipc/bindings';
import { base64ToBytes } from '@/lib/base64';

import type { ModelMessage, UserContent } from './client';
import type { ProviderPreset } from './providers';

export interface ChatAttachment {
  id: string;
  name: string;
  mediaType: string;
  bytes: Uint8Array;
}

/** Per-message cap; keeps one request well inside provider payload limits. */
export const MAX_ATTACHMENTS = 4;

/** Matches `MAX_ATTACHMENT_BYTES` in `src-tauri/src/commands/files.rs`. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const ATTACHMENT_FILTER = [
  { name: 'Image or PDF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'pdf'] },
];

const EXTENSION_MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const SUPPORTED_MEDIA_TYPES = new Set([...SUPPORTED_IMAGE_TYPES, 'application/pdf']);

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const GENERIC_CLIPBOARD_NAME_RE = /^image(?:\.(?:png|jpe?g|webp|gif))?$/i;
const INDEXED_IMAGE_NAME_RE = /^image_(\d+)(?:\.[a-z0-9]+)?$/i;

function nextClipboardImageName(mediaType: string, usedNames: Set<string>): string {
  const ext = IMAGE_EXTENSIONS[mediaType] ?? 'png';
  let index = 1;
  while (true) {
    const stemUsed = Array.from(usedNames).some((name) => {
      const match = INDEXED_IMAGE_NAME_RE.exec(name);
      return match ? Number(match[1]) === index : false;
    });
    const candidate = `image_${index}.${ext}`;
    if (!stemUsed && !usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    index += 1;
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Resolve an accepted attachment media type from MIME type or filename extension. */
export function attachmentMediaType(file: Pick<File, 'name' | 'type'>): string | null {
  const rawType = file.type.trim().toLowerCase();
  const normalized = rawType === 'image/jpg' ? 'image/jpeg' : rawType;
  if (SUPPORTED_MEDIA_TYPES.has(normalized)) return normalized;
  if (normalized === '' || normalized === 'application/octet-stream') {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    return EXTENSION_MEDIA_TYPES[ext] ?? null;
  }
  return null;
}

/** Extract image `File` entries from a paste event's clipboard data. */
export function clipboardImageFiles(
  data: Pick<DataTransfer, 'items' | 'files'> | null | undefined,
): File[] {
  if (!data) return [];
  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
  const files = fromItems.length > 0 ? fromItems : Array.from(data.files ?? []);
  return files.filter(
    (file) =>
      file.type.toLowerCase().startsWith('image/') ||
      SUPPORTED_IMAGE_TYPES.has(attachmentMediaType(file) ?? ''),
  );
}

/** Read local filesystem paths through the scoped Rust command. */
export async function attachPaths(
  paths: readonly string[],
  remaining: number,
): Promise<ChatAttachment[]> {
  if (remaining <= 0 || paths.length === 0) return [];
  const picked: ChatAttachment[] = [];
  for (const path of paths.slice(0, remaining)) {
    const read = await commands.readAttachment(path);
    picked.push({
      id: crypto.randomUUID(),
      name: basename(path),
      mediaType: read.mediaType,
      bytes: base64ToBytes(read.base64),
    });
  }
  return picked;
}

/** Read dropped or pasted browser `File` objects with the same type/size rules as Rust. */
export async function attachFiles(
  files: readonly File[],
  remaining: number,
  options?: { imagesOnly?: boolean; existingNames?: readonly string[] },
): Promise<ChatAttachment[]> {
  if (remaining <= 0 || files.length === 0) return [];
  const usedNames = new Set(options?.existingNames ?? []);
  const picked: ChatAttachment[] = [];
  for (const file of files.slice(0, remaining)) {
    const mediaType = attachmentMediaType(file);
    if (!mediaType || (options?.imagesOnly && !SUPPORTED_IMAGE_TYPES.has(mediaType))) {
      throw new Error(
        options?.imagesOnly
          ? 'Expected a PNG, JPEG, WEBP, or GIF image.'
          : 'Expected a PNG, JPEG, WEBP, GIF, or PDF file.',
      );
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Attachment is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.`);
    }
    const rawName = file.name.trim();
    const needsIndexedName =
      rawName === '' || (Boolean(options?.imagesOnly) && GENERIC_CLIPBOARD_NAME_RE.test(rawName));
    const name = needsIndexedName
      ? mediaType === 'application/pdf'
        ? 'document.pdf'
        : nextClipboardImageName(mediaType, usedNames)
      : rawName;
    usedNames.add(name);
    picked.push({ id: crypto.randomUUID(), name, mediaType, bytes });
  }
  return picked;
}

/** Pick files and read them through the scoped Rust command. */
export async function pickAttachments(remaining: number): Promise<ChatAttachment[]> {
  if (remaining <= 0) return [];
  const selected = await open({
    title: 'Attach images or PDFs',
    multiple: true,
    directory: false,
    filters: ATTACHMENT_FILTER,
  });
  const paths = Array.isArray(selected) ? selected : selected ? [selected] : [];
  return attachPaths(paths, remaining);
}

/** Providers whose wire format accepts PDF document parts. */
export function supportsPdf(preset: ProviderPreset): boolean {
  return preset.protocol !== 'openai-compatible';
}

/**
 * Null when the message can go. OpenAI-compatible endpoints forward images but
 * reject PDF file parts, so the send is blocked with an actionable reason.
 */
export function attachmentUnsupportedReason(
  preset: ProviderPreset,
  attachments: readonly ChatAttachment[],
): string | null {
  if (!attachments.some((attachment) => attachment.mediaType === 'application/pdf')) return null;
  if (supportsPdf(preset)) return null;
  return `${preset.label} cannot read PDFs. Switch to OpenAI, Anthropic, or Gemini, or remove the PDF.`;
}

/** One user turn as text, or parts when attachments are present. */
export function userContent(text: string, attachments: readonly ChatAttachment[]): UserContent {
  if (attachments.length === 0) return text;
  return [
    ...(text ? [{ type: 'text' as const, text }] : []),
    ...attachments.map((attachment) => ({
      type: 'file' as const,
      data: attachment.bytes,
      mediaType: attachment.mediaType,
      filename: attachment.name,
    })),
  ];
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  attachments?: ChatAttachment[];
}

/** Session history to SDK messages. Assistant turns stay plain text. */
export function toModelMessages(turns: readonly ChatTurn[]): ModelMessage[] {
  return turns.map((turn) =>
    turn.role === 'user'
      ? { role: 'user', content: userContent(turn.content, turn.attachments ?? []) }
      : { role: 'assistant', content: turn.content },
  );
}
