import { cn } from '@/lib/utils';

/**
 * Visualize wordmark icon.
 *
 * Brand brief: tool for senior engineers triaging visual regressions
 * under deadline. Quiet quality, not playful, not corporate. The mark is
 * two overlapping rounded squares — the "expected" snapshot in indigo
 * (back) and the "actual" snapshot in pink (front), with the overlap
 * implying the diff. Subtle gradients and a soft drop shadow on the
 * front square give it physicality at 32px+ without compromising
 * silhouette readability at 16px.
 *
 * Re-uses the same SVG that ships as `app/icon.svg` (the favicon) so the
 * brand mark is consistent everywhere.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('h-4 w-4', className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="vz-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id="vz-front" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>
        <linearGradient id="vz-hb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="vz-hf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id="vz-sh" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.7" />
          <feOffset dx="0" dy="0.6" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.45" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g>
        <rect x="3" y="3" width="20" height="20" rx="4.5" fill="url(#vz-back)" />
        <rect x="3" y="3" width="20" height="20" rx="4.5" fill="url(#vz-hb)" />
      </g>
      <g filter="url(#vz-sh)">
        <rect x="9" y="9" width="20" height="20" rx="4.5" fill="url(#vz-front)" />
        <rect x="9" y="9" width="20" height="20" rx="4.5" fill="url(#vz-hf)" />
      </g>
    </svg>
  );
}
