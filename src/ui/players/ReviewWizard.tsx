import { useState } from 'react';
import { QUESTIONS } from '../../core/players/questions';
import { leadsLevel, limpTrapLevel, pairJamLevel, SLIDER_INFO, SLIDERS, type StyleSettings } from '../../core/players/style';
import { askOptions, oldAnswerLabel } from '../../core/players/versions';
import { Button, Modal } from '../controls';
import { playerTypeColor } from '../playerTypes';
import { gradeBadge, gradeLabel } from './gradeColor';
import { playerSettings, profileById, reviewPlayer, type SavedPlayer, type SavedProfile } from './store';

const LIMP_TRAP = ['never', 'with a monster', 'often'];
const LEADS = ['never', 'rarely', 'sometimes', 'often'];
const PAIR_JAM = ['never', 'now and then', 'very often'];

/** What moves from one style to another: sliders (with their grades), the open size, the switches. */
function moves(a: StyleSettings, b: StyleSettings): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (const id of SLIDERS) {
    if (a.sliders[id] === b.sliders[id]) continue;
    out.push(
      <span key={id} className="inline-flex items-center gap-1">
        {SLIDER_INFO[id].label}
        <Badge v={a.sliders[id]} />→<Badge v={b.sliders[id]} />
      </span>,
    );
  }
  if (a.openBB !== b.openBB) out.push(<span key="open">Opens {a.openBB ?? 'as his type'} → {b.openBB ?? 'as his type'} BB</span>);
  if (limpTrapLevel(a.limpTrap) !== limpTrapLevel(b.limpTrap)) out.push(<span key="trap">Limp-reraises {LIMP_TRAP[limpTrapLevel(a.limpTrap)]} → {LIMP_TRAP[limpTrapLevel(b.limpTrap)]}</span>);
  if (leadsLevel(a.leads) !== leadsLevel(b.leads)) out.push(<span key="leads">Leads {LEADS[leadsLevel(a.leads)]} → {LEADS[leadsLevel(b.leads)]}</span>);
  if (pairJamLevel(a.pairJam) !== pairJamLevel(b.pairJam)) out.push(<span key="jam">Check-raise all-in with a pair {PAIR_JAM[pairJamLevel(a.pairJam)]} → {PAIR_JAM[pairJamLevel(b.pairJam)]}</span>);
  return out;
}

const Badge = ({ v }: { v: number }) => (
  <span className="rounded px-1 text-[11px] font-bold tabular-nums" style={gradeBadge(v)}>
    {gradeLabel(v)}
  </span>
);

/**
 * After the questions changed: the old answers that fit more than one new answer, player by
 * player, one question at a time. The best guess is marked (one tap); every answer shows what it
 * moves on his sliders. Each tap is saved at once, so "Later" keeps what is done.
 */
export function ReviewWizard({
  players,
  profiles,
  onSave,
  onClose,
}: {
  players: SavedPlayer[];
  profiles: SavedProfile[];
  onSave: (p: SavedPlayer) => void;
  onClose: () => void;
}) {
  // fixed when it opens: the players as they were and every question to ask
  const [start] = useState(() => Object.fromEntries(players.map((p) => [p.id, p])));
  const [steps] = useState(() => players.flatMap((p) => (p.review ?? []).map((ask) => ({ id: p.id, ask }))));
  const [choices, setChoices] = useState<(string | null | undefined)[]>([]);
  const [i, setI] = useState(0);

  /** A player with the choices made so far (from where he was, so going back and choosing again is clean). */
  const withChoices = (id: string, made: (string | null | undefined)[]) =>
    steps.reduce((pl, s, k) => (s.id === id && made[k] !== undefined ? reviewPlayer(pl, s.ask, made[k]!, profiles) : pl), start[id]!);

  const step = steps[i];
  // him without this step's answer (going back shows the choice again, not on top of itself)
  const player = step ? withChoices(step.id, choices.map((c, k) => (k === i ? undefined : c))) : null;
  const now = player ? playerSettings(player, profiles) : null;

  const choose = (choice: string | null) => {
    if (!step) return;
    const made = [...choices];
    made[i] = choice;
    setChoices(made);
    onSave(withChoices(step.id, made));
    setI(i + 1);
  };

  if (!step || !player || !now) {
    return (
      <Modal kind="page" title="Changed questions" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <p className="text-sm">All reviewed: {players.length} player{players.length === 1 ? '' : 's'} on the new questions.</p>
      </Modal>
    );
  }

  const q = QUESTIONS.find((x) => x.id === step.ask.q)!;
  const fits = askOptions(step.ask);
  const guess = choices[i] !== undefined ? choices[i] : fits[0];
  const profile = profileById(player.profileId, profiles);

  return (
    <Modal
      kind="page"
      title={`Changed questions · ${i + 1} of ${steps.length}`}
      onClose={onClose}
      wide
      footer={
        <>
          {i > 0 && (
            <Button variant="ghost" onClick={() => setI(i - 1)}>
              ← Back
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} title="What you answered so far is saved">
            Later
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: playerTypeColor(profile.settings.base) ?? 'transparent' }} />
          <span className="text-lg font-bold">{player.name}</span>
          <span className="text-xs text-muted">{profile.name}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" aria-label="His sliders now">
          {SLIDERS.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">
              {SLIDER_INFO[id].label}
              <Badge v={now.sliders[id]} />
            </span>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">{q.sets}</div>
          <h3 className="text-lg font-semibold">{q.text}</h3>
          <p className="mt-1 text-sm text-muted">
            You answered: <b className="text-ink">{oldAnswerLabel(step.ask.q, step.ask.old, step.ask.from)}</b> - the new answers split that.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map((o) => {
            const fit = fits.includes(o.id);
            const after = playerSettings(reviewPlayer(player, step.ask, o.id, profiles), profiles);
            const moved = moves(now, after);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  guess === o.id ? 'border-accent bg-surface-3 ring-1 ring-accent' : fit ? 'border-line bg-surface-2 hover:border-muted' : 'border-line bg-surface opacity-75 hover:opacity-100'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{o.label}</span>
                  {guess === o.id && <span className="shrink-0 rounded bg-accent px-1.5 text-[10px] font-bold text-accent-ink uppercase">{choices[i] !== undefined ? 'Your answer' : 'Best guess'}</span>}
                  {guess !== o.id && fit && <span className="shrink-0 text-[10px] text-faint uppercase">fits your answer</span>}
                </div>
                {o.hint && <div className="text-xs text-muted">{o.hint}</div>}
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">{moved.length ? moved : <span className="text-faint">nothing moves</span>}</div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => choose(null)}
            className={`rounded-lg border border-dashed px-4 py-3 text-left text-sm ${guess === null ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink'}`}
          >
            Don’t know
            <div className="text-xs text-faint">The answer goes; his sliders stay as they are.</div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
