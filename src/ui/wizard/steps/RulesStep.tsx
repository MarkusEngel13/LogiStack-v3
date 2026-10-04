import type { Dispatch, SetStateAction } from 'react';
import { Field, MoneyInput, Section, Segmented, Stepper, Toggle } from '../../controls';
import { formatAmount } from '../../format';
import { BLIND_ICON, SQUID_ICON } from '../../playerTypes';
import { isDealtIn, straddlesFor, type StraddleKind, type WizardDraft } from '../draft';

interface Props {
  draft: WizardDraft;
  setDraft: Dispatch<SetStateAction<WizardDraft>>;
}

export function RulesStep({ draft, setDraft }: Props) {
  const c = draft.currency;
  const money = (v: number) => formatAmount(v, c, draft.blinds.bb);
  const set = (patch: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const players = draft.seats.flatMap((p, seat) => (p ? [{ p, seat }] : []));
  const dealtCount = draft.seats.filter(isDealtIn).length;
  const straddles = straddlesFor(draft);
  const name = (seat: number) => draft.seats[seat]?.name ?? `Seat ${seat + 1}`;

  const updatePlayer = (seat: number, patch: Partial<NonNullable<WizardDraft['seats'][number]>>) =>
    setDraft((d) => ({ ...d, seats: d.seats.map((p, i) => (i === seat && p ? { ...p, ...patch } : p)) }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Section title="Straddle">
        <div className="space-y-4">
          <Segmented<StraddleKind>
            value={draft.straddle.kind}
            options={[
              { value: 'none', label: 'None' },
              { value: 'utg', label: 'UTG straddle' },
              { value: 'button', label: 'Button straddle', title: 'Mississippi: the button straddles, the small blind acts first' },
            ]}
            onChange={(kind) => set({ straddle: { ...draft.straddle, kind } })}
          />
          {draft.straddle.kind !== 'none' && (
            <>
              <Field label="Straddle amount">
                <div className="w-40">
                  <MoneyInput value={draft.straddle.amount} currency={c} onChange={(amount) => set({ straddle: { ...draft.straddle, amount } })} />
                </div>
              </Field>
              {draft.straddle.kind === 'utg' && (
                <Toggle
                  checked={draft.straddle.restraddle}
                  onChange={(restraddle) => set({ straddle: { ...draft.straddle, restraddle } })}
                  label="Re-straddle"
                  hint="The next player straddles again for double."
                />
              )}
              <p className="text-sm text-muted">
                {dealtCount < 3
                  ? 'Straddles need at least three players.'
                  : straddles.length === 0
                    ? 'Nobody can straddle from this button position.'
                    : straddles.map((s) => `${name(s.seat)} straddles ${money(s.amount)}`).join(' · ')}
              </p>
            </>
          )}
        </div>
      </Section>

      <Section title={`Blind raise ${BLIND_ICON}`}>
        <p className="mb-3 text-sm text-muted">Who hasn't looked at their cards? Their bets and raises show as blind.</p>
        <div className="space-y-2">
          {players.map(({ p, seat }) => (
            <Toggle key={seat} checked={p.blind} onChange={(blind) => updatePlayer(seat, { blind })} label={`${p.name} (seat ${seat + 1})`} />
          ))}
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

      <p className="text-xs text-faint lg:col-span-2">More home-game rules (bomb pots, run it twice, double board, ...) can be added here later.</p>
    </div>
  );
}
