import { useEffect, useMemo, useRef, useState } from 'react';
import { parseCard } from '../../core/cards';
import { levelUp, makeQuestion, streak, today, updateReview } from '../../core/quiz/daily';
import type { ChipDef, Scene } from '../../core/quiz/stack';
import { grade, QUIZ_INFO, type Given, type Grade, type QuizId, type Question } from '../../core/quiz/types';
import { PlayingCard } from '../cards/PlayingCard';
import { Button, Modal, inputClass } from '../controls';
import { CURRENCIES, formatAmount, parseAmount } from '../format';
import { useToast } from '../toast';
import { ChipLegend, ChipScene } from './ChipStack';
import { GridPainter } from './GridPainter';
import { addAttempt, allAttempts, loadDays, loadState, saveState } from './quizStore';

export type QuizSource = { kind: 'daily'; questions: Question[] } | { kind: 'practice'; quiz: QuizId; level: number };

/** An amount in the question's currency (or a plain number). */
function show(q: Question, v: number): string {
  if (q.unit === '%') return `${Math.round(v * 10) / 10} %`;
  if (q.money) return formatAmount(Math.round(v), q.money, 1);
  return `${v}${q.unit ? ` ${q.unit}` : ''}`;
}

function Cards({ label, cards }: { label: string; cards: string[] }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-muted">{label}</div>
      <div className="flex gap-1">
        {cards.map((c) => (
          <PlayingCard key={c} card={parseCard(c)} width="3.2rem" />
        ))}
      </div>
    </div>
  );
}

/** What the question shows: the chips, the cards, the hand. */
function Visual({ q }: { q: Question }) {
  const d = q.data;
  if (Array.isArray(d.scenes)) {
    const chips = d.chips as ChipDef[];
    const scenes = d.scenes as Scene[];
    return (
      <div className="space-y-3">
        <div className="rounded-xl p-3" style={{ background: 'radial-gradient(ellipse at center, #1f6b45 0%, #0f3d27 75%)' }}>
          <div className={`grid gap-4 ${scenes.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {scenes.map((s, i) => (
              <ChipScene key={i} scene={s} chips={chips} label={s.label} />
            ))}
          </div>
        </div>
        <ChipLegend chips={chips} format={(v) => (q.money ? formatAmount(v, q.money, 1) : String(v))} />
      </div>
    );
  }
  if (typeof d.hand === 'string') {
    return <div className="text-center text-5xl font-black tracking-tight">{d.hand}</div>;
  }
  if (d.stats) {
    const st = d.stats as { hands: number; vpip: number; pfr: number; threeBet: number; af: number };
    const cell = (k: string, v: string) => (
      <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
        <div className="text-[10px] font-semibold tracking-wider text-muted uppercase">{k}</div>
        <div className="text-2xl font-black">{v}</div>
      </div>
    );
    return (
      <div className="grid grid-cols-4 gap-2">
        {cell('VPIP', `${st.vpip}`)}
        {cell('PFR', `${st.pfr}`)}
        {cell('3-bet', `${st.threeBet}`)}
        {cell('AF', `${st.af}`)}
      </div>
    );
  }
  if (d.board || d.hero) {
    return (
      <div className="flex flex-wrap items-end gap-5">
        {Array.isArray(d.hero) && <Cards label="You" cards={d.hero as string[]} />}
        {Array.isArray(d.villain) && <Cards label="Him" cards={d.villain as string[]} />}
        {Array.isArray(d.board) && <Cards label="Board" cards={d.board as string[]} />}
      </div>
    );
  }
  return null;
}

/**
 * One quiz run: the day's set, or practice at a level (questions without end). Each answer is
 * graded at once with the why, saved to your account, missed ones come back later, and 8 of the
 * last 10 right moves you up a level.
 */
export function QuizRunner({ source, onClose }: { source: QuizSource; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState(loadState);
  const first = (): Question | null =>
    source.kind === 'daily' ? (source.questions[0] ?? null) : makeQuestion(source.quiz, source.level, state, Math.random);
  const [q, setQ] = useState<Question | null>(first);
  const [index, setIndex] = useState(0);
  const [given, setGiven] = useState<Given | null>(null);
  const [result, setResult] = useState<Grade | null>(null);
  const [text, setText] = useState('');
  const [multi, setMulti] = useState<string[]>([]);
  const [score, setScore] = useState({ right: 0, done: 0 });
  const started = useRef(Date.now());
  // a question from the review queue (a miss coming back), as it was when the question came up
  const [again, setAgain] = useState(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    started.current = Date.now();
    setAgain(!!q && loadState().review.some((r) => r.id === q.id));
    setGiven(null);
    setResult(null);
    setText('');
    setMulti([]);
  }, [q?.id]);
  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  const title = source.kind === 'daily' ? `Today's set` : `${QUIZ_INFO[source.quiz].name} · level ${source.level}`;

  const answer = (g: Given) => {
    if (!q || result) return;
    const r = grade(q, g);
    setGiven(g);
    setResult(r);
    setScore((s) => ({ right: s.right + (r.correct ? 1 : 0), done: s.done + 1 }));
    addAttempt({
      at: new Date().toISOString(),
      qid: q.id,
      quiz: q.quiz,
      type: q.type,
      level: q.level,
      correct: r.correct,
      ...(r.error !== undefined ? { error: Math.round(r.error * 1000) / 1000 } : {}),
      ms: Date.now() - started.current,
      // a painted chart is 169 cells: keep the score (error), not the painting
      given: g.kind === 'grid' ? { kind: 'grid', cells: [] } : g,
      ...(source.kind === 'daily' ? { daily: true } : {}),
    });
    let next = { ...state, review: updateReview(state.review, q, r.correct) };
    if (q.level === state.levels[q.quiz]) {
      const up = levelUp(allAttempts(), q.quiz, q.level);
      if (up) {
        next = { ...next, levels: { ...next.levels, [q.quiz]: up } };
        toast({ text: `Level up: ${QUIZ_INFO[q.quiz].name} → ${up} (${QUIZ_INFO[q.quiz].levelNames[up - 1]})` });
      }
    }
    setState(next);
    saveState(next);
  };

  const next = () => {
    if (source.kind === 'daily') {
      const i = index + 1;
      setIndex(i);
      setQ(source.questions[i] ?? null);
    } else {
      setQ(makeQuestion(source.quiz, source.kind === 'practice' ? Math.max(source.level, q?.level ?? 1) : 1, state, Math.random));
    }
  };

  const submitNumber = () => {
    if (!q || !text.trim()) return;
    const v = q.money ? parseAmount(text, q.money) : Number(text.replace(',', '.'));
    if (v === null || !Number.isFinite(v)) return;
    answer({ kind: 'number', value: v });
  };

  const done = !q;
  const days = useMemo(() => (done ? loadDays() : []), [done]);

  return (
    <Modal kind="page" title={title} onClose={onClose}>
      {done ? (
        <div className="space-y-4 text-center">
          <div className="text-4xl font-black">
            {score.right} / {score.done}
          </div>
          <p className="text-muted">{source.kind === 'daily' ? "Today's set is done." : 'Practice over.'}</p>
          {source.kind === 'daily' && <p className="text-lg">🔥 {streak(days, today())} day streak</p>}
          <Button variant="primary" onClick={onClose}>
            Back to the Gym
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
            <span>
              {QUIZ_INFO[q.quiz].name} · level {q.level}
              {again && ' · missed before'}
            </span>
            <span>
              {source.kind === 'daily' ? `${index + 1} of ${source.questions.length}` : `${score.right} of ${score.done} right`}
            </span>
          </div>
          <Visual q={q} />
          <h2 className="text-lg font-semibold">{q.prompt}</h2>

          {/* the answer */}
          <div data-quiz-answer>
          {q.answer.kind === 'choice' && q.choices && (
            <div className="grid gap-2 sm:grid-cols-2">
              {q.choices.map((c) => {
                const chosen = given?.kind === 'choice' && given.id === c.id;
                const right = result && q.answer.kind === 'choice' && q.answer.id === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={!!result}
                    onClick={() => answer({ kind: 'choice', id: c.id })}
                    className={`min-h-12 rounded-lg border px-4 py-2 text-left text-base ${right ? 'border-ok bg-ok/15 font-semibold' : chosen ? 'border-danger bg-danger/10' : 'border-line bg-surface-2 hover:border-accent'}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
          {q.answer.kind === 'multi' && q.choices && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {q.choices.map((c) => {
                  const on = multi.includes(c.id);
                  const right = result && q.answer.kind === 'multi' && q.answer.ids.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={!!result}
                      onClick={() => setMulti(c.id === 'none' ? (on ? [] : ['none']) : on ? multi.filter((x) => x !== c.id) : [...multi.filter((x) => x !== 'none'), c.id])}
                      className={`min-h-11 rounded-lg border px-3 py-2 text-sm ${result ? (right ? 'border-ok bg-ok/15' : on ? 'border-danger bg-danger/10' : 'border-line') : on ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface-2'}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              {!result && (
                <Button variant="primary" disabled={!multi.length} onClick={() => answer({ kind: 'multi', ids: multi })}>
                  Answer
                </Button>
              )}
            </div>
          )}
          {q.answer.kind === 'grid' && q.choices && (
            <GridPainter key={q.id} buckets={q.choices} answer={result && q.answer.kind === 'grid' ? q.answer.cells : undefined} onSubmit={(cells) => answer({ kind: 'grid', cells })} />
          )}
          {q.answer.kind === 'number' && !result && (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submitNumber();
              }}
            >
              <div className="w-40">
                <div className="relative">
                  {q.money && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted">{CURRENCIES.find((c) => c.code === q.money?.code)?.symbol}</span>}
                  <input autoFocus inputMode="decimal" className={`${inputClass} ${q.money ? 'pl-7' : ''}`} value={text} onChange={(e) => setText(e.target.value)} aria-label="Your answer" />
                </div>
              </div>
              {!q.money && q.unit && <span className="text-sm text-muted">{q.unit}</span>}
              <Button variant="primary" onClick={submitNumber}>
                Answer
              </Button>
            </form>
          )}
          </div>

          {result && (
            <div className={`space-y-2 rounded-lg border p-4 ${result.correct ? 'border-ok/60 bg-ok/10' : 'border-danger/60 bg-danger/10'}`}>
              <div className="text-base font-bold">{result.correct ? '✓ Right' : '✗ Not quite'}</div>
              {q.answer.kind === 'grid' && result.error !== undefined && (
                <div className="text-sm">{Math.round((1 - result.error) * 100)} % of the played combos right (80 % to pass)</div>
              )}
              {q.answer.kind === 'number' && given?.kind === 'number' && (
                <div className="text-sm">
                  Answer {show(q, q.answer.value)} · yours {show(q, given.value)}
                  {result.error !== undefined && q.answer.value !== 0 && <span className="text-muted"> ({Math.round(result.error * 100)} % off)</span>}
                </div>
              )}
              <p className="text-sm text-ink/90">{q.explain}</p>
              <div className="flex gap-2 pt-1">
                <Button variant="primary" onClick={next}>
                  <span ref={nextRef as never} tabIndex={-1} />
                  {source.kind === 'daily' && index + 1 >= source.questions.length ? 'Finish' : 'Next →'}
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Stop
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
