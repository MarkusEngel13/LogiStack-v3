import { useMemo, useState } from 'react';
import { DAILY_SIZE, statsOf, streak, today } from '../../core/quiz/daily';
import { QUIZZES, QUIZ_INFO, type QuizId } from '../../core/quiz/types';
import { Button, Section } from '../controls';
import { ChipLegend } from './ChipStack';
import { ChipSetEditor } from './ChipSetEditor';
import { QuizRunner, type QuizSource } from './QuizRunner';
import { allAttempts, loadDays, loadState, openInSet, saveState, todayRecord } from './quizStore';
import { formatAmount } from '../format';

const ICON: Record<QuizId, string> = { stack: '🪙', maths: '🧮', ranges: '🎯', draws: '🃏', build: '🧱', board: '🗺️', reads: '🕵️' };

/** The Gym's quizzes: today's set of ten, your streak, and each quiz to practise at your level. */
export function QuizHome() {
  const [state, setState] = useState(loadState);
  const [run, setRun] = useState<QuizSource | null>(null);
  const [chips, setChips] = useState(false);
  const [tick, setTick] = useState(0); // re-read after a run
  const { day, days, stats } = useMemo(() => {
    void tick;
    const s = loadState();
    return { day: todayRecord(s), days: loadDays(), stats: statsOf(allAttempts()) };
  }, [tick]);
  const open = openInSet(day);
  const doneCount = day.set.length - open.length;
  const fire = streak(days, today());

  const close = () => {
    setRun(null);
    setState(loadState());
    setTick((t) => t + 1);
  };

  return (
    <div className="space-y-5">
      <Section title="Today">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">
              {open.length === 0 ? `Done: ${day.attempts.filter((a) => a.daily && a.correct).length} of ${day.set.length} right` : `${doneCount} of ${day.set.length || DAILY_SIZE} done`}
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-accent" style={{ width: `${(100 * doneCount) / (day.set.length || DAILY_SIZE)}%` }} />
            </div>
            <div className="mt-1 text-xs text-muted">
              {fire > 0 ? `🔥 ${fire} day${fire > 1 ? 's' : ''} in a row` : 'Ten questions a day, from every quiz; the ones you missed come back.'}
            </div>
          </div>
          {open.length > 0 && (
            <Button variant="primary" onClick={() => setRun({ kind: 'daily', questions: open })}>
              {doneCount ? '▶ Continue' : "▶ Start today's set"}
            </Button>
          )}
        </div>
      </Section>

      <Section title="Practise">
        <ul className="grid gap-3 sm:grid-cols-2">
          {QUIZZES.map((quiz) => {
            const info = QUIZ_INFO[quiz];
            const level = state.levels[quiz];
            const st = stats[quiz];
            return (
              <li key={quiz} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {ICON[quiz]} {info.name}
                    </div>
                    <div className="text-xs text-muted">{info.what}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold">
                    {level} / {info.levels}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {info.levelNames[level - 1]}
                  {st.answered > 0 && ` · ${Math.round((100 * st.correct) / st.answered)} % right of ${st.answered}`}
                  {st.medianError !== undefined && ` · usually ${Math.round(st.medianError * 100)} % off`}
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                  {Array.from({ length: info.levels }, (_, i) => i + 1).map((l) => (
                    <Button key={l} variant={l === level ? 'primary' : 'secondary'} disabled={l > level} title={l > level ? 'Get 8 of 10 right on the level below' : info.levelNames[l - 1]} onClick={() => setRun({ kind: 'practice', quiz, level: l })}>
                      {l === level ? `▶ Level ${l}` : l}
                    </Button>
                  ))}
                  {quiz === 'stack' && (
                    <Button variant="ghost" onClick={() => setChips(true)} title="The colours and values of your chips">
                      Your chips
                    </Button>
                  )}
                </div>
                {quiz === 'stack' && <ChipLegend chips={state.chipSet.chips} format={(v) => formatAmount(v, state.chipSet.currency, 1)} />}
              </li>
            );
          })}
        </ul>
      </Section>

      {run && <QuizRunner source={run} onClose={close} />}
      {chips && (
        <ChipSetEditor
          value={state.chipSet}
          onClose={() => setChips(false)}
          onSave={(chipSet) => {
            const next = { ...loadState(), chipSet };
            saveState(next);
            setState(next);
          }}
        />
      )}
    </div>
  );
}
