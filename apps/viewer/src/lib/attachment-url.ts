/**
 * Build the URL the browser should hit to fetch an attachment file.
 * Storage paths are relative to DATA_DIR; the file route serves from that
 * directory with auth + path-traversal checks.
 */
export function attachmentSrc(storagePath: string): string {
  const segs = storagePath.split('/').filter(Boolean).map(encodeURIComponent);
  return `/api/files/${segs.join('/')}`;
}
