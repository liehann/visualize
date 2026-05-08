import { describe, expect, it } from 'vitest';
import {
  deriveSlugFromGithubRepo,
  generateUploadToken,
  hashUploadToken,
  isValidGithubRepo,
  verifyUploadToken,
} from './tokens.js';

describe('upload tokens', () => {
  it('roundtrips: a generated token verifies against its own hash', () => {
    const token = generateUploadToken();
    const hash = hashUploadToken(token);
    expect(verifyUploadToken(token, hash)).toBe(true);
  });

  it('rejects a different token against an existing hash', () => {
    const a = generateUploadToken();
    const b = generateUploadToken();
    expect(verifyUploadToken(b, hashUploadToken(a))).toBe(false);
  });

  it('rejects a wrong-length hash without crashing', () => {
    const t = generateUploadToken();
    expect(verifyUploadToken(t, 'too-short')).toBe(false);
    expect(verifyUploadToken(t, 'a'.repeat(63))).toBe(false);
  });

  it('produces a printable, prefixed token', () => {
    const t = generateUploadToken();
    expect(t).toMatch(/^vz_[0-9a-f]{64}$/);
  });

  it('two generated tokens are not equal', () => {
    expect(generateUploadToken()).not.toBe(generateUploadToken());
  });
});

describe('deriveSlugFromGithubRepo', () => {
  it('lowercases + dashifies', () => {
    expect(deriveSlugFromGithubRepo('LiehannL/Visualize')).toBe('liehannl-visualize');
  });

  it('collapses runs of non-alphanumerics', () => {
    expect(deriveSlugFromGithubRepo('foo___BAR/baz')).toBe('foo-bar-baz');
  });

  it('strips leading and trailing dashes', () => {
    expect(deriveSlugFromGithubRepo('___liehann/visualize___')).toBe('liehann-visualize');
  });

  it('caps length at 60 chars', () => {
    const s = deriveSlugFromGithubRepo('a'.repeat(80) + '/' + 'b'.repeat(80));
    expect(s.length).toBeLessThanOrEqual(60);
  });
});

describe('isValidGithubRepo', () => {
  it.each([
    ['liehann/visualize', true],
    ['Org-Name/repo.with.dots', true],
    ['user_name/repo_name', true],
    ['liehann/', false], // empty repo
    ['/visualize', false], // empty owner
    ['liehann', false], // missing slash
    ['liehann visualize/foo', false], // whitespace
    ['liehann/visu/alize', false], // too many segments
    ['', false],
    ['a/b ', false], // trailing whitespace
  ])('isValidGithubRepo(%j) === %s', (input, expected) => {
    expect(isValidGithubRepo(input)).toBe(expected);
  });

  it('rejects pathologically long inputs', () => {
    expect(isValidGithubRepo('a'.repeat(60) + '/' + 'b'.repeat(60))).toBe(false);
  });
});
