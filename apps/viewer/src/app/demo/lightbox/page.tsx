import { DiffGallery } from '@/components/diff-gallery';
import type { SnapshotTriplet } from '@/components/snapshot-diff';

export const dynamic = 'force-dynamic';

function svgUri(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function dashboardSvg({
  bg,
  bar,
  cards,
  label,
  badge,
  withChip,
}: {
  bg: string;
  bar: string;
  cards: string;
  label: string;
  badge: string;
  withChip?: boolean;
}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="${bg}"/>
  <rect x="0" y="0" width="1200" height="64" fill="${bar}"/>
  <circle cx="36" cy="32" r="14" fill="${badge}"/>
  <rect x="64" y="24" width="160" height="16" rx="4" fill="rgba(255,255,255,0.85)"/>
  <rect x="1080" y="22" width="96" height="20" rx="10" fill="${badge}"/>
  <rect x="40" y="100" width="280" height="660" rx="12" fill="${cards}"/>
  <rect x="64" y="128" width="120" height="14" rx="3" fill="rgba(255,255,255,0.9)"/>
  <rect x="64" y="156" width="200" height="10" rx="3" fill="rgba(255,255,255,0.45)"/>
  <rect x="64" y="180" width="180" height="10" rx="3" fill="rgba(255,255,255,0.35)"/>
  <rect x="360" y="100" width="800" height="180" rx="12" fill="${cards}"/>
  <rect x="392" y="128" width="240" height="20" rx="4" fill="rgba(255,255,255,0.92)"/>
  <rect x="392" y="160" width="600" height="12" rx="3" fill="rgba(255,255,255,0.45)"/>
  <rect x="392" y="184" width="500" height="12" rx="3" fill="rgba(255,255,255,0.35)"/>
  <rect x="392" y="220" width="180" height="36" rx="8" fill="${badge}"/>
  <text x="482" y="244" fill="#fff" font-family="ui-sans-serif, system-ui" font-size="14" text-anchor="middle">${label}</text>
  <rect x="360" y="320" width="390" height="240" rx="12" fill="${cards}"/>
  <rect x="770" y="320" width="390" height="240" rx="12" fill="${cards}"/>
  <rect x="392" y="352" width="300" height="14" rx="3" fill="rgba(255,255,255,0.9)"/>
  <rect x="392" y="380" width="220" height="10" rx="3" fill="rgba(255,255,255,0.45)"/>
  <rect x="800" y="352" width="240" height="14" rx="3" fill="rgba(255,255,255,0.9)"/>
  <rect x="800" y="380" width="320" height="10" rx="3" fill="rgba(255,255,255,0.45)"/>
  ${
    withChip
      ? `<rect x="800" y="430" width="120" height="32" rx="16" fill="${badge}"/>
         <text x="860" y="450" fill="#fff" font-family="ui-sans-serif, system-ui" font-size="12" text-anchor="middle">new</text>`
      : ''
  }
  <rect x="360" y="600" width="800" height="160" rx="12" fill="${cards}"/>
  <rect x="392" y="628" width="180" height="12" rx="3" fill="rgba(255,255,255,0.85)"/>
  <rect x="392" y="652" width="700" height="10" rx="3" fill="rgba(255,255,255,0.4)"/>
  <rect x="392" y="672" width="640" height="10" rx="3" fill="rgba(255,255,255,0.3)"/>
  <rect x="392" y="692" width="560" height="10" rx="3" fill="rgba(255,255,255,0.25)"/>
</svg>`;
}

function diffOverlaySvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#1a0510"/>
  <rect x="1080" y="22" width="96" height="20" rx="10" fill="#ff3366" opacity="0.9"/>
  <rect x="392" y="220" width="180" height="36" rx="8" fill="#ff3366" opacity="0.9"/>
  <rect x="800" y="430" width="120" height="32" rx="16" fill="#ff3366" opacity="0.9"/>
</svg>`;
}

function plainSvg(text: string, color: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
  <rect width="800" height="600" fill="${color}"/>
  <text x="400" y="320" fill="rgba(255,255,255,0.9)" font-family="ui-sans-serif, system-ui" font-size="48" font-weight="700" text-anchor="middle">${text}</text>
</svg>`;
}

const triplets: SnapshotTriplet[] = [
  {
    snapshotName: 'home/dashboard.png',
    expected: {
      id: 'demo-1-expected',
      src: svgUri(
        dashboardSvg({
          bg: '#0a0a0c',
          bar: '#16161a',
          cards: '#1f1f24',
          label: 'Get started',
          badge: '#5b6cff',
        }),
      ),
    },
    actual: {
      id: 'demo-1-actual',
      src: svgUri(
        dashboardSvg({
          bg: '#0a0a0c',
          bar: '#16161a',
          cards: '#1f1f24',
          label: 'Open project',
          badge: '#7d8cff',
          withChip: true,
        }),
      ),
    },
    diff: {
      id: 'demo-1-diff',
      src: svgUri(diffOverlaySvg()),
    },
    diffPercent: 12.4,
    diffPixels: 119_040,
    approved: false,
  },
  {
    snapshotName: 'auth/sign-in.png',
    expected: {
      id: 'demo-2-expected',
      src: svgUri(plainSvg('Sign in', '#101218')),
    },
    actual: {
      id: 'demo-2-actual',
      src: svgUri(plainSvg('Welcome back', '#0e1422')),
    },
    diff: {
      id: 'demo-2-diff',
      src: svgUri(plainSvg('— diff —', '#3a0e16')),
    },
    diffPercent: 3.7,
    diffPixels: 35_520,
    approved: false,
  },
  {
    snapshotName: 'projects/empty-state.png',
    expected: {
      id: 'demo-3-expected',
      src: svgUri(plainSvg('No projects yet', '#0c0e12')),
    },
    actual: {
      id: 'demo-3-actual',
      src: svgUri(plainSvg('Connect a repo', '#0c0e12')),
    },
    diff: {
      id: 'demo-3-diff',
      src: svgUri(plainSvg('— diff —', '#3a0e16')),
    },
    diffPercent: 0.08,
    diffPixels: 768,
    approved: true,
  },
];

export default function LightboxDemoPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="text-xs uppercase tracking-wider text-fg-subtle">Design lab</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Lightbox demo</h1>
        <p className="mt-2 max-w-prose text-sm text-fg-muted">
          Hardcoded snapshot triplets so the diff gallery + lightbox can be reviewed
          without standing up a database. Click any image, drag the slider, scroll to
          zoom, use ← → A 1 2 3 4 Esc.
        </p>
      </header>
      <DiffGallery triplets={triplets} />
    </div>
  );
}
