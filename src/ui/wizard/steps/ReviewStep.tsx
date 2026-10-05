import type { Dispatch, SetStateAction } from 'react';
import { Field, Section, TextInput } from '../../controls';
import { formatAmount } from '../../format';
import { useSettings } from '../../settings';
import { PokerTable } from '../../table/PokerTable';
import { isDealtIn, straddlesAllowed, type DraftCheck, type WizardDraft } from '../draft';
import { draftSeatViews } from '../seatViews';

interface Props {
  draft: WizardDraft;
  setDraft: Dispatch<SetStateAction<WizardDraft>>;
  check: DraftCheck;
  handNo: number;
}

export function ReviewStep({ draft, setDraft, check, handNo }: Props) {
  const { settings } = useSettings();
  const money = (v: number) => formatAmount(v, draft.currency, draft.blinds.bb);
  const name = (seat: number) => draft.seats[seat]?.name ?? `Seat ${seat + 1}`;
  const state = check.state;
  const positions = new Map(state?.seats.map((s) => [s.seat, s.position]) ?? []);
  const dealt = draft.seats.filter(isDealtIn).length;
  const sittingOut = draft.seats.filter((p) => p?.sittingOut).length;
  const st = draft.straddle;
  const straddleText = straddlesAllowed(draft)
    ? `${[st.utg && 'UTG', st.button && 'button', st.restraddle && 're-straddles'].filter(Boolean).join(', ')} · usually ${money(st.amount)}`
    : 'not allowed';

  const rows: [string, string][] = [
    ['Table', `${draft.tableSize}-max ${draft.venue === 'home' ? 'home game' : 'casino'}${draft.tableName ? ` · ${draft.tableName}` : ''}`],
    ['Stakes', `${money(draft.blinds.sb)} / ${money(draft.blinds.bb)}${draft.ante.kind !== 'none' ? ` · ${draft.ante.kind === 'bb' ? 'BB ante' : 'ante'} ${money(draft.ante.amount)}` : ''}`],
    ['Rake', draft.venue === 'casino' ? `${Math.round(draft.rake.percent * 1000) / 10} %${draft.rake.cap ? `, cap ${money(draft.rake.cap)}` : ''}${draft.rake.noFlopNoDrop ? ', no flop no drop' : ''}` : 'none (home game)'],
    ['Players', `${dealt} dealt in${sittingOut ? `, ${sittingOut} sitting out` : ''}`],
    ['Straddles', straddleText],
    [
      'Side games',
      [draft.sevenDeuce.enabled && `7-2 (${money(draft.sevenDeuce.bounty)})`, draft.squid.enabled && `squid (${money(draft.squid.value)})`].filter(Boolean).join(', ') || 'none',
    ],
  ];
  if (state?.toAct != null) rows.push(['First to act', `${name(state.toAct)} (${positions.get(state.toAct)})`]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-lg border border-line bg-surface/60 p-2">
        <PokerTable
          size={draft.tableSize}
          anchorSeat={draft.heroSeat ?? 0}
          buttonSeat={draft.button}
          seats={draftSeatViews(draft, { positions, state, amounts: settings.amounts, showAllCards: settings.showAllCards })}
        />
      </div>

      <div className="space-y-5">
        <Section title={`Hand #${handNo}`}>
          <Field label="Title" hint="Optional. Shown in the replayer header.">
            <TextInput value={draft.title} onChange={(title) => setDraft((d) => ({ ...d, title }))} placeholder={`${draft.tableName || 'Hand'} #${handNo}`} />
          </Field>
          <dl className="mt-4 space-y-2 text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {check.errors.length > 0 && (
          <Section title="Fix before creating">
            <ul className="list-disc space-y-1 pl-5 text-sm text-danger">
              {check.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
