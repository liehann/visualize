import { cn } from '@/lib/utils';

/**
 * Visualize wordmark icon: two overlapping rounded squares standing in for
 * "expected" (back) and "actual" (front) snapshots. The overlap is the
 * diff. Reads at 16×16 in browser tabs and scales up cleanly.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-4 w-4', className)}
      aria-hidden="true"
    >
      <rect x="3" y="3" width="20" height="20" rx="4" fill="#6366f1" />
      <rect x="9" y="9" width="20" height="20" rx="4" fill="#ec4899" />
    </svg>
  );
}
