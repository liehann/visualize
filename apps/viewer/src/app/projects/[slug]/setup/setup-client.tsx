'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  EyeOff,
  Eye,
  ExternalLink,
  KeyRound,
  Loader2,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  slug: string;
  githubRepo: string | null;
  ingestUrl: string;
  visualizeRepo: string;
  secretsUrl: string | null;
  workflowFileUrl: string | null;
  initialRunCount: number;
  tokenLastUsedAt: string | null;
};

export function SetupClient({
  slug,
  githubRepo,
  ingestUrl,
  visualizeRepo,
  secretsUrl,
  workflowFileUrl,
  initialRunCount,
  tokenLastUsedAt: initialTokenLastUsedAt,
}: Props) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(true);
  const [runCount, setRunCount] = useState(initialRunCount);
  const [tokenLastUsedAt, setTokenLastUsedAt] = useState<string | null>(
    initialTokenLastUsedAt,
  );
  const [latestRunId, setLatestRunId] = useState<string | null>(null);

  // Read token from URL fragment on mount, then strip it from history so a
  // copy-paste of the URL won't include the token.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    const m = /^#token=([^&]+)/.exec(hash);
    if (m && m[1]) {
      setToken(decodeURIComponent(m[1]));
      // Replace history entry without the hash.
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Poll for the first run to land. Stop polling once we've seen one.
  useEffect(() => {
    if (runCount > 0) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const res = await fetch(`/api/projects/${slug}/status`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const j = (await res.json()) as {
          runs: number;
          latestRunId: string | null;
          tokenLastUsedAt: string | null;
        };
        if (cancelled) return;
        setRunCount(j.runs);
        setLatestRunId(j.latestRunId);
        setTokenLastUsedAt(j.tokenLastUsedAt);
      } catch {
        // ignore transient errors
      }
    };
    const id = setInterval(() => {
      void tick();
    }, 5000);
    void tick();
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runCount, slug]);

  // When a run lands while the page is open, surface a CTA to it.
  const arrivedRunId = runCount > 0 ? latestRunId : null;
  useEffect(() => {
    if (arrivedRunId) router.refresh();
  }, [arrivedRunId, router]);

  const tokenSecretName = 'VISUALIZE_TOKEN';
  const workflowYaml = renderWorkflow({
    slug,
    ingestUrl,
    visualizeRepo,
    secretName: tokenSecretName,
  });

  return (
    <div className="space-y-6">
      <Step n={1} icon={KeyRound} title="Add a Repository secret on GitHub">
        <p className="mb-3 text-sm text-fg-muted">
          GitHub Actions secrets are scoped to one repo. Add this as a{' '}
          <strong>Repository secret</strong> on{' '}
          {githubRepo ? (
            <code className="font-mono">{githubRepo}</code>
          ) : (
            <span>your repo</span>
          )}{' '}
          — not an environment or organization secret.
        </p>

        {token ? (
          <div className="space-y-3">
            <div className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
              This token is shown <strong>once</strong>. Copy it now — refreshing
              this page will hide it. You can regenerate later if you lose it.
            </div>
            <Field label="Name">
              <CopyValue mono value={tokenSecretName} />
            </Field>
            <Field label="Secret">
              <CopyValue
                mono
                value={token}
                masked={!tokenVisible}
                trailing={
                  <button
                    type="button"
                    onClick={() => setTokenVisible((v) => !v)}
                    className="inline-flex items-center justify-center rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
                    aria-label={tokenVisible ? 'Hide' : 'Show'}
                  >
                    {tokenVisible ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                }
              />
            </Field>
            {secretsUrl && (
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <a href={secretsUrl} target="_blank" rel="noreferrer noopener">
                    Open the New secret page on GitHub
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <span className="text-xs text-fg-subtle">
                  Paste {tokenSecretName} as the name + the secret value above.
                </span>
              </div>
            )}
            {githubRepo && (
              <details className="rounded-md border border-dashed border-border bg-bg-panel p-3 text-xs">
                <summary className="cursor-pointer text-fg-subtle">
                  Prefer the GitHub CLI?
                </summary>
                <pre className="mt-2 overflow-x-auto rounded bg-bg p-2 font-mono leading-snug text-fg-muted">
                  {`echo '${token}' | gh secret set ${tokenSecretName} -R ${githubRepo}`}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <RegenerateBlock
            slug={slug}
            githubRepo={githubRepo}
            secretsUrl={secretsUrl}
            tokenSecretName={tokenSecretName}
            tokenLastUsedAt={tokenLastUsedAt}
          />
        )}
      </Step>

      <Step n={2} icon={Workflow} title="Add this workflow to your repo">
        <Field
          label={
            <span className="flex items-center justify-between gap-2">
              <span>.github/workflows/visualize.yml</span>
              {workflowFileUrl && (
                <a
                  href={workflowFileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  Create on GitHub
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </span>
          }
        >
          <CopyBlock value={workflowYaml} />
        </Field>
      </Step>

      <Step
        n={3}
        icon={runCount > 0 ? CheckCircle2 : Loader2}
        spinIcon={runCount === 0}
        title={
          runCount > 0
            ? 'First run received — you’re all set'
            : 'Waiting for first upload…'
        }
        accent={runCount > 0 ? 'success' : 'default'}
      >
        {runCount > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-fg-muted">
              {runCount === 1
                ? '1 run received.'
                : `${runCount} runs received.`}{' '}
              Push a commit and your CI will keep streaming reports here.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild>
                <a href={`/?focus=${slug}`}>
                  View project
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              </Button>
              {latestRunId && (
                <Button asChild variant="secondary">
                  <a href={`/runs/${latestRunId}`}>Open latest run</a>
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-fg-muted">
            <p>
              Trigger a CI run on{' '}
              <code className="font-mono">{githubRepo ?? slug}</code> — this
              page will flip to ready as soon as a report lands.
            </p>
            {tokenLastUsedAt && (
              <p className="text-xs text-fg-subtle">
                Token last used: {new Date(tokenLastUsedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </Step>

      <details className="rounded-md border border-dashed border-border bg-bg-panel p-4">
        <summary className="cursor-pointer text-xs text-fg-subtle">
          Prefer raw curl? (advanced)
        </summary>
        <pre className="mt-3 overflow-x-auto rounded border border-border-strong bg-bg-hover p-3 font-mono text-[11px] leading-snug text-fg-muted">
{`curl -X POST ${ingestUrl}/runs \\
  -H "Authorization: Bearer $VISUALIZE_TOKEN" \\
  -F 'meta={"projectSlug":"${slug}","branch":"main","commitSha":"'"$GITHUB_SHA"'"}' \\
  -F 'bundle=@playwright-report.zip'`}
        </pre>
      </details>
    </div>
  );
}

function RegenerateBlock({
  slug,
  githubRepo,
  secretsUrl,
  tokenSecretName,
  tokenLastUsedAt,
}: {
  slug: string;
  githubRepo: string | null;
  secretsUrl: string | null;
  tokenSecretName: string;
  tokenLastUsedAt: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate(): Promise<void> {
    if (
      !window.confirm(
        'Regenerate the upload token? The current one will stop working immediately, and you’ll need to update the GitHub secret.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${slug}/regenerate-token`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError(`Server returned ${res.status}.`);
        return;
      }
      const j = (await res.json()) as { token: string };
      // Reload with the new token in the URL fragment so the existing
      // first-time UI handles display.
      window.location.replace(
        `/projects/${slug}/setup#token=${encodeURIComponent(j.token)}`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        A token has already been issued for this project. We don’t store the
        plaintext (only a hash), so we can’t show it again. If you still have
        it saved as <code className="font-mono">{tokenSecretName}</code> in{' '}
        {githubRepo ? (
          <a
            href={
              secretsUrl
                ? `https://github.com/${githubRepo}/settings/secrets/actions`
                : '#'
            }
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-0.5 text-accent hover:underline"
          >
            {githubRepo}/settings/secrets/actions
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span>your repo’s secrets</span>
        )}
        , you’re all set. Otherwise, regenerate below.
      </p>
      {tokenLastUsedAt ? (
        <p className="text-xs text-success">
          ✓ Token last used {new Date(tokenLastUsedAt).toLocaleString()} — CI
          is connected.
        </p>
      ) : (
        <p className="text-xs text-fg-subtle">
          The token has not been used yet — your CI hasn’t uploaded a report
          with it.
        </p>
      )}
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={regenerate}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <KeyRound className="h-3.5 w-3.5" />
        )}
        Regenerate token
      </Button>
    </div>
  );
}

function renderWorkflow({
  slug,
  ingestUrl,
  visualizeRepo,
  secretName,
}: {
  slug: string;
  ingestUrl: string;
  visualizeRepo: string;
  secretName: string;
}): string {
  return `name: e2e
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npx playwright test
      - if: always()
        uses: ${visualizeRepo}@main
        with:
          url: ${ingestUrl}
          secret: \${{ secrets.${secretName} }}
          project: ${slug}
`;
}

function Step({
  n,
  icon: Icon,
  title,
  children,
  spinIcon,
  accent,
}: {
  n: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
  spinIcon?: boolean;
  accent?: 'default' | 'success';
}) {
  const ring =
    accent === 'success'
      ? 'border-success/40 bg-success/5'
      : 'border-border bg-bg-panel';
  return (
    <section className={`rounded-xl border ${ring} p-5`}>
      <header className="mb-3 flex items-center gap-2.5">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border-strong bg-bg text-[11px] font-mono text-fg-muted">
          {n}
        </span>
        <Icon
          className={`h-4 w-4 ${accent === 'success' ? 'text-success' : 'text-accent'} ${
            spinIcon ? 'animate-spin' : ''
          }`}
        />
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      <div className="pl-9">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        {label}
      </div>
      {children}
    </div>
  );
}

function CopyValue({
  value,
  mono,
  masked,
  trailing,
}: {
  value: string;
  mono?: boolean;
  masked?: boolean;
  trailing?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const display = masked ? '•'.repeat(Math.min(48, value.length)) : value;
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-bg px-3 py-1.5">
      <code
        className={`min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap text-sm ${mono ? 'font-mono' : ''}`}
      >
        {display}
      </code>
      {trailing}
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="inline-flex items-center justify-center rounded p-1 text-fg-subtle hover:bg-bg-hover hover:text-fg"
        aria-label="Copy"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

function CopyBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="relative">
      <pre
        ref={ref}
        className="overflow-x-auto rounded-md border border-border bg-bg p-3 font-mono text-[11px] leading-snug"
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border-strong bg-bg-panel px-2 py-1 text-xs text-fg-muted hover:bg-bg-hover hover:text-fg"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-success" /> copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> copy
          </>
        )}
      </button>
    </div>
  );
}
