import { useMemo, useRef, useState } from 'react';
import { matchAdvice, type PlaybookEntry } from '../../core/advice/playbook';
import { spotTags, type SpotTags } from '../../core/advice/spot';
import type { TableState } from '../../core/engine/state';
import type { SeatNo } from '../../core/hand/types';
import { usePlaybook } from './usePlaybook';

/** What drives the opponent, in plain words and a color: fear red, greed amber, ego violet... */
const MOTIVES: Record<string, { label: string; color: string }> = {
  'fear-outdrawn': { label: 'fear of being outdrawn', color: '#ef4444' },
  'fear-check-through': { label: 'fear it checks through', color: '#f87171' },
  'fear-tough-decision': { label: 'fear of a tough decision', color: '#fb7185' },
  'greed-value': { label: 'greed', color: '#f59e0b' },
  'loss-aversion': { label: 'loss aversion', color: '#60a5fa' },
  'protect-win': { label: 'protecting a win', color: '#38bdf8' },
  'chasing-losses': { label: 'chasing losses', color: '#fb923c' },
  embarrassment: { label: 'embarrassment', color: '#a78bfa' },
  logic: { label: 'logic', color: '#94a3b8' },
  other: { label: 'other', color: '#94a3b8' },
};

/** The moment in words, so you can see why this advice shows up. */
function momentText(t: SpotTags): string {
  const parts = [
    t.street[0],
    t.pot[0] === 'srp' ? '' : t.pot[0],
    t.players[0] === 'multiway' ? 'multiway' : '',
    t.position[0]?.toUpperCase(),
    t.decision[0] === 'first' ? 'first to act' : t.decision[0] === 'facing-raise' ? 'facing a raise' : 'facing a bet',
    t.size[0] ? `${t.size[0]} bet` : '',
    ...t.line.map((l) => l.replace(/-/g, ' ')),
    ...t.board.filter((b) => b.startsWith('scare') || b === 'wet' || b === 'static' || b === 'paired' || b === 'monotone'),
    t.villain.length ? `vs ${t.villain.join('/')}` : '',
    ...t.status,
  ];
  return parts.filter(Boolean).join(' · ');
}

function Entry({ e }: { e: PlaybookEntry }) {
  const [open, setOpen] = useState(false);
  const m = e.motive ? MOTIVES[e.motive] : undefined;
  const first = e.sources.find((s) => s.url);
  return (
    <li className="rounded-md border border-line bg-surface-2 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-ink">{e.title}</div>
        {m && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: m.color, background: `${m.color}22` }} title="What drives the opponent">
            {m.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-ink">{e.advice}</p>
      {e.read && <p className="mt-1 text-muted">{e.read}</p>}
      {e.said && <p className="mt-1 text-muted italic">“{e.said}”</p>}
      {e.caveat && <p className="mt-1 text-xs text-faint">But: {e.caveat}</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
        <span>
          {e.strength} video{e.strength === 1 ? '' : 's'}
        </span>
        {first && (
          <a href={first.url} target="_blank" rel="noreferrer" className="text-accent hover:underline" title={first.title}>
            ▶ {first.speaker && first.speaker !== 'unknown' ? `${first.speaker}, ` : ''}watch the moment
          </a>
        )}
        {e.sources.length > 1 && (
          <button type="button" className="hover:text-ink" onClick={() => setOpen((o) => !o)}>
            {open ? 'fewer sources' : `all ${e.sources.length} sources`}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-1.5 space-y-1 text-xs text-muted">
          {e.sources.map((s) => (
            <li key={s.claim}>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  {s.title ?? s.video}
                </a>
              ) : (
                (s.title ?? s.video)
              )}
              {s.speaker && s.speaker !== 'unknown' ? ` · ${s.speaker}` : ''}
              {s.quote && <span className="block text-faint italic">“{s.quote}”</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * "HHP says": the playbook's advice for the player to act at this moment (the words of
 * core/advice/spot.ts, matched against each entry's `when`).
 */
export function AdvicePanel({ state, seat }: { state: TableState; seat: SeatNo }) {
  const { playbook, load, clear } = usePlaybook();
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const tags = useMemo(() => spotTags(state, seat), [state, seat]);
  const matches = useMemo(() => (playbook ? matchAdvice(playbook.entries, tags, 3) : []), [playbook, tags]);
  const name = state.seats.find((s) => s.seat === seat)?.name;

  const picker = (
    <input
      ref={file}
      type="file"
      accept=".json,application/json"
      className="hidden"
      onChange={async (ev) => {
        const f = ev.target.files?.[0];
        ev.target.value = '';
        if (!f) return;
        try {
          setError(null);
          await load(f);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }}
    />
  );

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-bold tracking-wider text-muted uppercase">HHP says{name ? ` to ${name}` : ''}</div>
        {playbook && (
          <span className="text-[11px] text-faint">
            {playbook.entries.length} entries ·{' '}
            <button type="button" className="hover:text-ink" onClick={() => file.current?.click()}>
              replace
            </button>{' '}
            ·{' '}
            <button type="button" className="hover:text-ink" onClick={() => void clear()}>
              remove
            </button>
          </span>
        )}
      </div>
      <div className="mb-2 text-xs text-faint">{momentText(tags)}</div>
      {picker}
      {playbook === undefined ? (
        <p className="text-muted">Loading the playbook…</p>
      ) : !playbook ? (
        <p className="text-muted">
          Load your playbook (the Strategy Bible's <code>playbook</code> file) to see what Hungry Horse Poker says at this moment of the hand.{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => file.current?.click()}>
            Load playbook…
          </button>
        </p>
      ) : matches.length === 0 ? (
        <p className="text-muted">Nothing in the playbook for exactly this moment.</p>
      ) : (
        <ul className="space-y-2">
          {matches.map((m) => (
            <Entry key={m.entry.id} e={m.entry} />
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
