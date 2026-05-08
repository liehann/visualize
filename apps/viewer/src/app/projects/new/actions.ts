'use server';

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import {
  deriveSlugFromGithubRepo,
  generateUploadToken,
  hashUploadToken,
  isValidGithubRepo,
} from '@visualize/core/tokens';

export type CreateProjectResult =
  | { ok: true; slug: string; token: string }
  | { ok: false; error: string };

export async function createProjectAction(formData: FormData): Promise<never> {
  const session = await auth();
  if (!session?.user) {
    redirect('/sign-in');
  }

  const githubRepo = String(formData.get('githubRepo') ?? '').trim();
  const displayNameRaw = String(formData.get('displayName') ?? '').trim();

  if (!githubRepo || !isValidGithubRepo(githubRepo)) {
    redirect('/projects/new?error=invalid_repo');
  }

  const baseSlug = deriveSlugFromGithubRepo(githubRepo);
  if (!baseSlug) {
    redirect('/projects/new?error=invalid_slug');
  }

  // If a project with the same githubRepo already exists, take the user to
  // its setup screen (without exposing a fresh token).
  const existing = await prisma.project.findFirst({
    where: { githubRepo },
    select: { slug: true },
  });
  if (existing) {
    redirect(`/projects/${existing.slug}/setup`);
  }

  // Slug uniqueness — most of the time baseSlug works, but two repos like
  // `liehann/visualize` and `Liehann/Visualize` would collide. Add a short
  // suffix on collision.
  let slug = baseSlug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const collision = await prisma.project.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!collision) break;
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const token = generateUploadToken();
  const tokenHash = hashUploadToken(token);

  await prisma.project.create({
    data: {
      slug,
      name: displayNameRaw || githubRepo,
      githubRepo,
      uploadTokenHash: tokenHash,
    },
  });

  // Token is delivered via the URL fragment so it never reaches server logs
  // or the Referer header on link clicks. The setup page reads it from
  // `location.hash` client-side.
  redirect(`/projects/${slug}/setup#token=${encodeURIComponent(token)}`);
}
