import { useState } from 'react';
import type { ChipDef, ChipSet } from '../../core/quiz/stack';
import { CHIP_PRESETS } from '../../core/quiz/stack';
import { Button, Modal, MoneyInput } from '../controls';
import { formatAmount } from '../format';
import { ChipLegend } from './ChipStack';

/** Your chip set for "Guess the stack": the colours and values of the chips in your game, and its blinds. */
export function ChipSetEditor({ value, onSave, onClose }: { value: ChipSet; onSave: (s: ChipSet) => void; onClose: () => void }) {
  const [set, setSet] = useState<ChipSet>(value);
  const cur = set.currency;
  const chip = (i: number, patch: Partial<ChipDef>) => setSet({ ...set, chips: set.chips.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const sorted = [...set.chips].sort((a, b) => a.value - b.value);
  const valid = set.chips.length >= 2 && set.chips.every((c) => c.value > 0) && new Set(set.chips.map((c) => c.value)).size === set.chips.length && set.blinds.bb > 0;

  return (
    <Modal title="Your chips" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {CHIP_PRESETS.map((p) => (
            <Button key={p.id} variant={set.id === p.id ? 'primary' : 'secondary'} onClick={() => setSet(structuredClone(p))}>
              {p.name}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            SB
            <span className="w-24">
              <MoneyInput value={set.blinds.sb} currency={cur} onChange={(sb) => setSet({ ...set, id: 'custom', blinds: { ...set.blinds, sb } })} />
            </span>
          </label>
          <label className="flex items-center gap-2">
            BB
            <span className="w-24">
              <MoneyInput value={set.blinds.bb} currency={cur} onChange={(bb) => setSet({ ...set, id: 'custom', blinds: { ...set.blinds, bb } })} />
            </span>
          </label>
        </div>
        <ul className="space-y-2">
          {set.chips.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <label className="flex items-center gap-1" title="Face colour">
                <input type="color" value={c.color} onChange={(e) => chip(i, { color: e.target.value })} className="h-9 w-11 cursor-pointer rounded border border-line bg-transparent" aria-label="Face colour" />
              </label>
              <label className="flex items-center gap-1" title="Stripes">
                <input type="color" value={c.stripe} onChange={(e) => chip(i, { stripe: e.target.value })} className="h-9 w-11 cursor-pointer rounded border border-line bg-transparent" aria-label="Stripe colour" />
              </label>
              <span className="w-28">
                <MoneyInput value={c.value} currency={cur} onChange={(v) => chip(i, { value: v })} />
              </span>
              <Button variant="ghost" disabled={set.chips.length <= 2} onClick={() => setSet({ ...set, chips: set.chips.filter((_, k) => k !== i) })} title="Remove this chip">
                ✕
              </Button>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          disabled={set.chips.length >= 8}
          onClick={() => {
            const top = sorted[sorted.length - 1]?.value ?? 100;
            setSet({ ...set, id: 'custom', chips: [...set.chips, { value: top * 5, color: '#7c3aed', stripe: '#ffffff' }] });
          }}
        >
          + Add a chip
        </Button>
        <div className="rounded-lg bg-surface-2 p-3">
          <ChipLegend chips={sorted} format={(v) => formatAmount(v, cur, 1)} />
        </div>
        {!valid && <p className="text-xs text-danger">Every chip needs its own value, and the blinds can’t be zero.</p>}
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              onSave({ ...set, name: set.id === 'custom' ? 'My chips' : set.name, chips: sorted });
              onClose();
            }}
          >
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
