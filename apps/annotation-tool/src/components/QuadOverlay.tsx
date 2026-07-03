// Draggable/resizable 4-corner quad over the video. Uses the copied
// homography.ts to map the unit square (fretboard-normalized space, see
// fretboard.ts) onto the quad's four video-pixel corners — same math the
// perception leg uses to project the fret grid back into image space, so an
// annotator sees exactly the grid the model would compute. A click inside
// the quad is inverse-mapped back to fretboard space and resolved to a
// (string, fret) cell via fretboard.ts's nearestString/fretForX.
import { useMemo, useRef } from "react";
import { applyHomography, invertHomography, solveHomography, type Point } from "../shared/homography";
import { MAX_FRET, fretForX, fretLineX, nearestString, onBoard, stringY } from "../shared/fretboard";
import type { QuadCorners } from "../schemas/taxonomy";

export interface QuadOverlayProps {
  videoWidth: number;
  videoHeight: number;
  quad: QuadCorners;
  onQuadChange(quad: QuadCorners): void;
  onCellClick(cell: { px: number; py: number; string: number; fret: number }): void;
}

const UNIT_SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

export function defaultQuad(width: number, height: number): QuadCorners {
  const mx = width * 0.15;
  const my = height * 0.15;
  return [
    [mx, my],
    [width - mx, my],
    [width - mx, height - my],
    [mx, height - my],
  ];
}

/** Pure (DOM-free) core of click resolution: a video-pixel point inside a
 *  quad -> the (string, fret) cell it falls in, or null if outside the quad. */
export function resolveCell(
  quad: QuadCorners,
  point: Point,
): { string: number; fret: number } | null {
  const dst: Point[] = quad.map(([x, y]) => ({ x, y }));
  const H = solveHomography(UNIT_SQUARE, dst);
  const Hinv = invertHomography(H);
  const fb = applyHomography(Hinv, point);
  if (!onBoard(fb.x, fb.y)) return null;
  const { string } = nearestString(fb.y);
  const { fret } = fretForX(fb.x);
  return { string, fret };
}

export function QuadOverlay({ videoWidth, videoHeight, quad, onQuadChange, onCellClick }: QuadOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragIndex = useRef<number | null>(null);

  // unit square -> quad, for drawing the grid; resolveCell() solves its own
  // (inverse) copy for click resolution so it stays DOM-free and testable.
  const H = useMemo(() => solveHomography(UNIT_SQUARE, quad.map(([x, y]) => ({ x, y }))), [quad]);

  const toSvgPoint = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  };

  const handlePointerDown = (i: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    dragIndex.current = i;
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndex.current === null) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    const next = quad.map((c) => [...c] as [number, number]) as QuadCorners;
    next[dragIndex.current] = [
      Math.max(0, Math.min(videoWidth, p.x)),
      Math.max(0, Math.min(videoHeight, p.y)),
    ];
    onQuadChange(next);
  };

  const handlePointerUp = () => {
    dragIndex.current = null;
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragIndex.current !== null) return;
    const p = toSvgPoint(e.clientX, e.clientY);
    const cell = resolveCell(quad, p);
    if (!cell) return;
    onCellClick({ px: p.x, py: p.y, ...cell });
  };

  // Grid lines in fretboard space, projected through H into video pixels.
  const fretLines = Array.from({ length: MAX_FRET + 1 }, (_, n) => n);
  const stringLines = [1, 2, 3, 4, 5, 6];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${videoWidth} ${videoHeight}`}
      className="quad-overlay"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
    >
      {fretLines.map((n) => {
        const a = applyHomography(H, { x: fretLineX(n), y: 0 });
        const b = applyHomography(H, { x: fretLineX(n), y: 1 });
        return <line key={`fret-${n}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="grid-line" />;
      })}
      {stringLines.map((s) => {
        const a = applyHomography(H, { x: 0, y: stringY(s) });
        const b = applyHomography(H, { x: 1, y: stringY(s) });
        return <line key={`string-${s}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="grid-line" />;
      })}
      {quad.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={Math.max(6, videoWidth * 0.008)}
          className="quad-handle"
          onPointerDown={handlePointerDown(i)}
        />
      ))}
    </svg>
  );
}
