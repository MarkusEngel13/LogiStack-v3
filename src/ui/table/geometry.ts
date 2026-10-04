/**
 * Seat geometry for a stadium-shaped table (2:1 box, semicircle ends).
 *
 * Slots are spread evenly along the rail. Slot 0 is bottom center (Hero); slots go clockwise as
 * seen on screen: bottom → left → top → right, which matches clockwise play when Hero sits at
 * the bottom. All results are percentages of the table box, so the table scales freely.
 *
 * These are computed defaults; a layout editor can later store hand-tuned overrides per size.
 */

export interface Point {
  x: number; // % of box width
  y: number; // % of box height
}

export interface SeatSlot {
  /** Centre of the seat plate. */
  plate: Point;
  /** Where this seat's bet sits on the felt. */
  bet: Point;
  /** Dealer button position when this seat has the button. */
  button: Point;
  /** Which side of the table the seat is on (cards and tooltips use it). */
  side: 'bottom' | 'left' | 'top' | 'right';
}

// Work in a 200 x 100 box; caps have radius 50 centred at (50,50) and (150,50).
const W = 200;
const H = 100;
const R = H / 2;
const STRAIGHT = W - 2 * R; // 100
const CAP = Math.PI * R;
const PERIMETER = 2 * STRAIGHT + 2 * CAP;

interface RailPoint {
  x: number;
  y: number;
  nx: number; // outward normal
  ny: number;
  tx: number; // clockwise tangent
  ty: number;
}

/** Point at arc length s from bottom centre, moving left first. */
function railAt(s: number): RailPoint {
  s = ((s % PERIMETER) + PERIMETER) % PERIMETER;
  const half = STRAIGHT / 2;
  if (s < half) return { x: W / 2 - s, y: H, nx: 0, ny: 1, tx: -1, ty: 0 };
  s -= half;
  if (s < CAP) {
    const t = s / R;
    return { x: R - R * Math.sin(t), y: R + R * Math.cos(t), nx: -Math.sin(t), ny: Math.cos(t), tx: -Math.cos(t), ty: -Math.sin(t) };
  }
  s -= CAP;
  if (s < STRAIGHT) return { x: R + s, y: 0, nx: 0, ny: -1, tx: 1, ty: 0 };
  s -= STRAIGHT;
  if (s < CAP) {
    const t = s / R;
    return { x: W - R + R * Math.sin(t), y: R - R * Math.cos(t), nx: Math.sin(t), ny: -Math.cos(t), tx: Math.cos(t), ty: Math.sin(t) };
  }
  s -= CAP;
  return { x: W - R - s, y: H, nx: 0, ny: 1, tx: -1, ty: 0 };
}

const toPct = (x: number, y: number): Point => ({ x: (x / W) * 100, y: (y / H) * 100 });

/** Distances in box units (200 wide). Tuned by eye for the plate and chip sizes in PokerTable. */
const PLATE_OUT = 1;
const BET_IN = 25;
const BUTTON_IN = 16;
const BUTTON_ALONG = 17;

function sideOf(p: RailPoint): SeatSlot['side'] {
  if (Math.abs(p.ny) > 0.8) return p.ny > 0 ? 'bottom' : 'top';
  return p.nx < 0 ? 'left' : 'right';
}

export function seatSlots(n: number): SeatSlot[] {
  if (!Number.isInteger(n) || n < 2 || n > 10) throw new Error(`table size must be 2-10, got ${n}`);
  return Array.from({ length: n }, (_, i) => {
    const p = railAt((i * PERIMETER) / n);
    return {
      plate: toPct(p.x + p.nx * PLATE_OUT, p.y + p.ny * PLATE_OUT),
      bet: toPct(p.x - p.nx * BET_IN, p.y - p.ny * BET_IN),
      button: toPct(p.x - p.nx * BUTTON_IN + p.tx * BUTTON_ALONG, p.y - p.ny * BUTTON_IN + p.ty * BUTTON_ALONG),
      side: sideOf(p),
    };
  });
}

/** Screen slot for a physical seat, rotating the table so `anchorSeat` (Hero) sits at slot 0. */
export const slotOfSeat = (seat: number, anchorSeat: number, n: number) => (((seat - anchorSeat) % n) + n) % n;
