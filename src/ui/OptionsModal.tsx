import { Button, Field, Modal, Segmented, Toggle } from './controls';
import { useSettings } from './settings';

export function OptionsModal({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  return (
    <Modal title="Options" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <div className="space-y-5">
        <Field label="Theme" hint="More themes are coming.">
          <Segmented value={settings.theme} options={[{ value: 'dark', label: 'Dark' }]} onChange={(theme) => update({ theme })} />
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
      </div>
    </Modal>
  );
}
