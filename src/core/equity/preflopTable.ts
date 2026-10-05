import { cardsFromComboIndex, type Card } from '../cards';
import { matchupClass } from './preflopKey';

const MAGIC = 0x4650534c; // "LSPF"
const VERSION = 2;
/** Equities are stored as k / SCALE; an even scale keeps 0.5 and 1 - x exact. */
const SCALE = 65534;

/**
 * Exact heads-up preflop equities, one per matchup class (scripts/build-preflop-table.mjs builds
 * preflop-hu.bin). A lookup is a suit relabelling plus a map read, so hero vs a full range
 * preflop is ~1,300 lookups: instant and exact.
 */
export class PreflopTable {
  private readonly index = new Map<number, number>();
  private readonly equities: Uint16Array;

  private constructor(equities: Uint16Array, keys: Int32Array) {
    this.equities = equities;
    keys.forEach((key, i) => this.index.set(key, i));
  }

  static fromBuffer(buffer: ArrayBuffer): PreflopTable {
    const [magic, version, count = 0] = new Uint32Array(buffer, 0, 3);
    if (magic !== MAGIC || version !== VERSION) throw new Error(`Not a LogiStack preflop table (version ${VERSION})`);
    if (buffer.byteLength !== 12 + count * 6) throw new Error('Preflop table has the wrong size');
    return new PreflopTable(new Uint16Array(buffer, 12 + count * 4, count), new Int32Array(buffer, 12, count));
  }

  get size() {
    return this.index.size;
  }

  /** Hero's equity (0..1, ties half) against one villain hand. All four cards distinct. */
  equity(h1: Card, h2: Card, v1: Card, v2: Card): number {
    return this.scaled(h1, h2, v1, v2) / SCALE;
  }

  private scaled(h1: Card, h2: Card, v1: Card, v2: Card): number {
    const cls = matchupClass(h1, h2, v1, v2);
    const i = this.index.get(Math.floor(cls / 2));
    if (i === undefined) throw new Error('Matchup missing from the preflop table');
    const k = this.equities[i]!;
    return cls & 1 ? SCALE - k : k;
  }

  private matrix: Uint16Array | null = null;

  /**
   * Equity of combo a against combo b (combo indices) as k / SCALE, for range against range.
   * The full 1326 x 1326 grid (3.5 MB) is built on first use, about half a second.
   */
  comboEquity(a: number, b: number): number {
    if (!this.matrix) {
      const m = new Uint16Array(1326 * 1326);
      const cards = Array.from({ length: 1326 }, (_, i) => cardsFromComboIndex(i));
      for (let x = 0; x < 1326; x++) {
        const [a1, a2] = cards[x]!;
        for (let y = x + 1; y < 1326; y++) {
          const [b1, b2] = cards[y]!;
          if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue;
          const k = this.scaled(a1, a2, b1, b2);
          m[x * 1326 + y] = k;
          m[y * 1326 + x] = SCALE - k;
        }
      }
      this.matrix = m;
    }
    return this.matrix[a * 1326 + b]! / SCALE;
  }
}
