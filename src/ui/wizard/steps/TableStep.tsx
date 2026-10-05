import type { Dispatch, SetStateAction } from 'react';
import { Field, MoneyInput, PercentInput, Section, Segmented, TextInput, Toggle } from '../../controls';
import { CURRENCIES } from '../../format';
import { useSettings } from '../../settings';
import { PokerTable } from '../../table/PokerTable';
import { previewPositions, resizeTable, setBlinds, setCurrency, type AnteKind, type WizardDraft } from '../draft';
import { draftSeatViews } from '../seatViews';

interface Props {
  draft: WizardDraft;
  setDraft: Dispatch<SetStateAction<WizardDraft>>;
}

export function TableStep({ draft, setDraft }: Props) {
  const { settings } = useSettings();
  const c = draft.currency;
  const set = (patch: Partial<WizardDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="space-y-5">
        <Section title="Table">
          <div className="space-y-4">
            <Field label="Seats at the table">
              <Segmented
                value={draft.tableSize}
                options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: n, label: n === 2 ? 'HU' : String(n), title: `${n}-max` }))}
                onChange={(n) => setDraft((d) => resizeTable(d, n))}
              />
            </Field>
            <div className="grid items-end gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <Field label="Game">
                <Segmented
                  value={draft.venue}
                  options={[
                    { value: 'home', label: 'Home game' },
                    { value: 'casino', label: 'Casino' },
                  ]}
                  onChange={(venue) => set({ venue })}
                />
              </Field>
              <Field label="Table name (optional)">
                <TextInput value={draft.tableName} onChange={(tableName) => set({ tableName })} placeholder="e.g. Thursday Home Game" />
              </Field>
            </div>
          </div>
        </Section>

        <Section title="Stakes">
          <div className="space-y-4">
            <Field label="Currency">
              <Segmented
                value={c.code}
                options={CURRENCIES.map((x) => ({ value: x.code, label: x.label }))}
                onChange={(code) => setDraft((d) => setCurrency(d, CURRENCIES.find((x) => x.code === code)!))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Small blind">
                <MoneyInput
                  commitOnBlur
                  value={draft.blinds.sb}
                  currency={c}
                  onChange={(sb) => setDraft((d) => setBlinds(d, { ...d.blinds, sb }))}
                />
              </Field>
              <Field
                label="Big blind"
                hint={c.code === 'CHIPS' ? 'Straddle and ante follow the big blind.' : 'Stacks, straddle, ante and side-game amounts follow the big blind.'}
              >
                <MoneyInput
                  commitOnBlur
                  value={draft.blinds.bb}
                  currency={c}
                  onChange={(bb) => setDraft((d) => setBlinds(d, { ...d.blinds, bb }))}
                />
              </Field>
            </div>
            <Field label="Ante">
              <div className="flex flex-wrap items-center gap-3">
                <Segmented<AnteKind>
                  value={draft.ante.kind}
                  options={[
                    { value: 'none', label: 'None' },
                    { value: 'each', label: 'Every player' },
                    { value: 'bb', label: 'BB ante' },
                  ]}
                  onChange={(kind) => set({ ante: { ...draft.ante, kind } })}
                />
                {draft.ante.kind !== 'none' && (
                  <div className="w-32">
                    <MoneyInput value={draft.ante.amount} currency={c} onChange={(amount) => set({ ante: { ...draft.ante, amount } })} />
                  </div>
                )}
              </div>
            </Field>
          </div>
        </Section>

        {draft.venue === 'casino' && (
          <Section title="Rake">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rake %">
                <PercentInput value={draft.rake.percent} onChange={(percent) => set({ rake: { ...draft.rake, percent } })} />
              </Field>
              <Field label="Cap per hand" hint="0 = no cap">
                <MoneyInput value={draft.rake.cap} currency={c} onChange={(cap) => set({ rake: { ...draft.rake, cap } })} />
              </Field>
            </div>
            <div className="mt-4">
              <Toggle
                checked={draft.rake.noFlopNoDrop}
                onChange={(noFlopNoDrop) => set({ rake: { ...draft.rake, noFlopNoDrop } })}
                label="No flop, no drop"
                hint="No rake when the hand ends before the flop."
              />
            </div>
          </Section>
        )}
      </div>

      <div className="rounded-lg border border-line bg-surface/60 p-2">
        <PokerTable
          size={draft.tableSize}
          anchorSeat={draft.heroSeat ?? 0}
          buttonSeat={draft.button}
          seats={draftSeatViews(draft, { positions: previewPositions(draft), amounts: settings.amounts, showAllCards: settings.showAllCards })}
        />
      </div>
    </div>
  );
}
