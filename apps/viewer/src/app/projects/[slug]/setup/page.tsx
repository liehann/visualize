import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { env } from '@/env';
import { SetupClient } from './setup-client';

export const dynamic = 'force-dynamic';

export default async function ProjectSetupPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const { slug } = await params;
  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      githubRepo: true,
      tokenLastUsedAt: true,
      _count: { select: { runs: true } },
    },
  });
  if (!project) notFound();

  const ingestUrl = env.INGEST_PUBLIC_URL ?? 'https://ingest.your-domain';
  const visualizeRepo = env.VISUALIZE_REPO ?? 'liehann/visualize';
  const secretsUrl = project.githubRepo
    ? `https://github.com/${project.githubRepo}/settings/secrets/actions/new`
    : null;
  const workflowFileUrl = project.githubRepo
    ? `https://github.com/${project.githubRepo}/new/main?filename=.github/workflows/visualize.yml`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
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
          Wire up CI for{' '}
          <span className="font-mono text-accent">{project.name}</span>
        </h1>
        {project.githubRepo && (
          <p className="text-sm text-fg-muted">
            <a
              href={`https://github.com/${project.githubRepo}`}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-fg hover:underline"
            >
              github.com/{project.githubRepo}
              <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        )}
      </header>

      <SetupClient
        slug={project.slug}
        githubRepo={project.githubRepo}
        ingestUrl={ingestUrl}
        visualizeRepo={visualizeRepo}
        secretsUrl={secretsUrl}
        workflowFileUrl={workflowFileUrl}
        initialRunCount={project._count.runs}
        tokenLastUsedAt={project.tokenLastUsedAt?.toISOString() ?? null}
      />
    </div>
  );
}
