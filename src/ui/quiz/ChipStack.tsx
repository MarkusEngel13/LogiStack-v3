import type { ReactNode } from 'react';
import type { ChipDef, Scene, Tower } from '../../core/quiz/stack';

/**
 * Chips drawn in SVG, seen from the front at an angle (v2's 30°): each chip an oval face over a
 * striped edge, stacked into towers with a little sideways wobble; rows behind rows; loose chips
 * lying in front; a splashed pot scattered flat. No 3D engine, no images.
 */

const W = 40; // chip width
const FACE = W * 0.42; // the oval's height
const T = 4.2; // edge thickness
const GAP = W * 1.12; // towers side by side
const ROW = FACE * 1.05; // rows going back

function darker(hex: string, k = 0.65) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

/** Stripes around a chip's edge: about five show across the front (v2's look). */
const STRIPES = 10;
/** A stripe's share of the space from one stripe to the next. */
const STRIPE_SHARE = 0.3;

/**
 * One chip whose top face is centred at (x, y), turned by `turn` (0-1 of a full circle): the edge
 * stripes sit where the turn puts them, so in a tower they zip instead of lining up. A stripe
 * follows the round edge: narrower towards the sides.
 */
function Chip({ def, x, y, turn }: { def: ChipDef; x: number; y: number; turn: number }) {
  const rx = W / 2;
  const ry = FACE / 2;
  const edge = darker(def.color, 0.78);
  // a point on the front of the edge at angle a (0 = left side, π = right side), below the face
  const at = (a: number) => [x - Math.cos(a) * rx, y + Math.sin(a) * ry] as const;
  const half = (Math.PI * STRIPE_SHARE) / STRIPES;
  const stripes: ReactNode[] = [];
  for (let k = 0; k < STRIPES; k++) {
    const mid = ((((k / STRIPES + turn) % 1) + 1) % 1) * 2 * Math.PI;
    const a0 = Math.max(0, mid - half);
    const a1 = Math.min(Math.PI, mid + half);
    if (a1 <= a0) continue; // round the back
    const [x0, y0] = at(a0);
    const [x1, y1] = at(a1);
    stripes.push(<polygon key={k} points={`${x0},${y0} ${x1},${y1} ${x1},${y1 + T} ${x0},${y0 + T}`} fill={def.stripe} opacity={0.9} />);
  }
  return (
    <g>
      <path d={`M ${x - rx} ${y} L ${x - rx} ${y + T} A ${rx} ${ry} 0 0 0 ${x + rx} ${y + T} L ${x + rx} ${y} Z`} fill={edge} stroke={darker(def.color, 0.45)} strokeWidth={0.35} />
      {stripes}
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={def.color} stroke={darker(def.color, 0.55)} strokeWidth={0.6} />
      <ellipse cx={x} cy={y} rx={rx * 0.68} ry={ry * 0.68} fill="none" stroke={def.stripe} strokeWidth={1.4} strokeDasharray="3 3" strokeDashoffset={turn * 6} opacity={0.85} />
      <ellipse cx={x} cy={y} rx={rx * 0.42} ry={ry * 0.42} fill={def.color} stroke={darker(def.color, 0.7)} strokeWidth={0.5} />
    </g>
  );
}

/** A turn for chips of questions made before chips had one: scattered, the same on every screen. */
const oldTurn = (i: number, c: number) => {
  const s = Math.sin(i * 12.9898 + c * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

function TowerView({ tower, chips, x, base }: { tower: Tower; chips: ChipDef[]; x: number; base: number }) {
  return (
    <g>
      {tower.chips.map((c, i) => (
        <Chip key={i} def={chips[c]!} x={x + (tower.jitter[i] ?? 0)} y={base - i * T + (tower.lift?.[i] ?? 0)} turn={tower.turn?.[i] ?? oldTurn(i, c)} />
      ))}
    </g>
  );
}

/** One scene (a player's stack, a pot) as an SVG that fills its width. */
export function ChipScene({ scene, chips, label }: { scene: Scene; chips: ChipDef[]; label?: string }) {
  const towersInRow = Math.max(1, ...scene.rows.map((r) => r.length));
  const tallest = Math.max(1, ...scene.rows.flat().map((t) => t.chips.length));
  const rows = scene.rows.length;
  const splash = scene.splash ?? [];
  const width = Math.max(towersInRow * GAP + W, splash.length ? 7 * W : 0, 4 * W);
  const height = (rows ? tallest * T + rows * ROW : 0) + FACE + T + (scene.loose.length ? FACE * 1.6 : 0) + (splash.length ? 3.2 * FACE : 0) + 10;
  const cx = width / 2;
  const front = (rows ? tallest * T + rows * ROW : 0) + FACE / 2 + 4;
  return (
    <figure className="min-w-0">
      {label && <figcaption className="mb-1 text-xs font-semibold text-muted">{label}</figcaption>}
      <svg viewBox={`0 0 ${width} ${height}`} className="block w-full" style={{ maxHeight: '46vh' }} role="img" aria-label={label ?? 'A stack of chips'}>
        {/* back rows first, so the front ones cover them */}
        {[...scene.rows.keys()].reverse().map((r) => {
          const row = scene.rows[r]!;
          const base = front - r * ROW;
          const shift = r % 2 ? GAP / 2 : 0;
          const x0 = cx - ((row.length - 1) * GAP) / 2 + shift;
          return (
            <g key={r}>
              {row.map((t, i) => (
                <TowerView key={i} tower={t} chips={chips} x={x0 + i * GAP} base={base} />
              ))}
            </g>
          );
        })}
        {scene.loose.map((l, i) => (
          <Chip key={`l${i}`} def={chips[l.chip]!} x={cx + l.x * W * 0.6} y={front + FACE * 0.9 + l.y * FACE} turn={l.turn ?? oldTurn(i, l.chip)} />
        ))}
        {[...splash]
          .sort((a, b) => a.y - b.y)
          .map((s, i) => (
            <Chip key={`s${i}`} def={chips[s.chip]!} x={cx + s.x * W * 0.95} y={height / 2 + s.y * FACE * 1.1} turn={s.turn ?? oldTurn(i, s.chip)} />
          ))}
      </svg>
    </figure>
  );
}

/** The chip set's legend: each chip and its value. */
export function ChipLegend({ chips, format }: { chips: ChipDef[]; format: (v: number) => string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {chips.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5 text-xs text-muted">
          <svg viewBox="-22 -12 44 28" width={30} height={20} aria-hidden>
            <Chip def={c} x={0} y={0} turn={0.2} />
          </svg>
          {format(c.value)}
        </span>
      ))}
    </div>
  );
}
