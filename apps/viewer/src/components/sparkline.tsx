type Run = {
  id: string;
  status: 'passed' | 'failed' | 'flaky' | 'running' | 'cancelled';
  durationMs: number | null;
};

type Props = {
  runs: Run[];
  width?: number;
  height?: number;
};

/**
 * Tiny pass/fail sparkline. Each run is a vertical bar; height = duration,
 * color = status. Reads left→right oldest→newest, like git log -p.
 */
export function Sparkline({ runs, width = 180, height = 32 }: Props) {
  if (runs.length === 0) {
    return (
      <div
        className="rounded bg-bg-hover"
        style={{ width, height }}
        aria-label="no runs"
      />
    );
  }

  const ordered = [...runs].reverse();
  const maxDuration = Math.max(...ordered.map((r) => r.durationMs ?? 0), 1);
  const barCount = ordered.length;
  const gap = 2;
  const barWidth = Math.max(1, (width - gap * (barCount - 1)) / barCount);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Last ${barCount} runs sparkline`}
    >
      {ordered.map((r, i) => {
        const h = Math.max(2, ((r.durationMs ?? 0) / maxDuration) * height);
        const x = i * (barWidth + gap);
        const y = height - h;
        const color =
          r.status === 'passed'
            ? 'hsl(151 55% 53%)'
            : r.status === 'failed'
              ? 'hsl(0 78% 65%)'
              : r.status === 'flaky'
                ? 'hsl(38 92% 56%)'
                : r.status === 'running'
                  ? 'hsl(212 100% 67%)'
                  : 'hsl(220 10% 46%)';
        return <rect key={r.id} x={x} y={y} width={barWidth} height={h} fill={color} rx={1} />;
      })}
    </svg>
  );
}
