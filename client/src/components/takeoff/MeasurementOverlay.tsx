import type { Measurement, PdfPoint, PageCalibration } from './lib/types';
import {
  realLinearDistance,
  realPolygonArea,
  formatLinear,
  formatArea,
  pdfPolylineLength,
  pdfPolygonArea,
} from './lib/geometry';

interface InProgress {
  type: 'calibrate' | 'linear' | 'area' | 'count';
  points: PdfPoint[];
  // For calibrate / linear / area: the preview cursor position (so the rubber-band line tracks the mouse).
  cursor?: PdfPoint | null;
  color?: string;
}

interface Props {
  width: number;
  height: number;
  measurements: Measurement[];
  inProgress: InProgress | null;
  calibration: PageCalibration | null;
  pdfToCss: (pt: PdfPoint) => { x: number; y: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  // Allow click-through for SVG when overlay isn't capturing — pointer-events:none.
  interactive?: boolean;
}

export function MeasurementOverlay({
  width,
  height,
  measurements,
  inProgress,
  calibration,
  pdfToCss,
  selectedId,
  onSelect,
  interactive,
}: Props) {
  if (!width || !height) return null;

  const project = (pts: PdfPoint[]) =>
    pts.map(p => pdfToCss(p)).filter((p): p is { x: number; y: number } => p !== null);

  // Helper to render a label background + text at a given (x,y).
  const Label = ({ x, y, text, color }: { x: number; y: number; text: string; color: string }) => (
    <g transform={`translate(${x}, ${y})`}>
      <rect
        x={-2}
        y={-14}
        rx={3}
        width={text.length * 6.6 + 8}
        height={16}
        fill="rgba(255,255,255,0.92)"
        stroke={color}
        strokeWidth={1}
      />
      <text x={2} y={-2} fontSize={11} fontFamily="sans-serif" fill="#111" style={{ userSelect: 'none' }}>
        {text}
      </text>
    </g>
  );

  return (
    <svg
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      {/* Existing measurements */}
      {measurements.map(m => {
        const cssPts = project(m.points);
        if (cssPts.length === 0) return null;
        const isSelected = selectedId === m.id;
        const stroke = m.color;
        const strokeWidth = isSelected ? 3 : 2;

        if (m.type === 'linear') {
          const value = calibration ? realLinearDistance(m.points, calibration, m.unit) : null;
          const label = value != null ? formatLinear(value, m.unit) : '—';
          const mid = cssPts[Math.floor(cssPts.length / 2)];
          return (
            <g key={m.id} onClick={() => onSelect?.(m.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <polyline
                points={cssPts.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {cssPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke={stroke} strokeWidth={1.5} />
              ))}
              <Label x={mid.x + 6} y={mid.y - 6} text={label} color={stroke} />
            </g>
          );
        }

        if (m.type === 'area') {
          const value = calibration ? realPolygonArea(m.points, calibration, m.unit) : null;
          const label = value != null ? formatArea(value, m.unit) : '—';
          // Centroid for label placement (simple average for usability).
          const cx = cssPts.reduce((s, p) => s + p.x, 0) / cssPts.length;
          const cy = cssPts.reduce((s, p) => s + p.y, 0) / cssPts.length;
          return (
            <g key={m.id} onClick={() => onSelect?.(m.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              <polygon
                points={cssPts.map(p => `${p.x},${p.y}`).join(' ')}
                fill={stroke}
                fillOpacity={0.18}
                stroke={stroke}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
              />
              {cssPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3} fill="#fff" stroke={stroke} strokeWidth={1.5} />
              ))}
              <Label x={cx} y={cy} text={label} color={stroke} />
            </g>
          );
        }

        if (m.type === 'count') {
          return (
            <g key={m.id} onClick={() => onSelect?.(m.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              {cssPts.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={9} fill={stroke} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5} />
                  <text
                    x={p.x}
                    y={p.y + 3.5}
                    fontSize={10}
                    fontWeight="bold"
                    fill="#fff"
                    textAnchor="middle"
                    style={{ userSelect: 'none' }}
                  >
                    {i + 1}
                  </text>
                </g>
              ))}
              {cssPts.length > 0 && (
                <Label x={cssPts[0].x + 14} y={cssPts[0].y - 6} text={`${m.label}: ${cssPts.length}`} color={stroke} />
              )}
            </g>
          );
        }

        return null;
      })}

      {/* In-progress measurement (rubber-band preview) */}
      {inProgress && (() => {
        const cssPts = project(inProgress.points);
        const cursorCss = inProgress.cursor ? pdfToCss(inProgress.cursor) : null;
        const previewPts = cursorCss ? [...cssPts, cursorCss] : cssPts;
        const color = inProgress.color || '#ef4444';

        if (inProgress.type === 'count') {
          return (
            <g>
              {cssPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={9} fill={color} fillOpacity={0.5} stroke="#fff" strokeWidth={1.5} />
              ))}
            </g>
          );
        }

        if (cssPts.length === 0 && !cursorCss) return null;

        const stroke = color;

        if (inProgress.type === 'area') {
          // Show polygon preview as polyline + closing dashed line back to start.
          return (
            <g>
              <polyline
                points={previewPts.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              {cssPts.length >= 2 && cursorCss && (
                <line
                  x1={cursorCss.x}
                  y1={cursorCss.y}
                  x2={cssPts[0].x}
                  y2={cssPts[0].y}
                  stroke={stroke}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
              )}
              {cssPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={stroke} strokeWidth={1.5} />
              ))}
            </g>
          );
        }

        // linear / calibrate
        return (
          <g>
            <polyline
              points={previewPts.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            {cssPts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={stroke} strokeWidth={1.5} />
            ))}
          </g>
        );
      })()}
    </svg>
  );
}
