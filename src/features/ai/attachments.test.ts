import { describe, expect, it, vi } from 'vitest';

const { readAttachment } = vi.hoisted(() => ({
  readAttachment: vi.fn(),
}));
vi.mock('@/ipc/bindings', () => ({
  commands: { readAttachment },
}));

import {
  MAX_ATTACHMENT_BYTES,
  attachFiles,
  attachPaths,
  attachmentMediaType,
  attachmentUnsupportedReason,
  clipboardImageFiles,
  supportsPdf,
  toModelMessages,
  userContent,
  type ChatAttachment,
} from './attachments';
import { presetById, type ProviderPreset } from './providers';

function preset(id: string): ProviderPreset {
  const found = presetById(id);
  if (!found) throw new Error(`missing preset ${id}`);
  return found;
}

const png: ChatAttachment = {
  id: 'a1',
  name: 'scan.png',
  mediaType: 'image/png',
  bytes: new Uint8Array([1, 2, 3]),
};

const pdf: ChatAttachment = {
  id: 'a2',
  name: 'paper.pdf',
  mediaType: 'application/pdf',
  bytes: new Uint8Array([4, 5, 6]),
};

describe('attachments (Task 6.8)', () => {
  it('accepts PDFs only where the wire protocol has document parts', () => {
    expect(supportsPdf(preset('openai'))).toBe(true);
    expect(supportsPdf(preset('anthropic'))).toBe(true);
    expect(supportsPdf(preset('gemini'))).toBe(true);
    expect(supportsPdf(preset('custom'))).toBe(false);
    expect(supportsPdf(preset('deepseek'))).toBe(false);
  });

  it('blocks a PDF on an OpenAI-compatible provider but allows images', () => {
    const deepseek = preset('deepseek');
    expect(attachmentUnsupportedReason(deepseek, [png])).toBeNull();
    const reason = attachmentUnsupportedReason(deepseek, [png, pdf]);
    expect(reason).toContain('DeepSeek cannot read PDFs');
    expect(attachmentUnsupportedReason(preset('anthropic'), [pdf])).toBeNull();
  });

  it('sends text alone when nothing is attached', () => {
    expect(userContent('Hello', [])).toBe('Hello');
  });

  it('builds file parts for text plus attachments', () => {
    expect(userContent('Describe this', [png, pdf])).toEqual([
      { type: 'text', text: 'Describe this' },
      { type: 'file', data: png.bytes, mediaType: 'image/png', filename: 'scan.png' },
      { type: 'file', data: pdf.bytes, mediaType: 'application/pdf', filename: 'paper.pdf' },
    ]);
    expect(userContent('', [png])).toEqual([
      { type: 'file', data: png.bytes, mediaType: 'image/png', filename: 'scan.png' },
    ]);
  });

  it('maps session history to SDK messages', () => {
    expect(
      toModelMessages([
        { role: 'user', content: 'Hi', attachments: [png] },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Thanks' },
      ]),
    ).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          { type: 'file', data: png.bytes, mediaType: 'image/png', filename: 'scan.png' },
        ],
      },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Thanks' },
    ]);
  });

  it('resolves supported media types and rejects unsupported ones', () => {
    expect(attachmentMediaType({ name: 'a.png', type: 'image/png' })).toBe('image/png');
    expect(attachmentMediaType({ name: 'a.jpg', type: 'image/jpg' })).toBe('image/jpeg');
    expect(attachmentMediaType({ name: 'scan.PDF', type: '' })).toBe('application/pdf');
    expect(attachmentMediaType({ name: 'photo.webp', type: 'application/octet-stream' })).toBe(
      'image/webp',
    );
    expect(attachmentMediaType({ name: 'fake.png', type: 'text/plain' })).toBeNull();
    expect(attachmentMediaType({ name: 'form.xlsx', type: '' })).toBeNull();
  });

  it('reads dropped and pasted File objects with size and type checks', async () => {
    const pasted = new File([new Uint8Array([9, 8, 7])], '', { type: 'image/png' });
    const pastedSecond = new File([new Uint8Array([6, 5])], 'image.jpg', { type: 'image/jpeg' });
    const doc = new File([new Uint8Array([1, 2])], 'spec.pdf', { type: 'application/pdf' });

    const attached = await attachFiles([pasted, doc], 4);
    expect(attached).toHaveLength(2);
    expect(attached[0]).toMatchObject({
      name: 'image_1.png',
      mediaType: 'image/png',
      bytes: new Uint8Array([9, 8, 7]),
    });
    expect(attached[1]).toMatchObject({
      name: 'spec.pdf',
      mediaType: 'application/pdf',
      bytes: new Uint8Array([1, 2]),
    });

    const multiPasted = await attachFiles([pasted, pastedSecond], 4, {
      imagesOnly: true,
      existingNames: ['image_1.png'],
    });
    expect(multiPasted.map((item) => item.name)).toEqual(['image_2.png', 'image_3.jpg']);

    await expect(attachFiles([doc], 4, { imagesOnly: true })).rejects.toThrow(
      'PNG, JPEG, WEBP, or GIF',
    );

    const huge = new File([new Uint8Array(1)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(huge, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    await expect(attachFiles([huge], 4)).rejects.toThrow('larger than 5 MB');
  });

  it('extracts only image files from clipboard data', () => {
    const img = new File([new Uint8Array([1])], 'shot.png', { type: 'image/png' });
    const txt = new File(['hi'], 'note.txt', { type: 'text/plain' });
    const pdfFile = new File([new Uint8Array([2])], 'doc.pdf', { type: 'application/pdf' });

    expect(
      clipboardImageFiles({
        items: [
          { kind: 'string', getAsFile: () => null } as unknown as DataTransferItem,
          { kind: 'file', getAsFile: () => img } as unknown as DataTransferItem,
          { kind: 'file', getAsFile: () => txt } as unknown as DataTransferItem,
          { kind: 'file', getAsFile: () => pdfFile } as unknown as DataTransferItem,
        ] as unknown as DataTransferItemList,
        files: [] as unknown as FileList,
      }),
    ).toEqual([img]);

    expect(
      clipboardImageFiles({
        items: [] as unknown as DataTransferItemList,
        files: [img, txt] as unknown as FileList,
      }),
    ).toEqual([img]);
  });

  it('reads dropped paths through commands.readAttachment up to remaining', async () => {
    readAttachment.mockResolvedValue({ mediaType: 'image/png', base64: 'AQID' });
    const result = await attachPaths(['C:\\tmp\\one.png', 'C:\\tmp\\two.png'], 1);
    expect(readAttachment).toHaveBeenCalledTimes(1);
    expect(readAttachment).toHaveBeenCalledWith('C:\\tmp\\one.png');
    expect(result[0]).toMatchObject({
      name: 'one.png',
      mediaType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    });
  });
});
