// Schematic fretboard strip (the v2-prototype "fretboard zoom" panel, camera-
// free). Pure presentational: parent passes target/heard; no store reads.
// Layout: string 1 (high e) on TOP (prototype convention); x from the shared
// equal-tempered fretX(); finger dots use the lessons' 70%-behind-the-fret
// convention.
import { fretX, STRIP_W, STRIP_H } from "../perception/vision/fretboard";
import type { ExploreTarget } from "./exploreStore";
import type { HeardState } from "./feedback";

export interface FretboardStripProps {
  target: ExploreTarget;
  window?: [number, number];
  heard?: HeardState;
}

const W = STRIP_W;
const H = STRIP_H; // tunable via STRIP_H (fretboard.ts) — the single source
const PAD_X = 34;
const PAD_Y = Math.round(H * 0.14); // proportional vertical padding
const BEHIND = 0.7; // keep in sync with overlay/targetDots.ts

// Dot radii scale with the string spacing, so multi-finger voicings on adjacent
// strings never overlap no matter what STRIP_H is set to (the overlap bug was a
// fixed radius that exceeded the spacing once the strip was made short).
const SPACING = (H - 2 * PAD_Y) / 5;
const R_FINGER = SPACING * 0.42;
const R_OPEN = SPACING * 0.34;
const R_SCALE = SPACING * 0.4;
const R_BARRE = SPACING * 0.34;

export function FretboardStrip({ target, window: win, heard }: FretboardStripProps) {
  const [a, b] =
    win ?? (target?.kind === "chord" ? target.voicings[target.active]?.window ?? [0, 5] : [0, 12]);
  const x = (fret: number) => PAD_X + fretX(fret, a, b) * (W - 2 * PAD_X);
  const dotX = (fret: number) => {
    const lead = fret - 1 < a ? a : fret - 1;
    return fret <= a ? x(a) : x(lead) + BEHIND * (x(fret) - x(lead));
  };
  const y = (string: number) => PAD_Y + ((string - 1) / 5) * (H - 2 * PAD_Y);

  const frets: number[] = [];
  for (let f = a; f <= b; f++) frets.push(f);

  const v = target?.kind === "chord" ? target.voicings[target.active] : undefined;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`fret-strip ${heard?.chordHeard ? "heard" : ""}`}
      data-testid="fretboard-strip"
      role="img"
      aria-label="fretboard"
    >
      {/* board */}
      {frets.map((f) => (
        <line key={`f${f}`} x1={x(f)} y1={y(1)} x2={x(f)} y2={y(6)} className={f === 0 ? "nut" : "fret"} />
      ))}
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={`s${s}`} x1={x(a)} y1={y(s)} x2={x(b)} y2={y(s)} className="string" />
      ))}
      {/* chord voicing */}
      {v?.barres.map((bf) => {
        const rows = v.frets.map((f, i) => (f === bf ? i + 1 : 0)).filter((n) => n > 0);
        if (rows.length < 2) return null;
        return (
          <rect
            key={`b${bf}`}
            data-dot="barre"
            x={dotX(bf) - R_BARRE}
            y={y(Math.min(...rows)) - R_BARRE}
            width={2 * R_BARRE}
            height={y(Math.max(...rows)) - y(Math.min(...rows)) + 2 * R_BARRE}
            rx={R_BARRE}
            className="barre"
          />
        );
      })}
      {v?.frets.map((f, i) => {
        const s = i + 1;
        if (f < 0) {
          return (
            <text key={`m${s}`} data-dot="muted" x={PAD_X - 13} y={y(s) + 3} className="muted">
              ×
            </text>
          );
        }
        if (f === 0) {
          return <circle key={`o${s}`} data-dot="open" cx={PAD_X - 12} cy={y(s)} r={R_OPEN} className="open" />;
        }
        return (
          <g key={`d${s}`}>
            <circle data-dot="finger" cx={dotX(f)} cy={y(s)} r={R_FINGER} className="finger" />
            <text x={dotX(f)} y={y(s) + 2.5} textAnchor="middle" className="finger-num">
              {v.fingers[i] || ""}
            </text>
          </g>
        );
      })}
      {/* scale positions */}
      {target?.kind === "scale" &&
        target.positions
          .filter((p) => p.fret >= a && p.fret <= b)
          .map((p) => {
            // Full-tier lighting (spec §6): feedback.ts already resolved exact-
            // octave + pitch-class fallback into position midis, so a plain
            // membership test is all the renderer needs.
            const hit = heard?.scaleHitMidis?.includes(p.midi) ?? false;
            return (
              <g key={`sc${p.string}-${p.fret}`}>
                <circle
                  data-dot={p.isRoot ? "root" : "scale"}
                  data-hit={hit ? "true" : undefined}
                  cx={dotX(p.fret)}
                  cy={y(p.string)}
                  r={R_SCALE}
                  className={(p.isRoot ? "root" : "scale-dot") + (hit ? " hit" : "")}
                />
                <text x={dotX(p.fret)} y={y(p.string) + 2} textAnchor="middle" className="degree">
                  {p.degree}
                </text>
              </g>
            );
          })}
      {/* full-tier ticks */}
      {heard?.strings?.map((st, i) => (
        <text key={`t${i}`} data-tick={st} x={W - PAD_X + 13} y={y(i + 1) + 3} className={`tick ${st}`}>
          {st === "ok" ? "✓" : st === "muted-expected" ? "–" : "·"}
        </text>
      ))}
    </svg>
  );
}
