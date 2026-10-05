import type { Dispatch, SetStateAction } from 'react';
import { Field, MoneyInput, Section, Segmented, Stepper, Toggle } from '../../controls';
import { formatAmount } from '../../format';
import { SQUID_ICON } from '../../playerTypes';
import { isDealtIn, straddlesAllowed, type WizardDraft } from '../draft';

interface Props {
  draft: WizardDraft;
  setDraft: Dispatch<SetStateAction<WizardDraft>>;
}

export function RulesStep({ draft, setDraft }: Props) {
  const c = draft.currency;
  const set = (patch: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setStraddle = (patch: Partial<WizardDraft['straddle']>) => setDraft((d) => ({ ...d, straddle: { ...d.straddle, ...patch } }));
  const players = draft.seats.flatMap((p, seat) => (p ? [{ p, seat }] : []));
  const dealtCount = draft.seats.filter(isDealtIn).length;

  const updatePlayer = (seat: number, patch: Partial<NonNullable<WizardDraft['seats'][number]>>) =>
    setDraft((d) => ({ ...d, seats: d.seats.map((p, i) => (i === seat && p ? { ...p, ...patch } : p)) }));

  return (
    <div className="grid items-start gap-5 lg:grid-cols-2 2xl:grid-cols-3">
      <Section title="Straddles allowed">
        <div className="space-y-3">
          <Toggle
            checked={draft.straddle.utg}
            onChange={(utg) => setStraddle({ utg })}
            label="UTG straddle"
            hint="The player after the big blind may straddle."
          />
          <Toggle
            checked={draft.straddle.button}
            onChange={(button) => setStraddle({ button })}
            label="Button straddle (Mississippi)"
            hint="The button may straddle; the small blind then acts first."
          />
          {straddlesAllowed(draft) && (
            <>
              <Toggle
                checked={draft.straddle.restraddle}
                onChange={(restraddle) => setStraddle({ restraddle })}
                label="Re-straddles"
                hint="After a straddle, the next player may straddle again (double)."
              />
              <Field label="Usual straddle" hint={`${formatAmount(draft.straddle.amount, c, draft.blinds.bb, 'bb')} · suggested when you enter the hand; you can change it there.`}>
                <div className="w-40">
                  <MoneyInput value={draft.straddle.amount} currency={c} onChange={(amount) => setStraddle({ amount })} />
                </div>
              </Field>
            </>
          )}
          <p className="text-sm text-muted">
            {dealtCount < 3
              ? 'Straddles need at least three players.'
              : straddlesAllowed(draft)
                ? 'Who straddles (and for how much) is entered with the hand, before the first preflop action.'
                : 'No straddles in this game.'}
          </p>
        </div>
      </Section>

      <Section
        title="7-2 game"
        aside={<Toggle checked={draft.sevenDeuce.enabled} onChange={(enabled) => set({ sevenDeuce: { ...draft.sevenDeuce, enabled } })} label="" />}
      >
        {draft.sevenDeuce.enabled ? (
          <div className="space-y-4">
            <Field label="Bounty per player">
              <div className="w-40">
                <MoneyInput value={draft.sevenDeuce.bounty} currency={c} onChange={(bounty) => set({ sevenDeuce: { ...draft.sevenDeuce, bounty } })} />
              </div>
            </Field>
            <Field label="Who pays">
              <Segmented
                value={draft.sevenDeuce.payers}
                options={[
                  { value: 'dealt-in', label: 'Everyone dealt in' },
                  { value: 'all-seated', label: 'Everyone at the table' },
                ]}
                onChange={(payers) => set({ sevenDeuce: { ...draft.sevenDeuce, payers } })}
              />
            </Field>
            <Toggle
              checked={draft.sevenDeuce.suitedCounts}
              onChange={(suitedCounts) => set({ sevenDeuce: { ...draft.sevenDeuce, suitedCounts } })}
              label="Suited 7-2 counts"
            />
            <Toggle
              checked={draft.sevenDeuce.showdownOnly}
              onChange={(showdownOnly) => set({ sevenDeuce: { ...draft.sevenDeuce, showdownOnly } })}
              label="Only at showdown"
              hint="Off: winning uncontested also pays, if the 7-2 is shown."
            />
          </div>
        ) : (
          <p className="text-sm text-muted">Win a pot with 7-2 and every other player pays you a bounty.</p>
        )}
      </Section>

      <Section
        title={`Squid game ${SQUID_ICON}`}
        aside={<Toggle checked={draft.squid.enabled} onChange={(enabled) => set({ squid: { ...draft.squid, enabled } })} label="" />}
      >
        {draft.squid.enabled ? (
          <div className="space-y-4">
            <Field label="Value per squid">
              <div className="w-40">
                <MoneyInput value={draft.squid.value} currency={c} onChange={(value) => set({ squid: { ...draft.squid, value } })} />
              </div>
            </Field>
            <Field label="Squids held before this hand">
              <div className="space-y-2">
                {players.map(({ p, seat }) => (
                  <div key={seat} className="flex items-center justify-between gap-3">
                    <span className="text-sm">{p.name}</span>
                    <Stepper value={p.squids} min={0} max={9} onChange={(squids) => updatePlayer(seat, { squids })} />
                  </div>
                ))}
              </div>
            </Field>
          </div>
        ) : (
          <p className="text-sm text-muted">Each pot winner without a squid gets one; the last player without a squid pays every holder.</p>
        )}
      </Section>

      <p className="text-xs text-faint lg:col-span-2 2xl:col-span-3">
        Blind raises are marked on the raise itself when you enter the actions. More home-game rules (bomb pots, run it twice,
        double board, ...) can be added here later.
      </p>
    </div>
  );
}
