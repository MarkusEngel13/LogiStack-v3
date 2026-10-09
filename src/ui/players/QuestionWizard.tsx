import { useMemo, useState } from 'react';
import { STYLES } from '../../core/motives/preflop';
import { answerLabel, applyAnswers, handsPlayed, QUESTIONS, QUESTIONS_VERSION, tableSizeOf, type Answers } from '../../core/players/questions';
import { SIZING_INFO, SLIDER_INFO, SLIDERS, stepLabel, stylePreflop, type StyleSettings } from '../../core/players/style';
import { askOptions, oldAnswerLabel } from '../../core/players/versions';
import { Button, Field, inputClass, Modal, TextInput } from '../controls';
import { allCharts } from '../ranges/charts';
import { gradeBadge, gradeLabel, gradeText } from './gradeColor';
import { specials } from './SavedPlayerPicker';
import { builtInId, overridesFrom, playerSettings, profileById, type SavedPlayer, type SavedProfile } from './store';
import { TypeFit, useTypeFit } from './TypeFit';

/**
 * "Ask me questions": what you have seen a player do, one question at a time, turned into
 * sliders. Then the type that fits the answers (core/players/classify.ts: the family before the
 * flop, then the postflop sliders), and the player saved on it with the sliders that differ.
 * Opened for a new player, or to re-check one (his last answers filled in; an old answer the
 * changed questions couldn't map comes as the best guess, marked).
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
  // his old answers the changed questions couldn't map: their best guess, until you answer them
  const pending = useMemo(() => Object.fromEntries((player?.review ?? []).map((a) => [a.q, a])), [player]);
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...(player?.answers ?? {}),
    ...Object.fromEntries((player?.review ?? []).map((a) => [a.q, askOptions(a)[0]!]).filter(([, g]) => g)),
  }));
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  // step 0: who; 1..n: the questions; n+1: the result
  const [step, setStep] = useState(player ? 1 : 0);
  const last = QUESTIONS.length + 1;

  // the answers on top of a neutral start (Unknown), to find the type that fits
  const fromScratch = useMemo(() => applyAnswers(answers, profileById(builtInId('Unknown'), profiles).settings, charts, preflopOf), [answers, profiles, charts]);
  const fit = useTypeFit(fromScratch, profiles);
  const suggested = fit.best[0] ?? null;
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
    setConfirmed((c) => new Set(c).add(q));
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
      answersVersion: QUESTIONS_VERSION,
      // every question was in front of you: nothing left to review
      review: undefined,
    });
  };

  const q = step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1]! : null;
  const n = tableSizeOf(answers);
  const regShare = useMemo(() => handsPlayed(STYLES.Reg!, charts, n), [charts, n]);
  const answered = Object.keys(answers).length;
  const ask = q && !confirmed.has(q.id) ? pending[q.id] : undefined;
  // an answer told at the table that no option shows ("70 % of hands", "2.5 BB")
  const told = q && answers[q.id] !== undefined && !q.options.some((o) => o.id === answers[q.id]) ? answerLabel(q.id, answers[q.id]!) : null;

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
              className={`h-1.5 flex-1 rounded-full ${i + 1 === step ? 'bg-accent' : pending[x.id] && !confirmed.has(x.id) ? 'bg-warn' : answers[x.id] ? 'bg-ok' : 'bg-surface-3'}`}
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
          {ask && (
            <p className="mt-2 rounded-md border border-warn/50 px-3 py-2 text-sm">
              This question changed. You answered <b>{oldAnswerLabel(ask.q, ask.old, ask.from)}</b>; the best guess is marked.
            </p>
          )}
          {told && <p className="mt-2 text-sm text-muted">Told at the table: <b className="text-ink">{told}</b>. An answer below replaces it.</p>}
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
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">{o.label}</span>
                  {ask && answers[q.id] === o.id && <span className="shrink-0 text-[10px] font-bold text-warn uppercase">Best guess</span>}
                </div>
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
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  Fits your answers: <TypeFit match={fit} />
                  {fit.best.length > 1 && (
                    <span className="flex flex-wrap gap-1">
                      {fit.best.map((p) => (
                        <button key={p.id} type="button" className="rounded border border-line px-1.5 text-[11px] text-muted hover:text-ink" onClick={() => setChosenId(p.id)}>
                          {p.name}
                        </button>
                      ))}
                    </span>
                  )}
                  {suggested && suggested.id === profileId && fit.best.length === 1 && <span>What you didn’t answer comes from it.</span>}
                  {suggested && suggested.id !== profileId && fit.best.length === 1 && (
                    <button type="button" className="rounded border border-line px-1.5 text-[11px] text-muted hover:text-ink" onClick={() => setChosenId(suggested.id)}>
                      Use {suggested.name}
                    </button>
                  )}
                </span>
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
                <div key={id} className="grid grid-cols-[minmax(0,130px)_44px_minmax(0,1fr)] items-baseline gap-3 px-4 py-2 text-sm sm:grid-cols-[150px_44px_minmax(0,1fr)]">
                  <span className="text-muted">{SLIDER_INFO[id].label}</span>
                  <span
                    className={`justify-self-start rounded px-1.5 font-bold tabular-nums ${moved ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`}
                    style={gradeBadge(v)}
                  >
                    {gradeLabel(v)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: gradeText(v) }}>
                    {stepLabel(id, v)}
                  </span>
                </div>
              );
            })}
            <div className="px-4 py-2 text-xs text-muted">
              Bet sizes: {SIZING_INFO[result.sizing].label}
              {specials(result).map((x) => ` · ${x}`)}
            </div>
          </div>
          <p className="text-xs text-faint">Outlined: set by your answers. After saving, the Players page shows what the bot does with this style, so you can check it against him.</p>
        </div>
      )}
    </Modal>
  );
}
