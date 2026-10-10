import { useEffect, useMemo, useRef, useState } from 'react';
import { LIBRARY, SCENARIOS, TEN_MAX_POSITIONS, type LibraryRange, type Scenario } from '../../core/ranges/library';
import { chartFromCells, emptyChart, foldOf, type ActionMix, type Chart } from '../../core/ranges/range';
import { Button, Field, inputClass, Modal, RangeSlider, Segmented, Toggle } from '../controls';
import { setBrushAction, smartPaintCells } from './brush';
import { copyLabel, copyOfLibrary, sameChart, savedMine } from './draft';
import { deleteMyRange, loadMyRanges, saveMyRange, type MyRange } from './myRanges';
import { ACTION_COLORS, ACTION_LABELS, chartSegments, RangeGrid } from './RangeGrid';
import { ComboPopup, StatsBar } from './RangeParts';
import { RangeTextModal } from './RangeTextModal';
import { useUnsavedGuard } from './unsavedGuard';

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

/** On a phone (below md) the chart comes first and the brush and the list sit under it. */
const PHONE = '(max-width: 767px)';
/** Smaller buttons on a phone, so the chart's tools take two rows, not four. */
const TIGHT = 'max-md:!px-2.5 max-md:!py-1.5';

const chipClass = (active: boolean, big = false) =>
  `rounded border px-2 text-xs ${big ? 'py-1.5' : 'py-1'} ${active ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`;

function BrushPresets({ brush, onPick, big }: { brush: ActionMix; onPick: (mix: ActionMix) => void; big?: boolean }) {
  return (
    <>
      {BRUSH_PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onPick(p.mix)}
          className={chipClass(p.mix.allin === brush.allin && p.mix.raise === brush.raise && p.mix.call === brush.call, big)}
        >
          {p.label}
        </button>
      ))}
    </>
  );
}

/**
 * Preflop ranges: v2's chart editor. Pick a chart in the library tree, paint with the brush
 * (click or drag; Smart Paint fills a hand and everything better in its line). What you paint is
 * a draft until Save: on your chart Save stores it; on a library chart Save asks for a name and
 * keeps it as a chart of yours (the library never changes). Discard goes back to the saved chart.
 */
export function RangesPage() {
  const [mine, setMine] = useState<MyRange[]>(loadMyRanges);
  const entries = useMemo(() => [...LIBRARY.map(fromLibrary), ...mine.map(fromMine)], [mine]);
  const find = (ref: Ref) => entries.find((e) => sameRef(e.ref, ref));

  const [selected, setSelected] = useState<Ref>(DEFAULT_REF);
  const current = find(selected) ?? entries[0]!;
  const isLibrary = current.ref.kind === 'library';
  const [chart, setChart] = useState<Chart>(current.chart);
  const [history, setHistory] = useState<Chart[]>([]);
  /** The draft differs from the saved chart (the pill; Save and Discard). */
  const unsaved = !sameChart(chart, current.chart);

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
  /** Save · Discard · Cancel before leaving the chart; `then` = where to go after Save or Discard. */
  const [ask, setAsk] = useState<{ then: () => void } | null>(null);
  /** The name of a library chart's copy, asked by Save; `then` as above. */
  const [naming, setNaming] = useState<{ label: string; then?: () => void } | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  // Latest values for handlers that run between renders (strokes, undo, the questions' answers).
  const chartRef = useRef(chart);
  chartRef.current = chart;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const mainRef = useRef<HTMLElement>(null);

  // another module, or closing the tab, with unsaved changes: ask first
  useUnsavedGuard(unsaved, (go) => setAsk({ then: go }));

  const open = (ref: Ref) => {
    const e = find(ref);
    if (!e) return;
    selectedRef.current = ref;
    setSelected(ref);
    chartRef.current = e.chart;
    setChart(e.chart);
    setHistory([]);
    setConfirmDelete(false);
    setSaveFailed(false);
    // on a phone the list sits under the chart: bring the chart back into view
    if (window.matchMedia(PHONE).matches) mainRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  /** Another chart from the list: straight away, or after Save · Discard · Cancel. */
  const pick = (ref: Ref) => {
    if (sameRef(ref, selected)) return;
    if (unsaved) setAsk({ then: () => open(ref) });
    else open(ref);
  };

  /** Save onto your chart; a library chart first asks for the name of your copy. */
  const save = (then?: () => void) => {
    setAsk(null);
    if (isLibrary) {
      setNaming({ label: copyLabel(current.label), then });
      return;
    }
    const existing = loadMyRanges().find((m) => m.id === current.ref.id);
    if (!existing || !saveMyRange(savedMine(existing, chartRef.current, new Date().toISOString()))) {
      setSaveFailed(true);
      return;
    }
    setMine(loadMyRanges());
    setSaveFailed(false);
    then?.();
  };

  /** A library chart's draft becomes a new chart of yours, which stays open. */
  const saveCopy = (label: string, then?: () => void) => {
    const copy = copyOfLibrary({ ...current, id: current.ref.id }, chartRef.current, label, crypto.randomUUID(), new Date().toISOString());
    setNaming(null);
    if (!saveMyRange(copy)) {
      setSaveFailed(true);
      return;
    }
    setMine(loadMyRanges());
    const ref: Ref = { kind: 'mine', id: copy.id };
    selectedRef.current = ref;
    setSelected(ref);
    setSaveFailed(false);
    then?.();
  };

  /**
   * Keep the chart as it is now for Undo. Read here, not inside the state update: that may run
   * only at the next render, when the stroke has already moved chartRef on.
   */
  const remember = () => {
    const before = chartRef.current;
    setHistory((h) => [...h.slice(-99), before]);
  };

  /** Back to the saved chart; Undo brings the draft back. */
  const discard = () => {
    remember();
    chartRef.current = current.chart;
    setChart(current.chart);
    setSaveFailed(false);
  };

  const change = (next: Chart) => {
    remember();
    chartRef.current = next;
    setChart(next);
  };

  const paint = (cell: number, first: boolean) => {
    if (first) remember();
    else if (smart) return; // Smart Paint fills from the clicked hand only
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
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const dialog = ask || naming || textOpen;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault(); // never the browser's "save page" here
        if (unsaved && !dialog) save();
      } else if (key === 'z' && !dialog && !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) {
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

  /** The name of your chart is stored at once; the cells wait for Save. */
  const rename = (label: string) => {
    const existing = loadMyRanges().find((m) => m.id === selected.id);
    if (!existing) return;
    saveMyRange({ ...existing, label, updatedAt: new Date().toISOString() });
    setMine(loadMyRanges());
  };

  const remove = () => {
    const back = current.basedOn ? find({ kind: 'library', id: current.basedOn }) : undefined;
    deleteMyRange(selected.id);
    setMine(loadMyRanges());
    const target = back ?? fromLibrary(LIBRARY[0]!);
    selectedRef.current = target.ref;
    setSelected(target.ref);
    chartRef.current = target.chart;
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

  // a phone: the full width (13 cells of ~27 px); larger: as high as the window allows, never under
  // 320 px. A wide screen has the tools in a column on the right, so the grid starts under the menu
  // and only the totals bar sits under it (160 px for the menu, the bar and the margins).
  // There the page is as wide as it needs (main's width below, never wider than the window) and
  // the grids fill main's left part: the tools always sit right beside them, the page centred.
  const gridWidth = compareEntry
    ? 'w-full md:w-[min(calc(50%_-_8px),max(calc(100vh_-_300px),320px))] xl:w-[calc(50%_-_8px)]'
    : 'w-full md:w-[min(100%,max(calc(100vh_-_300px),320px))] xl:w-full';
  // the grid(s) as tall as the window allows, plus the tools column (270 px) and its gap (24 px);
  // at most the window less the sidebar, the gaps and the margins
  const mainWidth = compareEntry
    ? 'xl:w-[min(calc(2_*_max(100vh_-_160px,320px)_+_310px),calc(100vw_-_380px))]'
    : 'xl:w-[min(calc(max(100vh_-_160px,320px)_+_294px),calc(100vw_-_380px))]';

  return (
    <div className="mx-auto grid max-w-[1500px] gap-5 px-3 py-3 sm:px-6 sm:py-5 md:grid-cols-[290px_minmax(0,1fr)] xl:w-fit xl:max-w-none">

      {/* Sidebar: brush, then the library (on a phone: under the chart) */}
      <aside className="order-2 space-y-4 md:order-none">
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 text-xs font-bold tracking-wider text-muted uppercase">Brush</div>
          <div className="space-y-2.5">
            {(['allin', 'raise', 'call'] as const).map((a) => (
              <label key={a} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-xs font-semibold text-muted">{ACTION_LABELS[a]}</span>
                <RangeSlider
                  min={0}
                  max={100}
                  step={5}
                  value={brush[a]}
                  onChange={(v) => setBrush((b) => setBrushAction(b, a, v))}
                  style={{ accentColor: ACTION_COLORS[a] }}
                  label={`${ACTION_LABELS[a]} %`}
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
            <BrushPresets brush={brush} onPick={setBrush} />
          </div>
          <div className="mt-4 space-y-2.5 border-t border-line pt-3">
            <Toggle checked={smart} onChange={setSmart} label="Smart Paint" hint="A hand and every better one in its line." />
            {/* a finger has no hover */}
            <div className="pointer-coarse:hidden">
              <Toggle checked={popupOn} onChange={setPopupOn} label="Combos on hover" />
            </div>
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
                            onClick={() => pick(e.ref)}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
                              active ? 'bg-surface-3 text-ink ring-1 ring-accent' : 'text-muted hover:bg-surface-2 hover:text-ink'
                            }`}
                          >
                            <span className="flex-1 truncate">{e.positions.join(' / ')}</span>
                            {active && unsaved && <span className="text-xs text-warn" title="Unsaved">●</span>}
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

      {/* The chart (on a phone: first). A wide screen: the grid on the left, the tools in a column on its right. */}
      <main ref={mainRef} className={`order-1 min-w-0 scroll-mt-28 space-y-3 md:order-none xl:grid xl:grid-cols-[minmax(0,1fr)_270px] xl:items-start xl:gap-6 xl:space-y-0 ${mainWidth}`}>
        <div className="space-y-3 xl:order-2">
        <div className="flex flex-wrap items-start justify-between gap-3 xl:flex-col xl:flex-nowrap xl:items-stretch xl:justify-start">
          <div className="min-w-0 max-md:w-full">
            {/* A fixed row, so the tools beside it never jump; the box is as wide as the name where the browser can (the pill right after it). */}
            <div className="flex w-[460px] max-w-full items-center gap-2">
              <input
                key={refKey(current.ref)}
                defaultValue={current.label}
                readOnly={isLibrary}
                onBlur={(e) => e.target.value.trim() && e.target.value !== current.label && rename(e.target.value.trim())}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className={`w-full min-w-0 rounded-md border border-transparent bg-transparent px-1 text-lg font-bold [field-sizing:content] focus:outline-none supports-[field-sizing:content]:w-auto md:text-xl ${
                  isLibrary ? 'cursor-default' : 'hover:border-line focus:border-accent'
                }`}
                aria-label="Chart name"
              />
              {unsaved && (
                <span className="shrink-0 rounded-full border border-warn px-2 py-0.5 text-xs font-semibold text-warn" title="The chart differs from the saved one">
                  Unsaved
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted">
              <span className={`rounded px-1.5 py-0.5 font-bold ${isLibrary ? 'bg-surface-3 text-ink' : 'bg-accent text-accent-ink'}`}>
                {isLibrary ? 'LIBRARY' : 'MINE'}
              </span>
              <span>{current.scenario}</span>·<span>{current.positions.join(' / ')}</span>·<span>{current.stack.replace('BB', ' BB')}</span>·
              <span>
                {current.playerType} {current.env.toLowerCase()}
              </span>
              {basedOn && <span className="text-faint">· copy of “{basedOn.label}”</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2 xl:grid xl:grid-cols-2">
            <Button variant="secondary" onClick={undo} disabled={history.length === 0} title="Ctrl+Z" className={TIGHT}>
              ↶ Undo
            </Button>
            <Button variant="secondary" onClick={discard} disabled={!unsaved} title="Back to the saved chart" className={TIGHT}>
              Discard
            </Button>
            <Button variant="primary" onClick={() => save()} disabled={!unsaved} title={isLibrary ? 'Keep it as your own chart (Ctrl+S)' : 'Ctrl+S'} className={TIGHT}>
              {isLibrary ? 'Save…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={() => change(emptyChart())} className={TIGHT}>
              Clear
            </Button>
            <Button variant="secondary" onClick={() => setTextOpen(true)} className={TIGHT}>
              Text…
            </Button>
            <select
              value={compare}
              onChange={(e) => setCompare(e.target.value)}
              className="max-w-full rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-sm text-ink md:py-2 xl:col-span-2 xl:w-full xl:min-w-0"
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
            {!isLibrary &&
              (confirmDelete ? (
                <Button variant="danger" onClick={remove} className={TIGHT}>
                  Really delete?
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmDelete(true)} className={TIGHT}>
                  Delete
                </Button>
              ))}
          </div>
        </div>

        {/* One line, so the grid never moves (in the tools column it wraps: nothing moves there); a phone keeps the room for the chart (unless saving failed). */}
        <div className={`truncate rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm xl:whitespace-normal ${saveFailed ? 'text-danger' : 'text-muted max-md:hidden'}`}>
          {saveFailed
            ? 'Not saved: this browser would not store it (storage full or blocked).'
            : isLibrary
              ? 'Library chart. Paint on it; Save keeps it as your own chart, the library stays as it is.'
              : 'Your chart. Changes are a draft until Save; Discard goes back. Ctrl+Z undoes.'}
        </div>
        </div>

        <div className="space-y-3 xl:order-1">

        {/* On a phone the brush card is under the chart: its presets and Smart Paint are here too. */}
        <div className="flex flex-wrap items-center gap-1.5 md:hidden">
          <BrushPresets brush={brush} onPick={setBrush} big />
          <button type="button" aria-pressed={smart} onClick={() => setSmart(!smart)} className={chipClass(smart, true)}>
            Smart Paint
          </button>
        </div>

        <div className="flex flex-col gap-4 md:flex-row">
          <div className={`space-y-2 ${gridWidth}`}>
            <RangeGrid
              fills={fills}
              onPaint={paint}
              onHover={(cell, x, y) => setHover(cell === null ? null : { cell, x, y, compare: false })}
              cursor={smart ? 'crosshair' : 'pointer'}
            />
            <StatsBar chart={chart} />
          </div>
          {compareEntry && compareFills && (
            <div className={`space-y-2 ${gridWidth}`}>
              <RangeGrid fills={compareFills} dimmed onHover={(cell, x, y) => setHover(cell === null ? null : { cell, x, y, compare: true })} />
              <StatsBar chart={compareEntry.chart} />
              <div className="truncate text-center text-xs text-muted">{compareEntry.label}</div>
            </div>
          )}
        </div>
        </div>
      </main>

      {popupOn && hover && (
        <ComboPopup cell={hover.cell} mix={(hover.compare && compareEntry ? compareEntry.chart : chart)[hover.cell]!} x={hover.x} y={hover.y} />
      )}
      {textOpen && <RangeTextModal chart={chart} brush={brush} onPaint={paintShares} onClose={() => setTextOpen(false)} />}

      {ask && (
        <Modal
          kind="dialog"
          title="Unsaved changes"
          onClose={() => setAsk(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setAsk(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setAsk(null);
                  discard();
                  ask.then();
                }}
              >
                Discard
              </Button>
              <Button variant="primary" onClick={() => save(ask.then)}>
                {isLibrary ? 'Save…' : 'Save'}
              </Button>
            </>
          }
        >
          <p className="text-sm">
            “{current.label}” has changes that are not saved.
            {isLibrary && ' Save keeps them as your own chart; the library chart stays as it is.'}
          </p>
        </Modal>
      )}

      {naming && (
        <Modal
          kind="dialog"
          title="Save as your own chart"
          onClose={() => setNaming(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setNaming(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => saveCopy(naming.label, naming.then)}>
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Name">
              <input
                autoFocus
                value={naming.label}
                onChange={(e) => setNaming({ ...naming, label: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && saveCopy(naming.label, naming.then)}
                className={inputClass}
                aria-label="Name of your chart"
              />
            </Field>
            <p className="text-xs text-faint">The library chart “{current.label}” stays as it is.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
