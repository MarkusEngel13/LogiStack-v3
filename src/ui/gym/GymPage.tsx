import { useMemo, useState } from 'react';
import { sessions, type Session } from '../../core/hand/sessions';
import type { HandRecord } from '../../core/hand/types';
import { Button, Section, Segmented } from '../controls';
import { addFishy, deleteFishy, loadFishy } from '../fishy';
import { useToast } from '../toast';
import { formatAmount } from '../format';
import { loadHands } from '../library';
import { gymTable, type GymMode } from './gymTables';
import { QuizHome } from '../quiz/QuizHome';

/**
 * The Gym: bots of mixed types to watch (every seat, cards face up, hand after hand) or to play
 * against (you in seat 1, the bots on the others), 6 or 9 seats; your sessions against them and
 * the bot moves you flagged.
 */
export function GymPage({ onStart, onOpen }: { onStart: (hand: HandRecord, mode: GymMode) => void; onOpen: (hand: HandRecord) => void }) {
  const [size, setSize] = useState<6 | 9>(() => {
    try {
      return localStorage.getItem('logistack.gymSize') === '9' ? 9 : 6;
    } catch {
      return 6;
    }
  });
  const [hands] = useState(loadHands);
  const [fishy, setFishy] = useState(loadFishy);
  const toast = useToast();
  const sessionList = useMemo(() => sessions(hands), [hands]);
  const pickSize = (n: 6 | 9) => {
    setSize(n);
    try {
      localStorage.setItem('logistack.gymSize', String(n));
    } catch {
      // storage blocked: the size is only kept until the page closes
    }
  };
  const start = (mode: GymMode) => onStart(gymTable(mode, size), mode);
  const [tab, setTab] = useState<'bots' | 'quiz'>(() => {
    try {
      return localStorage.getItem('logistack.gymTab') === 'quiz' ? 'quiz' : 'bots';
    } catch {
      return 'bots';
    }
  });
  const pickTab = (t: 'bots' | 'quiz') => {
    setTab(t);
    try {
      localStorage.setItem('logistack.gymTab', t);
    } catch {
      // storage blocked: the tab is only kept until the page closes
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 px-3 py-5 sm:px-6 sm:py-6">
      <div>
        <h1 className="text-xl font-bold">Gym</h1>
        <p className="text-xs text-muted">{tab === 'bots' ? 'Bots of mixed types: watch how each one plays, or sit down and play against them.' : 'Quick drills: stacks, table maths, ranges, draws. Results are saved to your account.'}</p>
      </div>
      <Segmented value={tab} options={[{ value: 'bots', label: '🤖 Play · Watch' }, { value: 'quiz', label: '🧠 Quizzes' }]} onChange={pickTab} />
      {tab === 'quiz' ? (
        <QuizHome />
      ) : (
        <>
      <Section title="A table of bots">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented size="sm" value={size} options={[{ value: 6, label: '6-max' }, { value: 9, label: '9-max' }]} onChange={pickSize} />
          <Button variant="secondary" onClick={() => start('watch')} title="Bots on every seat, cards face up, hand after hand">
            👀 Watch the bots
          </Button>
          <Button variant="primary" onClick={() => start('play')} title="You in seat 1, the bots on the other seats">
            ▶ Play against them
          </Button>
        </div>
      </Section>
      {sessionList.length > 0 && (
        <Section title="Sessions">
          <p className="mb-3 text-xs text-muted">Hands you played one after another (“Deal next hand”), and how Hero did.</p>
          <ul className="space-y-2">
            {sessionList.map((s) => (
              <SessionRow key={s.id} s={s} fishy={fishy.filter((m) => s.hands.some((x) => x.hand.id === m.handId)).length} onOpen={onOpen} />
            ))}
          </ul>
        </Section>
      )}
      {fishy.length > 0 && (
        <Section title="Smells fishy">
          <p className="mb-2 text-xs text-muted">Bot moves you flagged while watching or playing - cases for calibrating the model.</p>
          <ul className="space-y-2">
            {[...fishy].reverse().map((m) => {
              const h = hands.find((x) => x.id === m.handId);
              return (
                <li key={m.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface-2 px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="min-w-0 sm:flex-1">
                    <div className="font-semibold">🐟 {m.note || '(no note)'}</div>
                    <div className="text-xs text-muted">
                      {m.move} · hand #{m.handNo ?? '?'} · {new Date(m.at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {h && (
                      <Button variant="secondary" className="!px-2.5 !py-1 text-xs" onClick={() => onOpen(h)}>
                        Open hand
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      className="!px-2.5 !py-1 text-xs"
                      onClick={() => {
                        deleteFishy(m.id);
                        setFishy(loadFishy());
                        toast({
                          text: 'Mark removed',
                          undo: () => {
                            addFishy(m);
                            setFishy(loadFishy());
                          },
                        });
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}
        </>
      )}
    </div>
  );
}

function SessionRow({ s, fishy, onOpen }: { s: Session; fishy: number; onOpen: (h: HandRecord) => void }) {
  const first = s.hands[0]?.hand;
  const money = (v: number) => (first ? formatAmount(v, first.table.currency, first.table.blinds.bb) : String(v));
  const sign = (v: number) => (v > 0 ? '+' : '');
  return (
    <li className="rounded-md border border-line bg-surface-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="font-semibold">{s.name}</div>
          <div className="text-xs text-muted">
            {new Date(s.at).toLocaleString()} · {s.hands.length} hands{s.unfinished ? ` (+${s.unfinished} unfinished)` : ''}
            {fishy > 0 && ` · 🐟 ${fishy} flagged`}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold tabular-nums ${s.net > 0 ? 'text-ok' : s.net < 0 ? 'text-danger' : ''}`}>
            {sign(s.net)}
            {money(s.net)}
          </div>
          <div className="text-xs text-muted tabular-nums">
            {sign(s.netBB)}
            {s.netBB.toFixed(1)} BB · {sign(s.bbPer100)}
            {s.bbPer100.toFixed(0)} bb/100
          </div>
        </div>
      </div>
      {(s.best || s.worst) && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {s.best && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onOpen(s.best!.hand)}>
              Best: #{s.best.hand.handNo ?? '?'} ({sign(s.best.netBB)}
              {s.best.netBB.toFixed(1)} BB)
            </Button>
          )}
          {s.worst && (
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => onOpen(s.worst!.hand)}>
              Worst: #{s.worst.hand.handNo ?? '?'} ({s.worst.netBB.toFixed(1)} BB)
            </Button>
          )}
        </div>
      )}
      <p className="mt-1 text-[11px] text-faint">Over few hands the result is mostly luck: a hundred hands swing by 50 BB or more.</p>
    </li>
  );
}
