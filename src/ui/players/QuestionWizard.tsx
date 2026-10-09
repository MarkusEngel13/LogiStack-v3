import { useMemo, useState } from 'react';
import { STYLES } from '../../core/motives/preflop';
import { applyAnswers, handsPlayed, nearest, QUESTIONS, tableSizeOf, type Answers } from '../../core/players/questions';
import { SIZING_INFO, SLIDER_INFO, SLIDERS, stepLabel, stylePreflop, type StyleSettings } from '../../core/players/style';
import { Button, Field, inputClass, Modal, TextInput } from '../controls';
import { allCharts } from '../ranges/charts';
import { builtInId, overridesFrom, playerSettings, profileById, type SavedPlayer, type SavedProfile } from './store';

/**
 * "Ask me questions": what you have seen a player do, one question at a time, turned into
 * sliders. Then the profile nearest to the answers, and the player saved on it with the sliders
 * that differ. Opened for a new player, or to re-check one (his last answers filled in).
 */
export function QuestionWizard({
  player,
  profiles,
  onSave,
  onClose,
}: {
  /** A player to re-check; none for a new one. */
  player?: SavedPlayer;
  profiles: SavedProfile[];
  onSave: (p: SavedPlayer) => void;
  onClose: () => void;
}) {
  const charts = useMemo(allCharts, []);
  const preflopOf = (s: StyleSettings) => stylePreflop(s, STYLES);
  const [name, setName] = useState(player?.name ?? '');
  const [answers, setAnswers] = useState<Answers>(player?.answers ?? {});
  // step 0: who; 1..n: the questions; n+1: the result
  const [step, setStep] = useState(player ? 1 : 0);
  const last = QUESTIONS.length + 1;

  // the answers on top of a neutral start (Unknown), to find the nearest profile
  const fromScratch = useMemo(() => applyAnswers(answers, profileById(builtInId('Unknown'), profiles).settings, charts, preflopOf), [answers, profiles, charts]);
  const suggested = useMemo(() => nearest(fromScratch, profiles), [fromScratch, profiles]);
  const [chosenId, setChosenId] = useState<string | null>(null);
  // a re-check keeps his profile unless you pick another; a new player starts on the closest one
  const profileId = chosenId ?? player?.profileId ?? suggested?.id ?? builtInId('Unknown');
  const profile = profileById(profileId, profiles);
  // re-checking on the same profile starts from his current sliders, so hand-tuned ones you skip stay
  const start = player && profileId === player.profileId ? playerSettings(player, profiles) : profile.settings;
  const result = useMemo(() => applyAnswers(answers, start, charts, preflopOf), [answers, start, charts]);

  const answer = (q: string, a: string | null) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (a === null) delete next[q];
      else next[q] = a;
      return next;
    });
    setStep((s) => Math.min(last, s + 1));
  };

  const save = () => {
    const overrides = overridesFrom(result, profile.settings);
    onSave({
      ...(player ?? { id: crypto.randomUUID(), notes: '' }),
      name: name.trim() || 'New player',
      profileId,
      overrides,
      answers,
    });
  };

  const q = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1]! : null;
  const n = tableSizeOf(answers);
  const regShare = useMemo(() => handsPlayed(STYLES.Reg!, charts, n), [charts, n]);
  const answered = Object.keys(answers).length;

  return (
    <Modal
      title={player ? `Re-check ${player.name}` : 'New player: what have you seen him do?'}
      onClose={onClose}
      wide
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
              ← Back
            </Button>
          )}
          <div className="flex-1" />
          {step === 0 && (
            <Button variant="primary" onClick={() => setStep(1)}>
              Start
            </Button>
          )}
          {q && step > 0 && (
            <Button variant="ghost" onClick={() => setStep(last)}>
              Skip to the result
            </Button>
          )}
          {step === last && (
            <Button variant="primary" onClick={save}>
              Save {name.trim() || 'player'}
            </Button>
          )}
        </>
      }
    >
      {step > 0 && (
        <div className="mb-5 flex gap-1" aria-label={`Question ${Math.min(step, QUESTIONS.length)} of ${QUESTIONS.length}`}>
          {QUESTIONS.map((x, i) => (
            <button
              key={x.id}
              type="button"
              title={x.sets}
              onClick={() => setStep(i + 1)}
              className={`h-1.5 flex-1 rounded-full ${i + 1 === step ? 'bg-accent' : answers[x.id] ? 'bg-ok' : 'bg-surface-3'}`}
            />
          ))}
          <button type="button" title="Result" onClick={() => setStep(last)} className={`h-1.5 w-6 rounded-full ${step === last ? 'bg-accent' : 'bg-surface-3'}`} />
        </div>
      )}

      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-muted">
            A few questions about what you have seen him do at the table. Answer what you know and skip the rest with “Don’t know”: those parts come from the profile
            that fits him best. You can fine-tune the sliders afterwards.
          </p>
          <Field label="Name">
            <TextInput value={name} onChange={setName} placeholder="Dan" />
          </Field>
        </div>
      )}

      {q && (
        <div>
          <div className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
            {step}/{QUESTIONS.length} · {q.sets}
          </div>
          <h3 className="text-lg font-semibold">{q.text}</h3>
          {q.help && <p className="mt-1 text-sm text-muted">{q.help}</p>}
          {q.id === 'hands' && (
            <p className="mt-1 text-sm text-faint">
              For comparison: at a {n}-handed table a solid player plays about {Math.round(regShare * 100)} % of hands (1 in {Math.round(1 / regShare)}).
            </p>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {q.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => answer(q.id, o.id)}
                className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                  answers[q.id] === o.id ? 'border-accent bg-surface-3' : 'border-line bg-surface-2 hover:border-muted hover:bg-surface-3'
                }`}
              >
                <div className="text-sm font-semibold">{o.label}</div>
                {o.hint && <div className="text-xs text-muted">{o.hint}</div>}
              </button>
            ))}
            <button
              type="button"
              onClick={() => answer(q.id, null)}
              className={`rounded-lg border border-dashed px-4 py-3 text-left text-sm ${
                answers[q.id] === undefined ? 'border-muted text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              Don’t know
              <div className="text-xs text-faint">{q.id === 'table' ? 'Assumes 9-handed.' : 'Comes from the profile.'}</div>
            </button>
          </div>
        </div>
      )}

      {step === last && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <TextInput value={name} onChange={setName} placeholder="Dan" />
            </Field>
            <Field
              label="Profile"
              hint={
                suggested && suggested.id === profileId
                  ? `Closest to your answers: ${suggested.name}. What you didn’t answer comes from it.`
                  : `Closest to your answers: ${suggested?.name ?? '—'}.`
              }
            >
              <select className={inputClass} value={profileId} onChange={(e) => setChosenId(e.target.value)}>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.builtIn ? '' : ` (${p.settings.base})`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-sm text-muted">
            {answered === 0 ? 'No answers: he plays exactly like the profile.' : `${answered} of ${QUESTIONS.length} answered.`}
          </p>
          <div className="divide-y divide-line rounded-lg border border-line">
            {SLIDERS.map((id) => {
              const v = result.sliders[id];
              const moved = v !== profile.settings.sliders[id];
              return (
                <div key={id} className="grid grid-cols-[150px_40px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2 text-sm">
                  <span className="text-muted">{SLIDER_INFO[id].label}</span>
                  <span className={`font-bold tabular-nums ${moved ? 'text-accent' : ''}`}>{v}</span>
                  <span className="text-xs text-muted">{stepLabel(id, v)}</span>
                </div>
              );
            })}
            <div className="px-4 py-2 text-xs text-muted">
              Bet sizes: {SIZING_INFO[result.sizing].label}
              {result.limpTrap && ' · limp-reraises premiums'}
              {result.leads && ' · leads into the raiser'}
            </div>
          </div>
          <p className="text-xs text-faint">Orange: set by your answers. After saving, the Players page shows what the bot does with this style, so you can check it against him.</p>
        </div>
      )}
    </Modal>
  );
}
