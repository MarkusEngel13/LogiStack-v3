import { useEffect, useMemo, useState } from 'react';
import type { HandRecord } from '../../core/hand/types';
import { Button } from '../controls';
import { nextHandNo } from '../library';
import { defaultDraft, DRAFT_KEY, loadDraft, toHandRecord, validateDraft, type WizardDraft } from './draft';
import { PlayersStep } from './steps/PlayersStep';
import { ReviewStep } from './steps/ReviewStep';
import { RulesStep } from './steps/RulesStep';
import { TableStep } from './steps/TableStep';
import { refreshStyles } from '../players/seating';

const STEPS = ['Table', 'Players', 'House rules', 'Review'] as const;
export function HandWizard({ onCreated }: { onCreated: (hand: HandRecord) => void }) {
  const [draft, setDraft] = useState<WizardDraft>(loadDraft);
  const [step, setStep] = useState(0);
  const check = useMemo(() => validateDraft(draft), [draft]);
  const handNo = useMemo(() => nextHandNo(), []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // storage blocked: the draft just isn't remembered
    }
  }, [draft]);

  const create = () => {
    // saved players play as they are saved now, not as they were when they were seated
    const hand = toHandRecord(refreshStyles(draft), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo });
    // Hole cards and the title belong to this hand; the next one starts from the same table without them.
    // Written straight to storage because the wizard unmounts before an effect could save it.
    const next: WizardDraft = { ...draft, title: '', seats: draft.seats.map((p) => (p ? { ...p, cards: null } : p)) };
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // storage blocked
    }
    setDraft(next);
    onCreated(hand);
  };

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-bold">New hand</h1>
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((label, i) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(i)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                  i === step ? 'border-accent bg-accent text-accent-ink font-semibold' : 'border-line text-muted hover:text-ink'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${i === step ? 'bg-black/20' : 'bg-surface-3'}`}
                >
                  {i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
        <Button variant="ghost" onClick={() => window.confirm('Start over with an empty 9-max table?') && setDraft(defaultDraft())}>
          Reset
        </Button>
      </div>

      {step === 0 && <TableStep draft={draft} setDraft={setDraft} />}
      {step === 1 && <PlayersStep draft={draft} setDraft={setDraft} />}
      {step === 2 && <RulesStep draft={draft} setDraft={setDraft} />}
      {step === 3 && <ReviewStep draft={draft} setDraft={setDraft} check={check} handNo={handNo} />}

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          ← Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
            Next: {STEPS[step + 1]} →
          </Button>
        ) : (
          <Button variant="primary" disabled={check.errors.length > 0} onClick={create}>
            Create hand
          </Button>
        )}
      </div>
    </div>
  );
}
