import { parseCard } from '../core/cards';
import { CARD_FACES, PlayingCard } from './cards/PlayingCard';
import { Button, Field, Modal, Segmented, Toggle } from './controls';
import { useSettings } from './settings';
import { makeBackup, restoreBackup } from './backup';
import { SizeChips } from './lab/SizeChips';
import { downloadJson } from './library';

const PREVIEW = [parseCard('As'), parseCard('Kd')];

export function OptionsModal({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  return (
    <Modal kind="dialog" title="Options" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        <Field label="Theme">
          <Segmented
            value={settings.theme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
            onChange={(theme) => update({ theme })}
          />
        </Field>
        <Field label="Show amounts as">
          <Segmented
            value={settings.amounts}
            options={[
              { value: 'currency', label: 'Money (€200)' },
              { value: 'chips', label: 'Chips (200)' },
              { value: 'bb', label: 'Big blinds (100 BB)' },
            ]}
            onChange={(amounts) => update({ amounts })}
          />
        </Field>
        <Toggle
          checked={settings.showAllCards}
          onChange={(showAllCards) => update({ showAllCards })}
          label="Show all known hole cards"
          hint="Off: only Hero's cards are face up; everyone else's stay hidden until showdown."
        />
        <Field label="Card faces">
          <div className="grid grid-cols-4 gap-2">
            {CARD_FACES.map((f) => {
              const active = settings.cardFace === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => update({ cardFace: f.id })}
                  className={`flex flex-col items-center gap-2 rounded-lg border-2 bg-surface-2 px-1 pt-3 pb-2 transition-colors ${
                    active ? 'border-accent' : 'border-transparent hover:border-line'
                  }`}
                >
                  <span className="flex gap-1">
                    {PREVIEW.map((c) => (
                      <PlayingCard key={c} card={c} width="40px" face={f.id} />
                    ))}
                  </span>
                  <span className={`text-xs ${active ? 'font-semibold text-ink' : 'text-muted'}`}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <Toggle
          checked={settings.fourColor}
          onChange={(fourColor) => update({ fourColor })}
          label="Four-colour deck"
          hint="Diamonds blue, clubs green: flushes are easier to spot."
        />
        <Field label="“What happens if”: bet sizes" hint="The sizes the window starts with (you can change them there too).">
          <SizeChips value={settings.whatIfSizes} onChange={(whatIfSizes) => update({ whatIfSizes })} />
        </Field>
        <Field label="Backup" hint="Everything this browser keeps: hands, players, profiles, your charts, settings. Use it to keep a copy, or to move your data to another browser.">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => downloadJson(`logistack-backup-${new Date().toISOString().slice(0, 10)}.json`, makeBackup())}>Export everything</Button>
            <label className="cursor-pointer rounded-md border border-line bg-surface-2 px-3.5 py-2 text-sm hover:bg-surface-3">
              Import a backup…
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f)
                    return;
                  f.text()
                    .then((t) => {
                      const n = restoreBackup(JSON.parse(t));
                      window.alert(`Restored ${n} parts. The page reloads to show them.`);
                      window.location.reload();
                    })
                    .catch((err: unknown) => window.alert(err instanceof Error ? err.message : String(err)));
                }}
              />
            </label>
          </div>
        </Field>
      </div>
    </Modal>
  );
}
