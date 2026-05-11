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
  /**
   * Current viewer scale (CSS px per PDF user-space unit). Used to scale
   * label font + stroke width with zoom so measurement text stays "pinned"
   * to the page — gets bigger when you zoom in, smaller when you zoom out.
   * Defaults to 1 (no scaling) for legacy callers.
   */
  viewerScale?: number;
  /**
   * Pan offsets included so the overlay re-renders on pan-only changes (no
   * scale change). Values aren't read directly — pdfToCss handles the math.
   */
  viewerTx?: number;
  viewerTy?: number;
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
  viewerScale = 1,
  viewerTx, // not read — included to trigger re-render on pan
  viewerTy,
  interactive,
}: Props) {
  // Reference values to silence unused-var lint without affecting behaviour.
  void viewerTx; void viewerTy;
  if (!width || !height) return null;
  // Tie font + stroke to the viewer scale so labels feel pinned to the page.
  // Cap the multiplier so very-zoomed-out text stays legible and very-zoomed-in
  // text doesn't dominate the page.
  const k = Math.max(0.6, Math.min(4, viewerScale));

  const project = (pts: PdfPoint[]) =>
    pts.map(p => pdfToCss(p)).filter((p): p is { x: number; y: number } => p !== null);

  // Helper to render a label background + text at a given (x,y). All sizes
  // multiplied by k so the label feels pinned to the page at any zoom.
  const Label = ({ x, y, text, color }: { x: number; y: number; text: string; color: string }) => {
    const fontSize = 11 * k;
    const padX = 4 * k;
    const padY = 2 * k;
    const charW = 6.6 * k;
    const w = text.length * charW + padX * 2;
    const h = fontSize + padY * 2;
    return (
      <g transform={`translate(${x}, ${y})`}>
        <rect
          x={-padX}
          y={-h}
          rx={3 * k}
          width={w}
          height={h}
          fill="rgba(255,255,255,0.92)"
          stroke={color}
          strokeWidth={1 * k}
        />
        <text
          x={0}
          y={-padY}
          fontSize={fontSize}
          fontFamily="sans-serif"
          fill="#111"
          style={{ userSelect: 'none' }}
        >
          {text}
        </text>
      </g>
    );
  };

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
        const strokeWidth = (isSelected ? 3 : 2) * k;
        const dotR = 3 * k;
        const dotStroke = 1.5 * k;

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
                <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="#fff" stroke={stroke} strokeWidth={dotStroke} />
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
                <circle key={i} cx={p.x} cy={p.y} r={dotR} fill="#fff" stroke={stroke} strokeWidth={dotStroke} />
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
                  <circle cx={p.x} cy={p.y} r={9 * k} fill={stroke} fillOpacity={0.85} stroke="#fff" strokeWidth={1.5 * k} />
                  <text
                    x={p.x}
                    y={p.y + 3.5 * k}
                    fontSize={10 * k}
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
                <circle key={i} cx={p.x} cy={p.y} r={9 * k} fill={color} fillOpacity={0.5} stroke="#fff" strokeWidth={1.5 * k} />
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
                strokeWidth={2 * k}
                strokeDasharray={`${6 * k} ${4 * k}`}
              />
              {cssPts.length >= 2 && cursorCss && (
                <line
                  x1={cursorCss.x}
                  y1={cursorCss.y}
                  x2={cssPts[0].x}
                  y2={cssPts[0].y}
                  stroke={stroke}
                  strokeWidth={1 * k}
                  strokeDasharray={`${3 * k} ${3 * k}`}
                  opacity={0.6}
                />
              )}
              {cssPts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5 * k} fill="#fff" stroke={stroke} strokeWidth={1.5 * k} />
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
