import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_PREFIX = 'vz_';

export function generateUploadToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashUploadToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyUploadToken(token: string, expectedHash: string): boolean {
  const a = Buffer.from(hashUploadToken(token), 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function deriveSlugFromGithubRepo(repo: string): string {
  return repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
export function isValidGithubRepo(repo: string): boolean {
  return REPO_PATTERN.test(repo) && repo.length <= 100;
}
