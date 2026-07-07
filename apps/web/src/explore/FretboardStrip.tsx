// Schematic fretboard strip (the v2-prototype "fretboard zoom" panel, camera-
// free). Pure presentational: parent passes target/heard; no store reads.
// Layout: string 1 (high e) on TOP (prototype convention); x from the shared
// equal-tempered fretX(); finger dots use the lessons' 70%-behind-the-fret
// convention.
import { fretX } from "../perception/vision/fretboard";
import type { ExploreTarget } from "./exploreStore";
import type { HeardState } from "./feedback";

export interface FretboardStripProps {
  target: ExploreTarget;
  window?: [number, number];
  heard?: HeardState;
}

const W = 720;
const H = 180;
const PAD_X = 34;
const PAD_Y = 18;
const BEHIND = 0.7; // keep in sync with overlay/targetDots.ts

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
            x={dotX(bf) - 7}
            y={y(Math.min(...rows)) - 9}
            width={14}
            height={y(Math.max(...rows)) - y(Math.min(...rows)) + 18}
            rx={7}
            className="barre"
          />
        );
      })}
      {v?.frets.map((f, i) => {
        const s = i + 1;
        if (f < 0) {
          return (
            <text key={`m${s}`} data-dot="muted" x={PAD_X - 16} y={y(s) + 4} className="muted">
              ×
            </text>
          );
        }
        if (f === 0) {
          return <circle key={`o${s}`} data-dot="open" cx={PAD_X - 14} cy={y(s)} r={5} className="open" />;
        }
        return (
          <g key={`d${s}`}>
            <circle data-dot="finger" cx={dotX(f)} cy={y(s)} r={9} className="finger" />
            <text x={dotX(f)} y={y(s) + 3.5} textAnchor="middle" className="finger-num">
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
                  r={8}
                  className={(p.isRoot ? "root" : "scale-dot") + (hit ? " hit" : "")}
                />
                <text x={dotX(p.fret)} y={y(p.string) + 3} textAnchor="middle" className="degree">
                  {p.degree}
                </text>
              </g>
            );
          })}
      {/* full-tier ticks */}
      {heard?.strings?.map((st, i) => (
        <text key={`t${i}`} data-tick={st} x={W - PAD_X + 14} y={y(i + 1) + 4} className={`tick ${st}`}>
          {st === "ok" ? "✓" : st === "muted-expected" ? "–" : "·"}
        </text>
      ))}
    </svg>
  );
}
