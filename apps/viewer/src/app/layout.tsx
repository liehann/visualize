import type { Metadata } from 'next';
import { auth, signOut } from '@/auth';
import { Eye, LogOut } from 'lucide-react';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Visualize',
  description: 'Playwright report viewer + visual diff tool',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <html lang="en">
      <body className="min-h-screen">
        {session && <TopNav user={session.user} />}
        <main className="mx-auto w-full max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}

function TopNav({
  user,
}: {
  user: { name?: string | null; email?: string | null } | undefined;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center justify-between px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight"
        >
          <Eye className="h-4 w-4 text-accent" />
          visualize
        </Link>
        <div className="flex items-center gap-3 text-xs text-fg-muted">
          <span>{user?.email ?? user?.name ?? 'anonymous'}</span>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/sign-in' });
            }}
          >
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded border border-border-strong bg-bg-panel px-2 py-1 hover:bg-bg-hover"
            >
              <LogOut className="h-3 w-3" />
              sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
