import { Film, Image as ImageIcon, FileText, Activity, File } from 'lucide-react';
import type { Attachment, AttachmentKind } from '@prisma/client';
import { readDataFile } from '@visualize/core/storage';
import { formatBytes } from '@/lib/format';
import { attachmentSrc } from '@/lib/attachment-url';
import { Badge } from '@/components/ui/badge';
import { TraceViewerButton } from '@/components/trace-viewer-button';
import { ExpandableImage } from '@/components/expandable-image';

type Props = {
  attachment: Pick<
    Attachment,
    'id' | 'name' | 'kind' | 'contentType' | 'sizeBytes' | 'storagePath'
  >;
};

const MAX_INLINE_TEXT = 20_000;

export async function AttachmentViewer({ attachment }: Props) {
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

function isErrorContext(name: string): boolean {
  return /error[-_ ]?context/i.test(name);
}

async function Body({ attachment }: Props) {
  const src = attachmentSrc(attachment.storagePath);

  // `error-context` is Playwright's page snapshot at the moment of
  // failure (an accessibility tree of the page the assertion saw). It
  // arrives as text or json depending on the version; either way the
  // useful thing is to read it, not download it.
  if (attachment.kind === 'text' || isErrorContext(attachment.name)) {
    return (
      <TextBody
        storagePath={attachment.storagePath}
        src={src}
        explain={isErrorContext(attachment.name)}
      />
    );
  }

  switch (attachment.kind) {
    case 'screenshot':
      return <ExpandableImage src={src} alt={attachment.name} />;
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
    case 'other':
      return (
        <a
          href={src}
          download
          className="inline-block rounded border border-border-strong bg-bg-panel px-3 py-1 text-xs text-fg hover:bg-bg-hover"
        >
          Download
        </a>
      );
  }
}

async function TextBody({
  storagePath,
  src,
  explain,
}: {
  storagePath: string;
  src: string;
  explain: boolean;
}) {
  let content: string | null = null;
  let truncated = false;
  try {
    const buf = await readDataFile(storagePath);
    const full = buf.toString('utf8');
    truncated = full.length > MAX_INLINE_TEXT;
    content = truncated ? full.slice(0, MAX_INLINE_TEXT) : full;
  } catch {
    content = null;
  }

  return (
    <div className="space-y-2">
      {explain && (
        <p className="rounded border border-border bg-bg-hover/40 px-3 py-2 text-xs text-fg-subtle">
          Playwright&apos;s snapshot of the page at the moment this test
          failed — the accessibility tree the assertion actually saw. Read
          it to understand <em>why</em> a locator didn&apos;t match (wrong
          text, hidden element, nothing rendered).
        </p>
      )}
      {content === null ? (
        <a
          href={src}
          className="inline-block rounded border border-border-strong bg-bg-panel px-3 py-1 text-xs text-accent hover:bg-bg-hover"
        >
          view raw
        </a>
      ) : (
        <>
          <pre className="max-h-96 overflow-auto rounded border border-border-strong bg-bg-hover p-3 font-mono text-xs text-fg-muted">
            {content}
            {truncated && '\n…'}
          </pre>
          <a
            href={src}
            className="inline-block text-xs text-accent hover:underline"
          >
            {truncated ? 'truncated — view full raw' : 'view raw'}
          </a>
        </>
      )}
    </div>
  );
}
