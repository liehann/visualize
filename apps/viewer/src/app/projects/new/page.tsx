import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createProjectAction } from './actions';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  invalid_repo:
    'Repo must be in the form `owner/repo` (e.g. `liehann/visualize`).',
  invalid_slug: 'Could not derive a project slug from that repo name.',
};

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="h-3 w-3" />
          back to projects
        </Link>
      </div>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect a GitHub repo
        </h1>
        <p className="text-sm text-fg-muted">
          Visualize will create a project keyed to this repo and generate a
          per-project upload token. Your CI uploads Playwright reports here on
          every run.
        </p>
      </header>

      <form action={createProjectAction} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="githubRepo"
            className="block text-xs font-medium uppercase tracking-wider text-fg-subtle"
          >
            GitHub repository
          </label>
          <div className="flex items-center gap-2 rounded-md border border-border bg-bg-panel px-3 focus-within:border-border-strong">
            <span className="font-mono text-xs text-fg-subtle">github.com/</span>
            <input
              id="githubRepo"
              name="githubRepo"
              required
              autoFocus
              placeholder="owner/repo"
              autoComplete="off"
              spellCheck={false}
              className="h-9 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-fg-subtle"
            />
          </div>
          <p className="text-xs text-fg-subtle">
            Format: <code className="font-mono">owner/repo</code>. Used to
            label runs and to deep-link the workflow file in your repo.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="displayName"
            className="block text-xs font-medium uppercase tracking-wider text-fg-subtle"
          >
            Display name <span className="text-fg-subtle/60">(optional)</span>
          </label>
          <input
            id="displayName"
            name="displayName"
            placeholder="defaults to the repo name"
            autoComplete="off"
            className="h-9 w-full rounded-md border border-border bg-bg-panel px-3 text-sm outline-none placeholder:text-fg-subtle focus:border-border-strong"
          />
        </div>

        {errorMessage && (
          <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button asChild variant="ghost">
            <Link href="/">Cancel</Link>
          </Button>
          <Button type="submit">Create project</Button>
        </div>
      </form>
    </div>
  );
}
