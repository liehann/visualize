import { signIn } from '@/auth';
import { Eye } from 'lucide-react';

export default function SignInPage() {
  return (
    <div className="grid min-h-screen place-items-center grid-bg">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg-panel p-6 shadow-xl">
        <div className="mb-5 flex items-center gap-2 text-lg font-semibold">
          <Eye className="h-5 w-5 text-accent" />
          visualize
        </div>
        <p className="mb-5 text-sm text-fg-muted">
          Sign in to view Playwright runs and approve visual diffs.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('authentik', { redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-accent py-2 text-sm font-medium text-accent-fg transition hover:bg-accent/90"
          >
            Sign in with Authentik
          </button>
        </form>
      </div>
    </div>
  );
}
