import { useMemo, useRef, useState } from 'react';
import { cardsFromComboIndex, cardToString, parseCard, type Card } from '../../core/cards';
import { DRAW_ROWS, MADE_CLASSES, MADE_LABELS, rangeClasses, type ClassRow } from '../../core/handClass';
import { CELLS, CELL_NAMES, comboLabel, combosOfCell } from '../../core/ranges/hands';
import { parseRange, RangeSyntaxError } from '../../core/ranges/notation';
import { comboTotal, withoutCards, type Weights } from '../../core/ranges/range';
import type { CardStr } from '../../core/hand/types';
import { CardPicker } from '../cards/CardPicker';
import { PlayingCard } from '../cards/PlayingCard';
import { Button, Segmented } from '../controls';
import { useEquity } from '../lab/useEquity';
import { VillainRangeModal } from '../lab/VillainRangeModal';
import { allCharts } from '../ranges/charts';
import { dealNext, nextBoardLabel } from './board';
import { FearPanel } from './FearPanel';
import { ANY, QuickRangeButtons } from './QuickRanges';

const COLORS = ['#f26b1d', '#2f6fd6', '#1f8a4c', '#a855f7', '#d4a017', '#0ea5a4'];
const KEY = 'logistack.eq.v1';

interface Setup {
  players: string[];
  board: CardStr[];
}

const DEFAULT: Setup = { players: ['AhKh', 'JJ+, AQs+, AKo'], board: [] };

function loadSetup(): Setup {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Setup | null;
    return s && Array.isArray(s.players) && s.players.length >= 2 && Array.isArray(s.board) ? s : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

/** "As Ks" (two cards with a space) reads as the hand AsKs. */
const normalise = (text: string) => text.replace(/^\s*([2-9tjqka][shdc])\s+([2-9tjqka][shdc])\s*$/i, '$1$2');

type Parsed = { weights: Weights; error?: undefined } | { weights?: undefined; error: string };

function parse(text: string): Parsed {
  if (!text.trim()) return { error: 'Enter a hand (AsKs) or a range (TT+, AQs+)' };
  try {
    const weights = parseRange(normalise(text));
    return comboTotal(weights) > 0 ? { weights } : { error: 'No hands in this range' };
  } catch (e) {
    return { error: e instanceof RangeSyntaxError ? e.message : String(e) };
  }
}

/** Cards of a range that is a single exact hand, for clash checks. */
function exactCards(w: Weights): Card[] | null {
  let found = -1;
  for (let c = 0; c < 1326; c++) {
    if (w[c]! > 0) {
      if (found >= 0) return null;
      found = c;
    }
  }
  return found < 0 ? null : cardsFromComboIndex(found);
}

const pct = (x: number | undefined, digits = 2) => (x === undefined || Number.isNaN(x) ? '–' : `${(x * 100).toFixed(digits)}%`);
const combosText = (n: number) => n.toFixed(1).replace(/\.0$/, '');

/** Red (0 %) through amber (50 %) to green (100 %). */
function heat(equity: number): string {
  const stops = [
    [0, [198, 40, 40]],
    [0.5, [212, 160, 23]],
    [1, [31, 138, 76]],
  ] as const;
  const [a, b] = equity <= 0.5 ? [stops[0], stops[1]] : [stops[1], stops[2]];
  const t = (equity - a[0]) / (b[0] - a[0]);
  const c = a[1].map((v, i) => Math.round(v + (b[1][i]! - v) * t));
  return `rgb(${c.join(',')})`;
}

/**
 * Equity calculator: 2-6 players, each with an exact hand or a range, on any board. Two players
 * are exact (preflop from the table, after the flop every runout); more are simulated.
 */
export function EquityPage() {
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const setSetup = (next: Setup) => {
    setSetupState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // storage blocked: the setup just isn't remembered
    }
  };
  const [editing, setEditing] = useState<number | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  // the heat map starts on the widest range (a single hand makes a dull map)
  const [heatFor, setHeatFor] = useState(() => {
    const sizes = setup.players.map((t) => parse(t).weights ?? new Float32Array(0)).map(comboTotal);
    return sizes.indexOf(Math.max(...sizes));
  });
  const [hover, setHover] = useState<{ cell: number; x: number; y: number } | null>(null);
  const charts = useMemo(allCharts, []);

  const board = useMemo(() => setup.board.map(parseCard), [setup.board]);
  const parsed = useMemo(() => setup.players.map(parse), [setup.players]);

  // exact hands must not share cards with each other or the board
  const clash = useMemo(() => {
    const seen = new Set(board);
    for (const p of parsed) {
      const cards = p.weights ? exactCards(p.weights) : null;
      for (const c of cards ?? []) {
        if (seen.has(c)) return `${cardToString(c)} is dealt twice`;
        seen.add(c);
      }
    }
    return null;
  }, [parsed, board]);

  const ready = !clash && parsed.every((p) => p.weights);
  const question = ready ? { kind: 'field' as const, ranges: parsed.map((p) => p.weights!), board } : null;
  const key = JSON.stringify([setup.players.map(normalise), setup.board]);
  const { answer, pending } = useEquity(question, key);
  const field = answer?.field;
  const heatPlayer = Math.min(heatFor, setup.players.length - 1);

  const setPlayer = (i: number, text: string) => setSetup({ ...setup, players: setup.players.map((t, j) => (j === i ? text : t)) });
  const removePlayer = (i: number) => setSetup({ ...setup, players: setup.players.filter((_, j) => j !== i) });
  const addPlayer = () => setSetup({ ...setup, players: [...setup.players, ANY] });
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const quickRange = (i: number, text: string) => {
    setPlayer(i, text);
    if (!text) inputs.current[i]?.focus(); // cleared: ready to type a hand
  };

  // the cards of the players with an exact hand: never dealt to the board
  const held = useMemo(() => parsed.flatMap((p) => (p.weights ? (exactCards(p.weights) ?? []) : [])), [parsed]);
  const dealBoard = () => setSetup({ ...setup, board: dealNext(board, held).map(cardToString) });

  const street = ['Preflop', '', '', 'Flop', 'Turn', 'River'][board.length];
  const methodText = !field
    ? ''
    : field.method === 'table'
      ? 'Exact: every pair of hands, from the preflop table (it stores equity only, so no win/tie split before the flop).'
      : field.method === 'exact'
        ? `Exact: every ${board.length === 3 ? 'turn and river' : board.length === 4 ? 'river' : 'hand on this board'}.`
        : `Simulated: ${field.samples?.toLocaleString('en')} deals (equity ± about ${pct(2 * Math.max(...field.players.map((p) => p.stdError ?? 0)), 2)}).`;

  // cards known to be out for a player: the board and the exact hands of the others
  const exacts = useMemo(() => parsed.map((p) => (p.weights ? exactCards(p.weights) : null)), [parsed]);
  const deadFor = (i: number): Card[] => [...board, ...exacts.flatMap((cards, j) => (j !== i && cards ? cards : []))];

  // heat map of one player's hands against the rest
  const heatWeights = parsed[heatPlayer]?.weights;
  const vsField = field?.players[heatPlayer]?.vsField;
  const heatDead = deadFor(heatPlayer);
  const heatDeadKey = heatDead.join(',');
  // keyed on the dead cards' text: the array itself is new on every render
  const heatLive = useMemo(() => (heatWeights ? withoutCards(heatWeights, heatDead) : null), [heatWeights, heatDeadKey]);
  const cellInfo = useMemo(() => {
    if (!heatLive) return null;
    const live = heatLive;
    return Array.from({ length: CELLS }, (_, cell) => {
      let w = 0;
      let e = 0;
      let known = 0;
      let dealable = 0; // combos the known cards don't block
      for (const c of combosOfCell(cell)) {
        if (!heatDead.some((d) => cardsFromComboIndex(c).includes(d))) dealable++;
        const wc = live[c]!;
        if (wc <= 0) continue;
        w += wc;
        const v = vsField?.[c];
        if (v !== undefined && !Number.isNaN(v)) {
          e += wc * v;
          known += wc;
        }
      }
      // how much of the cell is in the range: AQs at 50 % fills half the cell
      return { weight: w, share: dealable > 0 ? Math.min(1, w / dealable) : 0, equity: known > 0 ? e / known : NaN };
    });
  }, [heatLive, vsField]); // heatLive changes whenever the dead cards do

  // heads-up on a flop or turn: the other player's range, for the fear numbers
  const opponent = setup.players.length === 2 ? 1 - heatPlayer : -1;
  const oppWeights = opponent >= 0 ? parsed[opponent]?.weights : undefined;
  const oppDeadKey = opponent >= 0 ? deadFor(opponent).join(',') : '';
  const oppLive = useMemo(() => (oppWeights ? withoutCards(oppWeights, deadFor(opponent)) : null), [oppWeights, oppDeadKey]);
  const fearReady = !clash && heatLive && oppLive && (board.length === 3 || board.length === 4);

  // the same player's range by hand class (needs a flop), without the combos the known cards rule out
  const classes = useMemo(
    () => (heatLive && board.length >= 3 ? rangeClasses(board, heatLive, vsField) : null),
    [heatLive, vsField, board],
  );

  return (
    <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)] gap-5 px-6 py-5 xl:grid-cols-[560px_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider text-muted uppercase">Players</h2>
            <Button variant="secondary" disabled={setup.players.length >= 6} onClick={addPlayer}>
              + Player
            </Button>
          </div>
          <div className="space-y-3">
            {setup.players.map((text, i) => {
              const p = parsed[i]!;
              const live = p.weights ? comboTotal(withoutCards(p.weights, deadFor(i))) : 0;
              // an empty field is waiting for a hand, not wrong
              const wrong = p.error && text.trim() !== '';
              return (
                <div key={i}>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COLORS[i] }} />
                    <span className="w-16 shrink-0 text-sm font-semibold">Player {i + 1}</span>
                    <input
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      value={text}
                      onChange={(e) => setPlayer(i, e.target.value)}
                      placeholder="AsKs, or a range: TT+, AQs+, KQo"
                      aria-label={`Player ${i + 1} hand or range`}
                      className={`min-w-0 flex-1 rounded-md border bg-surface-2 px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus:outline-none ${
                        wrong ? 'border-danger' : 'border-line focus:border-accent'
                      }`}
                    />
                    <Button variant="secondary" onClick={() => setEditing(i)}>
                      Edit…
                    </Button>
                    <button
                      type="button"
                      disabled={setup.players.length <= 2}
                      onClick={() => removePlayer(i)}
                      className="px-1 text-lg leading-none text-muted hover:text-danger disabled:opacity-20"
                      aria-label={`Remove player ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                  <div className={`mt-1 ml-[5.25rem] text-xs ${wrong ? 'text-danger' : 'text-faint'}`}>
                    {p.error ?? `${combosText(live)} combos (${((live / 1326) * 100).toFixed(1)}% of hands)`}
                  </div>
                  <QuickRangeButtons current={text} onPick={(t) => quickRange(i, t)} className="mt-1.5 sm:ml-[5.25rem]" />
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wider text-muted uppercase">Board · {street}</h2>
            <div className="flex gap-2 whitespace-nowrap">
              <Button variant="secondary" onClick={() => setBoardOpen(true)}>
                Pick…
              </Button>
              <Button variant="secondary" onClick={dealBoard}>
                {nextBoardLabel(board.length)}
              </Button>
              <Button variant="ghost" disabled={board.length === 0} onClick={() => setSetup({ ...setup, board: [] })}>
                Clear
              </Button>
            </div>
          </div>
          <button type="button" onClick={() => setBoardOpen(true)} className="flex gap-2" aria-label="Board cards">
            {[0, 1, 2, 3, 4].map((i) =>
              board[i] !== undefined ? (
                <PlayingCard key={i} card={board[i]!} width="56px" />
              ) : (
                <div key={i} className="flex h-[78px] w-[56px] items-center justify-center rounded-md border border-dashed border-line text-xs text-faint">
                  {i < 3 ? 'flop' : i === 3 ? 'turn' : 'river'}
                </div>
              ),
            )}
          </button>
        </section>

        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider text-muted uppercase">Equity</h2>
            {pending && <span className="text-xs text-muted">calculating…</span>}
          </div>
          {clash && <p className="text-sm text-danger">{clash}</p>}
          {answer?.error && <p className="text-sm text-danger">{answer.error}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 pr-3 font-semibold">Player</th>
                <th className="py-1 font-semibold">Hand / range</th>
                <th className="py-1 pl-3 text-right font-semibold">Equity</th>
                <th className="py-1 pl-3 text-right font-semibold">Win</th>
                <th className="py-1 pl-3 text-right font-semibold">Tie</th>
              </tr>
            </thead>
            <tbody>
              {setup.players.map((text, i) => {
                const r = field?.players[i];
                return (
                  <tr key={i} className="border-t border-line">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                      Player {i + 1}
                    </td>
                    {/* takes the width that is left and cuts long ranges short (max-w-0 lets a cell shrink) */}
                    <td className="w-full max-w-0 truncate py-2 font-mono text-xs text-muted" title={text}>
                      {normalise(text)}
                    </td>
                    <td className="py-2 pl-3 text-right text-lg font-bold tabular-nums">{pending && !r ? '…' : pct(r?.equity)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted">{pct(r?.win)}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-muted">{pct(r?.tie)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {field && (
            <div className="mt-2 flex h-2.5 overflow-hidden rounded-full">
              {field.players.map((p, i) => (
                <div key={i} style={{ width: `${p.equity * 100}%`, background: COLORS[i] }} />
              ))}
            </div>
          )}
          {methodText && <p className="mt-2 text-xs text-faint">{methodText}</p>}
        </section>

        {fearReady && (
          <FearPanel
            player={heatPlayer}
            board={board}
            weights={heatLive}
            opponent={oppLive}
            vsField={vsField}
            inputsKey={JSON.stringify([heatPlayer, setup.players.map(normalise), setup.board])}
          />
        )}
        {setup.players.length > 2 && board.length >= 3 && board.length <= 4 && (
          <p className="px-1 text-xs text-faint">Buckets and fear: with two players only (fear is measured against one range).</p>
        )}

        {classes && (
          <section className="rounded-lg border border-line bg-surface p-4">
            <h2 className="mb-3 text-xs font-bold tracking-wider text-muted uppercase">Player {heatPlayer + 1}: hand classes</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1 font-semibold">Made hands</th>
                  <th className="py-1 text-right font-semibold">Combos</th>
                  <th className="py-1 text-right font-semibold">% of range</th>
                  <th className="py-1 text-right font-semibold">Equity</th>
                </tr>
              </thead>
              <tbody>
                {MADE_CLASSES.filter((k) => classes.made[k].combos > 0).map((k) => (
                  <ClassLine key={k} label={MADE_LABELS[k]} row={classes.made[k]} total={classes.total} />
                ))}
                {DRAW_ROWS.some(([k]) => classes.draws[k].combos > 0) && (
                  <tr>
                    <td colSpan={4} className="pt-3 pb-1 text-xs font-semibold text-muted">
                      Draws (overlap the made hands)
                    </td>
                  </tr>
                )}
                {DRAW_ROWS.filter(([k]) => classes.draws[k].combos > 0).map(([k, label]) => (
                  <ClassLine key={k} label={label} row={classes.draws[k]} total={classes.total} indent={k === 'nut-flush-draw'} />
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      <div>
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold tracking-wider text-muted uppercase">How each hand does</h2>
            <Segmented
              size="sm"
              value={heatPlayer}
              options={setup.players.map((_, i) => ({ value: i, label: `Player ${i + 1}` }))}
              onChange={setHeatFor}
            />
          </div>
          <div style={{ width: 'min(100%, calc(100vh - 210px))' }}>
            <div
              className="grid w-full gap-px rounded-md border border-line bg-line p-px"
              style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))', aspectRatio: '1 / 1', containerType: 'inline-size' }}
              onPointerLeave={() => setHover(null)}
            >
              {Array.from({ length: CELLS }, (_, cell) => {
                const info = cellInfo?.[cell];
                const inRange = info && info.weight > 0;
                const known = inRange && !Number.isNaN(info.equity);
                return (
                  <div
                    key={cell}
                    onPointerMove={(e) => setHover(inRange ? { cell, x: e.clientX, y: e.clientY } : null)}
                    className="flex flex-col justify-between overflow-hidden rounded-[2px] font-bold"
                    style={{
                      padding: '0.5cqw 0.6cqw',
                      fontSize: '2.2cqw',
                      lineHeight: 1.05,
                      background: known
                        ? `linear-gradient(to right, ${heat(info.equity)} 0 ${info.share * 100}%, var(--surface-2) ${info.share * 100}% 100%)`
                        : inRange
                          ? 'var(--surface-3)'
                          : 'var(--surface-2)',
                      color: known ? '#ffffff' : 'var(--text-faint)',
                      textShadow: known ? '0 1px 1px rgba(0,0,0,0.5)' : undefined,
                    }}
                  >
                    <span>{CELL_NAMES[cell]}</span>
                    {known && <span className="self-end font-semibold">{Math.round(info.equity * 100)}</span>}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-faint">
              Each hand of Player {heatPlayer + 1} against the others: red loses, green wins. A hand played part of the time fills that
              part of its cell. Grey: in the range but blocked by the board or another player's cards.
              {field?.method === 'monte-carlo' ? ' Simulated, so single hands carry a few % of noise.' : ''}
            </p>
          </div>
        </section>
      </div>

      {hover && heatLive && vsField && <HeatPopup cell={hover.cell} x={hover.x} y={hover.y} weights={heatLive} vsField={vsField} />}

      {editing !== null && (
        <VillainRangeModal
          title={`Player ${editing + 1}: hand or range`}
          initial={parsed[editing]?.weights ?? new Float32Array(1326)}
          dead={board}
          charts={charts}
          canReset={false}
          quick
          onSave={(text) => {
            setPlayer(editing, text);
            setEditing(null);
          }}
          onReset={() => setEditing(null)}
          onClose={() => setEditing(null)}
        />
      )}

      {boardOpen && (
        <CardPicker
          title="Board: none, a flop, a turn or a river"
          validCounts={[0, 3, 4, 5]}
          initial={setup.board}
          taken={new Set(held)}
          allowUnknown={false}
          onClose={() => setBoardOpen(false)}
          onDone={(cards) => {
            setSetup({ ...setup, board: cards ?? [] });
            setBoardOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ClassLine({ label, row, total, indent = false }: { label: string; row: ClassRow; total: number; indent?: boolean }) {
  return (
    <tr className="border-t border-line">
      <td className={`py-1.5 ${indent ? 'pl-4 text-muted' : ''}`}>{label.trim()}</td>
      <td className="py-1.5 text-right tabular-nums">{combosText(row.combos)}</td>
      <td className="py-1.5 text-right tabular-nums text-muted">{total > 0 ? `${((row.combos / total) * 100).toFixed(1)}%` : '–'}</td>
      <td className="py-1.5 text-right">
        {Number.isNaN(row.equity) ? (
          <span className="text-faint">–</span>
        ) : (
          <span className="inline-block min-w-12 rounded px-1.5 text-center text-xs font-bold text-white tabular-nums" style={{ background: heat(row.equity) }}>
            {Math.round(row.equity * 100)}%
          </span>
        )}
      </td>
    </tr>
  );
}

/** The combos of a hovered cell with each one's equity. */
function HeatPopup({ cell, x, y, weights, vsField }: { cell: number; x: number; y: number; weights: Weights; vsField: Float32Array }) {
  const combos = combosOfCell(cell).filter((c) => weights[c]! > 0);
  const cols = combos.length > 6 ? 4 : combos.length > 4 ? 3 : 2;
  const width = cols * 74 + 24;
  const left = Math.max(8, Math.min(x + 18, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(y + 18, window.innerHeight - 200));
  return (
    <div className="pointer-events-none fixed z-50 rounded-lg border border-line bg-surface p-3 shadow-2xl" style={{ left, top, width }}>
      <div className="mb-2 border-b border-line pb-1.5 text-base font-bold">{CELL_NAMES[cell]}</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {combos.map((c) => {
          const e = vsField[c]!;
          return (
            <div
              key={c}
              className="rounded px-1 py-1 text-center font-mono text-xs text-white"
              style={{ background: Number.isNaN(e) ? 'var(--surface-3)' : heat(e) }}
            >
              {comboLabel(c, true)} {Number.isNaN(e) ? '' : Math.round(e * 100)}
              {weights[c]! < 1 && <span className="opacity-75"> ×{Number(weights[c]!.toFixed(2))}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
