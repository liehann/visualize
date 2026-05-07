'use client';

import type { AnnotationShape } from '@visualize/core/types';

type Props = {
  shapes: { id: string; shape: AnnotationShape; label?: string | null }[];
  width: number;
  height: number;
};

/**
 * SVG overlay that renders structured annotation shapes (rect/arrow/circle/text)
 * on top of a screenshot. Shapes are positioned in image-pixel coordinates,
 * the SVG is sized via viewBox so it scales with the rendered image.
 */
export function AnnotationOverlay({ shapes, width, height }: Props) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none absolute inset-0 h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id="arrowhead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>
      {shapes.map(({ id, shape, label }) => (
        <g key={id} style={{ color: shapeColor(shape) }}>
          {renderShape(shape)}
          {label && <ShapeLabel shape={shape} label={label} />}
        </g>
      ))}
    </svg>
  );
}

function shapeColor(shape: AnnotationShape): string {
  return ('color' in shape && shape.color) || '#ff5d5d';
}

function renderShape(shape: AnnotationShape): React.ReactNode {
  switch (shape.type) {
    case 'rect':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          fill="none"
          stroke="currentColor"
          strokeWidth={shape.strokeWidth ?? 3}
        />
      );
    case 'circle':
      return (
        <circle
          cx={shape.x}
          cy={shape.y}
          r={shape.radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={shape.strokeWidth ?? 3}
        />
      );
    case 'arrow':
      return (
        <line
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke="currentColor"
          strokeWidth={shape.strokeWidth ?? 3}
          markerEnd="url(#arrowhead)"
        />
      );
    case 'text':
      return (
        <text
          x={shape.x}
          y={shape.y}
          fill="currentColor"
          fontSize={shape.fontSize ?? 16}
          fontFamily="ui-monospace, monospace"
        >
          {shape.text}
        </text>
      );
  }
}

function ShapeLabel({
  shape,
  label,
}: {
  shape: AnnotationShape;
  label: string;
}) {
  const [x, y] = anchorFor(shape);
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={6}
        y={-18}
        width={label.length * 7 + 12}
        height={20}
        fill="currentColor"
        rx={3}
      />
      <text
        x={12}
        y={-4}
        fill="black"
        fontSize={12}
        fontFamily="ui-sans-serif, system-ui"
      >
        {label}
      </text>
    </g>
  );
}

function anchorFor(shape: AnnotationShape): [number, number] {
  switch (shape.type) {
    case 'rect':
      return [shape.x + shape.width, shape.y];
    case 'circle':
      return [shape.x + shape.radius, shape.y - shape.radius];
    case 'arrow':
      return [shape.x2, shape.y2];
    case 'text':
      return [shape.x, shape.y];
  }
}
