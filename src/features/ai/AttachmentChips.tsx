/** Attachment chips shared by the input rows and the transcripts (Task 6.8). */
import { FileText, Image, X } from 'lucide-react';

import type { ChatAttachment } from './attachments';

export function AttachmentChips({
  attachments,
  onRemove,
}: {
  attachments: readonly ChatAttachment[];
  onRemove?: (id: string) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {attachments.map((attachment) => {
        const isPdf = attachment.mediaType === 'application/pdf';
        return (
          <span
            key={attachment.id}
            className="bg-muted flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px]"
            title={attachment.name}
            data-testid="ai-attachment-chip"
          >
            {isPdf ? (
              <FileText className="size-3 shrink-0" />
            ) : (
              <Image className="size-3 shrink-0" />
            )}
            <span className="truncate">{attachment.name}</span>
            <span className="text-muted-foreground shrink-0">{isPdf ? 'PDF' : 'image'}</span>
            {onRemove ? (
              <button
                type="button"
                className="shrink-0 rounded hover:bg-accent"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => onRemove(attachment.id)}
              >
                <X className="size-3" />
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
