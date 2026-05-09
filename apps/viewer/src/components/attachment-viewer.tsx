import { Film, Image as ImageIcon, FileText, Activity, File } from 'lucide-react';
import type { Attachment, AttachmentKind } from '@prisma/client';
import { formatBytes } from '@/lib/format';
import { attachmentSrc } from '@/lib/attachment-url';
import { Badge } from '@/components/ui/badge';
import { TraceViewerButton } from '@/components/trace-viewer-button';

type Props = {
  attachment: Pick<
    Attachment,
    'id' | 'name' | 'kind' | 'contentType' | 'sizeBytes' | 'storagePath'
  >;
};

export function AttachmentViewer({ attachment }: Props) {
  const Icon = ICONS[attachment.kind] ?? File;
  return (
    <div className="rounded-lg border border-border bg-bg-panel">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-fg-muted shrink-0" />
          <span className="truncate font-mono text-sm text-fg">
            {attachment.name}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{attachment.kind}</Badge>
          {attachment.sizeBytes != null && (
            <span className="text-xs text-fg-subtle">
              {formatBytes(attachment.sizeBytes)}
            </span>
          )}
        </div>
      </header>
      <div className="p-4">
        <Body attachment={attachment} />
      </div>
    </div>
  );
}

const ICONS: Record<AttachmentKind, React.ComponentType<{ className?: string }>> = {
  screenshot: ImageIcon,
  video: Film,
  text: FileText,
  trace: Activity,
  other: File,
};

function Body({ attachment }: Props) {
  const src = attachmentSrc(attachment.storagePath);
  switch (attachment.kind) {
    case 'screenshot':
      return (
        <div className="overflow-hidden rounded border border-border bg-black/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={attachment.name} className="block h-auto w-full" />
        </div>
      );
    case 'video':
      return (
        <video
          controls
          src={src}
          className="block h-auto w-full rounded border border-border bg-black"
        />
      );
    case 'trace':
      return (
        <div className="flex items-center justify-between gap-3 rounded border border-border-strong bg-bg-hover px-4 py-3 text-sm">
          <span className="text-fg-muted">
            Playwright trace bundle. Open in trace.playwright.dev to inspect
            actions, network, console, and screenshots — no local install
            needed.
          </span>
          <div className="flex items-center gap-2">
            <TraceViewerButton attachmentId={attachment.id} />
            <a
              href={src}
              download
              className="rounded border border-border-strong bg-bg-panel px-3 py-1 text-xs text-fg hover:bg-bg-hover"
              title="Download trace.zip for local inspection"
            >
              Download
            </a>
          </div>
        </div>
      );
    case 'text':
      return (
        <pre className="max-h-96 overflow-auto rounded border border-border-strong bg-bg-hover p-3 font-mono text-xs text-fg-muted">
          <a href={src} className="text-accent">
            view raw
          </a>
        </pre>
      );
    case 'other':
      return (
        <a
          href={src}
          download
          className="rounded border border-border-strong bg-bg-panel px-3 py-1 text-xs text-fg hover:bg-bg-hover"
        >
          Download
        </a>
      );
  }
}
