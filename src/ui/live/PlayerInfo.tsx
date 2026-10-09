import { useMemo, useState } from 'react';
import { STYLES } from '../../core/motives/preflop';
import type { HandRecord, SeatNo } from '../../core/hand/types';
import { applyAnswers, openBand, QUESTIONS, QUESTIONS_VERSION, tableSizeId, type Answers } from '../../core/players/questions';
import { SLIDER_INFO, SLIDERS, stylePreflop, type StyleSettings } from '../../core/players/style';
import { Button, inputClass } from '../controls';
import { playerTypeColor } from '../playerTypes';
import { gradeBadge, gradeLabel } from '../players/gradeColor';
import { styleSummary } from '../players/SavedPlayerPicker';
import { builtInId, loadPlayers, loadProfiles, overridesFrom, playerSettings, profileById, savePlayer, seatStyleOfPlayer, type SavedPlayer } from '../players/store';
import { allCharts } from '../ranges/charts';
import type { Relink } from './SeenShowdown';

/** The questions in a few words each, for one-tap answers at the table. */
const SHORT: Record<string, string> = {
  hands: 'Hands he plays',
  firstIn: 'First in, he…',
  open: 'His raise size (BB)',
  openTell: 'Raise size by hand',
  threeBet: '3-bets',
  limpTrap: 'Limp-reraises',
  postflop: 'Without the initiative',
  cbet: 'C-bets when checked to',
  leads: 'Donk-bets into the raiser',
  sticky: 'Top pair, you bet 3 streets',
  respect: 'One pair vs a big river bet',
  bluffs: 'River bluffs',
  sizing: 'His bet sizes',
};
const PREFLOP = ['hands', 'firstIn', 'open', 'openTell', 'threeBet', 'limpTrap'];
const HAND_SHARES = [15, 20, 25, 30, 40, 50, 60, 70, 80];
/** Raise sizes as you see them: an exact number (the wizard asks in bands). */
const OPEN_SIZES = [2, 2.5, 3, 4, 5, 6, 7, 8, 10];
const OPTION_SHORT: Record<string, string> = {
  'firstIn:limp': 'Calls / limps',
  'firstIn:mix': 'A mix',
  'firstIn:raise': 'Raises',
  'openTell:strong': 'Bigger with strong',
  'openTell:weak': 'Bigger with weak',
  'limpTrap:monster': 'With a monster',
  'limpTrap:often': 'Often',
  'postflop:passive': 'Checks & calls',
  'postflop:fair': 'Average',
  'postflop:lots': 'Bets a lot',
  'postflop:always': 'Bets/raises always',
};

const Grade = ({ v }: { v: number }) => (
  <span className="rounded px-1 text-xs font-bold tabular-nums" style={gradeBadge(v)}>
    {gradeLabel(v)}
  </span>
);

/** The sliders your answers move, in their grade colours ("Loose 3 → 4"). */
function Moves({ before, after }: { before: StyleSettings; after: StyleSettings }) {
  const moved = SLIDERS.filter((id) => before.sliders[id] !== after.sliders[id]);
  if (moved.length === 0) return <p className="text-xs text-faint">His sliders stay where they are.</p>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted" aria-label="What moves">
      {moved.map((id) => (
        <span key={id} className="inline-flex items-center gap-1">
          {SLIDER_INFO[id].label} <Grade v={before.sliders[id]} />→<Grade v={after.sliders[id]} />
        </span>
      ))}
    </div>
  );
}

/**
 * ✎ on the live screen: what you see a player do, told to the app as it happens - "plays 70 %,
 * calls or min-raises". The same questions as the player wizard, one tap per answer; saving moves
 * his sliders straight away (from where they are, so earlier changes stay) and keeps a log.
 */
export function PlayerInfo({ hand, onClose, onSaved }: { hand: HandRecord; onClose: () => void; onSaved: (relinks: Relink[], name: string) => void }) {
  const seats = hand.players.filter((p) => p.seat !== hand.hero && !p.sittingOut);
  const charts = useMemo(allCharts, []);
  const { players, profiles } = useMemo(() => ({ players: loadPlayers(), profiles: loadProfiles() }), []);
  const [seat, setSeat] = useState<SeatNo | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [more, setMore] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const p = seat !== null ? hand.players.find((x) => x.seat === seat)! : null;
  const saved = p?.style?.playerId ? players.find((x) => x.id === p.style!.playerId) : undefined;
  const dealt = hand.players.filter((x) => !x.sittingOut).length;
  const preflopOf = (s: StyleSettings) => stylePreflop(s, STYLES);

  const pickSeat = (s: SeatNo) => {
    setSeat(s);
    setAnswers({});
    setNote('');
    setName(hand.players.find((x) => x.seat === s)?.name ?? '');
  };
  const answer = (q: string, a: string) => setAnswers((x) => (x[q] === a ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== q)) : { ...x, [q]: a }));

  /**
   * Today's answers to apply, at this table's size. Preflop aggression comes from the first-in
   * habit and the 3-bets together, so one told now goes with the other told earlier (alone, a
   * 3-bet answer would step again from where the earlier one had put him).
   */
  const toApply = (earlier: Answers | undefined): Answers => {
    const a: Answers = { ...answers, table: tableSizeId(dealt) };
    if (a.firstIn || a.threeBet) for (const q of ['firstIn', 'threeBet']) if (!a[q] && earlier?.[q]) a[q] = earlier[q]!;
    return a;
  };

  const save = () => {
    if (!p || seat === null) return;
    const base: SavedPlayer = saved ?? {
      id: crypto.randomUUID(),
      name: name.trim() || p.name,
      profileId: p.style?.profileId ?? builtInId(p.playerType || 'Unknown'),
      overrides: {},
    };
    const profile = profileById(base.profileId, profiles);
    const result = applyAnswers(toApply(base.answers), playerSettings(base, profiles), charts, preflopOf);
    const at = new Date().toISOString();
    const day = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    // an old answer still waiting for the review that you just answered fresh needs no review
    const review = base.review?.filter((a) => answers[a.q] === undefined);
    const next: SavedPlayer = {
      ...base,
      overrides: overridesFrom(result, profile.settings),
      answers: { ...(base.answers ?? {}), ...answers },
      answersVersion: QUESTIONS_VERSION,
      ...(review ? { review } : {}),
      observed: [...(base.observed ?? []), ...Object.entries(answers).map(([q, a]) => ({ at, q, a }))],
      ...(note.trim() ? { notes: [base.notes?.trim(), `${day}: ${note.trim()}`].filter(Boolean).join('\n') } : {}),
    };
    savePlayer(next);
    onSaved([{ seat, name: next.name, style: seatStyleOfPlayer(next, loadProfiles()) }], next.name);
  };

  // what the answers so far move on his sliders
  const before = useMemo(() => {
    if (!p) return null;
    const pl = saved ?? { id: '', name: '', profileId: p.style?.profileId ?? builtInId(p.playerType || 'Unknown'), overrides: {} };
    return playerSettings(pl, profiles);
  }, [p, saved, profiles]);
  const after = useMemo(
    () => (before && Object.keys(answers).length ? applyAnswers(toApply(saved?.answers), before, charts, preflopOf) : null),
    [before, answers, saved, dealt, charts],
  );

  const shown = QUESTIONS.filter((q) => q.id !== 'table' && (more || PREFLOP.includes(q.id)));
  const old = saved?.answers ?? {};
  const count = Object.keys(answers).length + (note.trim() ? 1 : 0);
  const choices = (id: string) =>
    id === 'hands'
      ? HAND_SHARES.map((n) => ({ id: `pct${n}`, label: `${n}%${n === 80 ? '+' : ''}` }))
      : id === 'open'
        ? OPEN_SIZES.map((n) => ({ id: String(n), label: n === 2 ? 'Min 2' : `${n}${n === 10 ? '+' : ''}` }))
        : (QUESTIONS.find((q) => q.id === id)?.options ?? []);
  // an earlier answer: the same one, or (raise size) the band it falls in
  const earlier = (q: string, a: string) => old[q] === a || (q === 'open' && old.open !== undefined && openBand(Number(a)) === old.open);

  return (
    <div className="space-y-4 rounded-xl border border-accent/40 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">✎ What I see him do</h2>
        <Button variant="ghost" onClick={onClose} className="!px-2">
          ✕
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {seats.map((x) => (
          <button
            key={x.seat}
            type="button"
            onClick={() => pickSeat(x.seat)}
            className={`min-h-11 truncate rounded-lg border px-2 py-1.5 text-left text-xs font-semibold ${seat === x.seat ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface-2 text-muted'}`}
            style={{ borderLeft: `4px solid ${playerTypeColor(x.playerType) ?? 'var(--color-line)'}` }}
          >
            {x.name}
          </button>
        ))}
      </div>

      {p && (
        <>
          <div className="text-xs text-muted">
            {saved ? (
              <>Now: {p.style ? styleSummary(seatStyleOfPlayer(saved, profiles)) : p.playerType}</>
            ) : (
              <>
                Not one of your players yet: he’ll be saved as
                <input className={`${inputClass} mt-1`} value={name} onChange={(e) => setName(e.target.value)} aria-label="His name" />
              </>
            )}
          </div>

          {shown.map((q) => (
            <section key={q.id} className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted">{SHORT[q.id] ?? q.sets}</h3>
              <div className="flex flex-wrap gap-1">
                {choices(q.id).map((o) => {
                  const on = answers[q.id] === o.id;
                  const was = !on && earlier(q.id, o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => answer(q.id, o.id)}
                      title={was ? 'Your earlier answer' : undefined}
                      className={`min-h-10 rounded-md border px-2.5 py-1 text-sm ${on ? 'border-accent bg-accent font-semibold text-accent-ink' : was ? 'border-accent/50 bg-surface-2 text-ink' : 'border-line bg-surface-2 text-ink'}`}
                    >
                      {OPTION_SHORT[`${q.id}:${o.id}`] ?? o.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <button type="button" className="text-sm text-muted underline" onClick={() => setMore((m) => !m)}>
            {more ? 'Only preflop' : 'More: after the flop'}
          </button>
          <textarea className={`${inputClass} min-h-14`} placeholder="Note (optional): a tell, a habit…" value={note} onChange={(e) => setNote(e.target.value)} />
          {before && after && <Moves before={before} after={after} />}
          <Button variant="primary" className="w-full !py-3" disabled={count === 0} onClick={save}>
            Save to {saved?.name ?? (name.trim() || p.name)}
          </Button>
        </>
      )}
    </div>
  );
}
