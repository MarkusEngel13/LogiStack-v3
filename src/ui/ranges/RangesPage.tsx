import { useEffect, useMemo, useRef, useState } from 'react';
import { LIBRARY, SCENARIOS, TEN_MAX_POSITIONS, type LibraryRange, type Scenario } from '../../core/ranges/library';
import { chartFromCells, chartToCells, emptyChart, foldOf, type ActionMix, type Chart } from '../../core/ranges/range';
import { Button, Segmented, Toggle } from '../controls';
import { setBrushAction, smartPaintCells } from './brush';
import { deleteMyRange, loadMyRanges, saveMyRange, type MyRange } from './myRanges';
import { ACTION_COLORS, ACTION_LABELS, chartSegments, RangeGrid } from './RangeGrid';
import { ComboPopup, StatsBar } from './RangeParts';
import { RangeTextModal } from './RangeTextModal';

type Ref = { kind: 'library' | 'mine'; id: string };

interface Entry {
  ref: Ref;
  label: string;
  scenario: Scenario;
  positions: string[];
  stack: string;
  env: 'Live' | 'Online';
  playerType: string;
  chart: Chart;
  basedOn?: string;
}

const fromLibrary = (r: LibraryRange): Entry => ({ ...r, ref: { kind: 'library', id: r.id } });
const fromMine = (m: MyRange): Entry => ({ ...m, ref: { kind: 'mine', id: m.id }, chart: chartFromCells(m.cells) });
const sameRef = (a: Ref, b: Ref) => a.kind === b.kind && a.id === b.id;
const refKey = (r: Ref) => `${r.kind}:${r.id}`;
const firstPosition = (e: Entry) => Math.min(...e.positions.map((p) => (TEN_MAX_POSITIONS as readonly string[]).indexOf(p)));

const BRUSH_PRESETS: { label: string; mix: ActionMix }[] = [
  { label: 'Raise', mix: { allin: 0, raise: 100, call: 0 } },
  { label: 'Call', mix: { allin: 0, raise: 0, call: 100 } },
  { label: '50/50', mix: { allin: 0, raise: 50, call: 50 } },
  { label: 'All-in', mix: { allin: 100, raise: 0, call: 0 } },
  { label: 'Erase', mix: { allin: 0, raise: 0, call: 0 } },
];

const DEFAULT_REF: Ref = {
  kind: 'library',
  id: LIBRARY.find((r) => r.env === 'Live' && r.scenario === 'RFI' && r.positions.includes('CO'))?.id ?? LIBRARY[0]!.id,
};

/**
 * Preflop ranges: v2's chart editor. Pick a chart in the library tree, paint with the brush
 * (click or drag; Smart Paint fills a hand and everything better in its line). Library charts
 * stay as they are: the first stroke makes your own copy, which then saves itself.
 */
export function RangesPage() {
  const [mine, setMine] = useState<MyRange[]>(loadMyRanges);
  const entries = useMemo(() => [...LIBRARY.map(fromLibrary), ...mine.map(fromMine)], [mine]);
  const find = (ref: Ref) => entries.find((e) => sameRef(e.ref, ref));

  const [selected, setSelected] = useState<Ref>(DEFAULT_REF);
  const current = find(selected) ?? entries[0]!;
  const [chart, setChart] = useState<Chart>(current.chart);
  const [history, setHistory] = useState<Chart[]>([]);

  const [brush, setBrush] = useState<ActionMix>({ allin: 0, raise: 100, call: 0 });
  const [smart, setSmart] = useState(false);
  const [popupOn, setPopupOn] = useState(true);
  const [hover, setHover] = useState<{ cell: number; x: number; y: number; compare: boolean } | null>(null);
  const [env, setEnv] = useState<'Live' | 'Online'>(current.env);
  const [stack, setStack] = useState(current.stack);
  const [openFolders, setOpenFolders] = useState<Set<Scenario>>(() => new Set([current.scenario]));
  const [compare, setCompare] = useState<string>('');
  const [textOpen, setTextOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Latest values for handlers that run between renders (stroke end, undo).
  const chartRef = useRef(chart);
  chartRef.current = chart;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const select = (ref: Ref) => {
    const e = find(ref);
    if (!e) return;
    setSelected(ref);
    setChart(e.chart);
    setHistory([]);
    setConfirmDelete(false);
  };

  const persist = (next: Chart) => {
    const ref = selectedRef.current;
    if (ref.kind !== 'mine') return;
    const existing = loadMyRanges().find((m) => m.id === ref.id);
    if (!existing) return;
    saveMyRange({ ...existing, cells: chartToCells(next), updatedAt: new Date().toISOString() });
    setMine(loadMyRanges());
  };

  /** Before the first change to a library chart: make it yours. */
  const ensureMine = () => {
    if (selectedRef.current.kind === 'mine') return;
    const lib = current;
    const copy: MyRange = {
      id: crypto.randomUUID(),
      label: `${lib.label} (mine)`,
      scenario: lib.scenario,
      positions: lib.positions,
      stack: lib.stack,
      env: lib.env,
      playerType: lib.playerType,
      cells: chartToCells(chartRef.current),
      basedOn: lib.ref.id,
      updatedAt: new Date().toISOString(),
    };
    saveMyRange(copy);
    setMine(loadMyRanges());
    const ref: Ref = { kind: 'mine', id: copy.id };
    selectedRef.current = ref;
    setSelected(ref);
  };

  const change = (next: Chart) => {
    ensureMine();
    setHistory((h) => [...h.slice(-99), chartRef.current]);
    chartRef.current = next;
    setChart(next);
    persist(next);
  };

  const paint = (cell: number, first: boolean) => {
    if (first) {
      ensureMine();
      setHistory((h) => [...h.slice(-99), chartRef.current]);
    } else if (smart) return; // Smart Paint fills from the clicked hand only
    const cells = smart ? smartPaintCells(cell) : [cell];
    const next = chartRef.current.slice();
    for (const c of cells) next[c] = { ...brush };
    chartRef.current = next;
    setChart(next);
  };

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    chartRef.current = prev;
    setChart(prev);
    persist(prev);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const paintShares = (shares: number[]) => {
    const next = chartRef.current.slice();
    shares.forEach((share, cell) => {
      if (share > 0) {
        next[cell] = {
          allin: Math.round(brush.allin * share),
          raise: Math.round(brush.raise * share),
          call: Math.round(brush.call * share),
        };
      }
    });
    change(next);
  };

  const rename = (label: string) => {
    const existing = loadMyRanges().find((m) => m.id === selected.id);
    if (!existing) return;
    saveMyRange({ ...existing, label, updatedAt: new Date().toISOString() });
    setMine(loadMyRanges());
  };

  const remove = () => {
    const gone = selected;
    const back = current.basedOn ? find({ kind: 'library', id: current.basedOn }) : undefined;
    deleteMyRange(gone.id);
    const list = loadMyRanges();
    setMine(list);
    const target = back ?? fromLibrary(LIBRARY[0]!);
    setSelected(target.ref);
    selectedRef.current = target.ref;
    setChart(target.chart);
    setHistory([]);
    setConfirmDelete(false);
  };

  const compareEntry = compare ? entries.find((e) => refKey(e.ref) === compare) : undefined;
  const fills = useMemo(() => chartSegments(chart), [chart]);
  const compareFills = useMemo(() => (compareEntry ? chartSegments(compareEntry.chart) : null), [compareEntry]);
  const basedOn = current.basedOn ? find({ kind: 'library', id: current.basedOn }) : undefined;

  const tree = SCENARIOS.map((scenario) => ({
    scenario,
    items: entries
      .filter((e) => e.scenario === scenario && e.env === env && e.stack === stack)
      .sort((a, b) => firstPosition(a) - firstPosition(b) || (a.ref.kind === b.ref.kind ? 0 : a.ref.kind === 'library' ? -1 : 1)),
  })).filter((g) => g.items.length > 0);

  const gridWidth = compareEntry ? 'min(calc(50% - 8px), calc(100vh - 300px))' : 'min(100%, calc(100vh - 300px))';

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-6 py-5" style={{ gridTemplateColumns: '290px minmax(0, 1fr)' }}>
      {/* Sidebar: brush, then the library */}
      <aside className="space-y-4">
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 text-xs font-bold tracking-wider text-muted uppercase">Brush</div>
          <div className="space-y-2.5">
            {(['allin', 'raise', 'call'] as const).map((a) => (
              <label key={a} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-xs font-semibold text-muted">{ACTION_LABELS[a]}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={brush[a]}
                  onChange={(e) => setBrush((b) => setBrushAction(b, a, Number(e.target.value)))}
                  className="grow"
                  style={{ accentColor: ACTION_COLORS[a] }}
                  aria-label={`${ACTION_LABELS[a]} %`}
                />
                <span className="w-10 text-right font-mono text-xs">{brush[a]}%</span>
              </label>
            ))}
            <div className="flex items-center gap-3 text-sm">
              <span className="w-12 text-xs font-semibold text-faint">Fold</span>
              <span className="grow text-xs text-faint">the rest</span>
              <span className="w-10 text-right font-mono text-xs text-faint">{foldOf(brush)}%</span>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {BRUSH_PRESETS.map((p) => {
              const active = p.mix.allin === brush.allin && p.mix.raise === brush.raise && p.mix.call === brush.call;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setBrush(p.mix)}
                  className={`rounded border px-2 py-1 text-xs ${active ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-2.5 border-t border-line pt-3">
            <Toggle checked={smart} onChange={setSmart} label="Smart Paint" hint="A hand and every better one in its line." />
            <Toggle checked={popupOn} onChange={setPopupOn} label="Combos on hover" />
          </div>
        </div>

        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 text-xs font-bold tracking-wider text-muted uppercase">Library</div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Segmented size="sm" value={env} options={[{ value: 'Live', label: 'Live' }, { value: 'Online', label: 'Online' }]} onChange={setEnv} />
            <Segmented size="sm" value={stack} options={[{ value: '100BB', label: '100 BB' }, { value: '200BB', label: '200 BB' }]} onChange={setStack} />
          </div>
          {tree.length === 0 && <div className="text-xs text-faint">No charts for this filter.</div>}
          <div className="space-y-0.5">
            {tree.map(({ scenario, items }) => {
              const open = openFolders.has(scenario);
              return (
                <div key={scenario}>
                  <button
                    type="button"
                    onClick={() =>
                      setOpenFolders((s) => {
                        const n = new Set(s);
                        if (n.has(scenario)) n.delete(scenario);
                        else n.add(scenario);
                        return n;
                      })
                    }
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-surface-2"
                  >
                    <span className="w-3 text-xs text-faint">{open ? '▾' : '▸'}</span>
                    <span className="flex-1">{scenario}</span>
                    <span className="text-xs text-faint">{items.length}</span>
                  </button>
                  {open && (
                    <div className="mb-1 ml-5 space-y-0.5">
                      {items.map((e) => {
                        const active = sameRef(e.ref, selected);
                        return (
                          <button
                            key={refKey(e.ref)}
                            type="button"
                            title={e.label}
                            onClick={() => select(e.ref)}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
                              active ? 'bg-surface-3 text-ink ring-1 ring-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
                            }`}
                          >
                            <span className="flex-1 truncate">{e.positions.join(' / ')}</span>
                            {e.ref.kind === 'mine' && <span className="rounded bg-accent px-1.5 text-[10px] font-bold text-accent-ink">MINE</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* The chart */}
      <main className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {/* Same box for both, so the page doesn't shift when a library chart becomes yours. */}
            <input
              key={refKey(current.ref)}
              defaultValue={current.label}
              readOnly={current.ref.kind === 'library'}
              onBlur={(e) => e.target.value.trim() && e.target.value !== current.label && rename(e.target.value.trim())}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={`w-[460px] max-w-full rounded-md border border-transparent bg-transparent px-1 text-xl font-bold focus:outline-none ${
                current.ref.kind === 'mine' ? 'hover:border-line focus:border-accent' : 'cursor-default'
              }`}
              aria-label="Chart name"
            />
            <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted">
              <span className={`rounded px-1.5 py-0.5 font-bold ${current.ref.kind === 'mine' ? 'bg-accent text-accent-ink' : 'bg-surface-3 text-ink'}`}>
                {current.ref.kind === 'mine' ? 'MINE' : 'LIBRARY'}
              </span>
              <span>{current.scenario}</span>·<span>{current.positions.join(' / ')}</span>·<span>{current.stack.replace('BB', ' BB')}</span>·
              <span>
                {current.playerType} {current.env.toLowerCase()}
              </span>
              {basedOn && <span className="text-faint">· copy of “{basedOn.label}”</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={undo} disabled={history.length === 0} title="Ctrl+Z">
              ↶ Undo
            </Button>
            <Button variant="secondary" onClick={() => change(emptyChart())}>
              Clear
            </Button>
            <Button variant="secondary" onClick={() => setTextOpen(true)}>
              Text…
            </Button>
            <select
              value={compare}
              onChange={(e) => setCompare(e.target.value)}
              className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-sm text-ink"
              aria-label="Compare with"
            >
              <option value="">Compare with…</option>
              {SCENARIOS.map((s) => {
                const list = entries.filter((e) => e.scenario === s && !sameRef(e.ref, selected));
                return list.length ? (
                  <optgroup key={s} label={s}>
                    {list.map((e) => (
                      <option key={refKey(e.ref)} value={refKey(e.ref)}>
                        {e.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            {current.ref.kind === 'mine' &&
              (confirmDelete ? (
                <Button variant="danger" onClick={remove}>
                  Really delete?
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              ))}
          </div>
        </div>

        {/* Always one line, so the grid never moves (the first stroke on a library chart switches to the copy). */}
        <div className="truncate rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-muted">
          {current.ref.kind === 'library'
            ? 'Library chart. Painting on it makes your own copy; the library stays as it is.'
            : 'Your chart: every change is saved. Ctrl+Z undoes.'}
        </div>

        <div className="flex gap-4">
          <div className="space-y-2" style={{ width: gridWidth }}>
            <RangeGrid
              fills={fills}
              onPaint={paint}
              onPaintEnd={() => persist(chartRef.current)}
              onHover={(cell, x, y) => setHover(cell === null ? null : { cell, x, y, compare: false })}
              cursor={smart ? 'crosshair' : 'pointer'}
            />
            <StatsBar chart={chart} />
          </div>
          {compareEntry && compareFills && (
            <div className="space-y-2" style={{ width: gridWidth }}>
              <RangeGrid fills={compareFills} dimmed onHover={(cell, x, y) => setHover(cell === null ? null : { cell, x, y, compare: true })} />
              <StatsBar chart={compareEntry.chart} />
              <div className="truncate text-center text-xs text-muted">{compareEntry.label}</div>
            </div>
          )}
        </div>
      </main>

      {popupOn && hover && (
        <ComboPopup cell={hover.cell} mix={(hover.compare && compareEntry ? compareEntry.chart : chart)[hover.cell]!} x={hover.x} y={hover.y} />
      )}
      {textOpen && <RangeTextModal chart={chart} brush={brush} onPaint={paintShares} onClose={() => setTextOpen(false)} />}
    </div>
  );
}
