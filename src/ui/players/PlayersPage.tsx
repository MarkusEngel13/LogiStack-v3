import { useMemo, useState } from 'react';
import { MOTIVE_PRESETS } from '../../core/motives/profile';
import { STYLES } from '../../core/motives/preflop';
import { POSTFLOP_SPOTS, preflopPreview, type PostflopRow, type PreflopRow } from '../../core/players/preview';
import {
  BASE_TYPES,
  SIZING_INFO,
  SLIDER_INFO,
  SLIDERS,
  stepLabel,
  styleMotives,
  stylePreflop,
  typeSettings,
  type SeatStyle,
  type SliderId,
  type Sizing,
  type StyleSettings,
} from '../../core/players/style';
import type { HandRecord } from '../../core/hand/types';
import { Button, Field, inputClass, Segmented, TextInput, Toggle } from '../controls';
import { useEquity } from '../lab/useEquity';
import { downloadJson } from '../library';
import { playerTypeColor } from '../playerTypes';
import { allCharts } from '../ranges/charts';
import { styleSummary } from './SavedPlayerPicker';
import { testTable, type TestMode } from './seating';
import {
  builtInId,
  deletePlayer,
  deleteProfile,
  exportAll,
  importAll,
  loadPlayers,
  loadProfiles,
  playerSettings,
  profileById,
  savePlayer,
  saveProfile,
  seatStyleOfPlayer,
  seatStyleOfProfile,
  type PlayerOverrides,
  type SavedPlayer,
  type SavedProfile,
} from './store';

type Sel = { kind: 'player' | 'profile'; id: string };

/**
 * The Players page: real players and the profiles they are built from, as six sliders in poker
 * words, with what the bots then do in a few fixed spots - next to what the profile (or type)
 * underneath does. Everything saves itself; "Play against" and "Watch" deal a test table.
 */
export function PlayersPage({ onOpenHand }: { onOpenHand: (hand: HandRecord, mode: TestMode) => void }) {
  const [players, setPlayers] = useState<SavedPlayer[]>(loadPlayers);
  const [profiles, setProfiles] = useState<SavedProfile[]>(loadProfiles);
  const [sel, setSel] = useState<Sel | null>(() => {
    const first = loadPlayers()[0];
    return first ? { kind: 'player', id: first.id } : { kind: 'profile', id: builtInId('Fish') };
  });
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setPlayers(loadPlayers());
    setProfiles(loadProfiles());
  };

  const player = sel?.kind === 'player' ? players.find((p) => p.id === sel.id) : undefined;
  const profile = sel?.kind === 'profile' ? profiles.find((p) => p.id === sel.id) : undefined;

  const newPlayer = (profileId = player?.profileId ?? profile?.id ?? builtInId('Unknown')) => {
    const p: SavedPlayer = { id: crypto.randomUUID(), name: 'New player', profileId, overrides: {} };
    savePlayer(p);
    reload();
    setSel({ kind: 'player', id: p.id });
  };
  const newProfile = (from: SavedProfile) => {
    const p: SavedProfile = {
      id: crypto.randomUUID(),
      name: from.builtIn ? `My ${from.name}` : `${from.name} (copy)`,
      settings: structuredClone(from.settings),
      note: from.builtIn ? undefined : from.note,
    };
    saveProfile(p);
    reload();
    setSel({ kind: 'profile', id: p.id });
  };

  const test = (style: SeatStyle, mode: TestMode) => {
    try {
      setError(null);
      onOpenHand(testTable(style, mode), mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const importFile = (file: File) => {
    file
      .text()
      .then((t) => {
        const r = importAll(JSON.parse(t));
        if (!r) throw new Error('Not a LogiStack players file.');
        reload();
        setError(null);
        window.alert(`Imported ${r.players} players and ${r.profiles} profiles.`);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <main className="mx-auto max-w-[1500px] px-6 py-6">
      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_400px]">
        <aside className="space-y-5">
          <ListBlock title="Players" action={<Button variant="secondary" onClick={() => newPlayer()}>+ New</Button>}>
            {players.length === 0 && <p className="px-2 text-xs text-faint">No players yet. Add the people you play with.</p>}
            {[...players]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <ListItem
                  key={p.id}
                  active={sel?.kind === 'player' && sel.id === p.id}
                  color={playerTypeColor(profileById(p.profileId, profiles).settings.base)}
                  label={p.name}
                  sub={profileById(p.profileId, profiles).name}
                  onClick={() => setSel({ kind: 'player', id: p.id })}
                />
              ))}
          </ListBlock>
          <ListBlock title="Profiles">
            {profiles.map((p) => (
              <ListItem
                key={p.id}
                active={sel?.kind === 'profile' && sel.id === p.id}
                color={playerTypeColor(p.settings.base)}
                label={p.name}
                sub={p.builtIn ? 'built-in type' : `on ${p.settings.base}`}
                onClick={() => setSel({ kind: 'profile', id: p.id })}
              />
            ))}
          </ListBlock>
          <div className="flex flex-wrap gap-2 px-1">
            <Button variant="ghost" onClick={() => downloadJson('logistack-players.json', exportAll())}>
              Export
            </Button>
            <label className="cursor-pointer rounded-md px-3.5 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
              Import
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
          </div>
        </aside>

        {error && <div className="rounded-md border border-danger px-3 py-2 text-sm text-danger xl:col-span-3">{error}</div>}

        {player && (
          <PlayerEditor
            key={player.id}
            player={player}
            profiles={profiles}
            onChange={(p) => {
              savePlayer(p);
              reload();
            }}
            onDelete={() => {
              if (!window.confirm(`Delete ${player.name}?`)) return;
              deletePlayer(player.id);
              reload();
              setSel(null);
            }}
            onTest={(mode) => test(seatStyleOfPlayer(player, profiles), mode)}
          />
        )}
        {profile && (
          <ProfileEditor
            key={profile.id}
            profile={profile}
            players={players.filter((p) => p.profileId === profile.id)}
            onChange={(p) => {
              saveProfile(p);
              reload();
            }}
            onDuplicate={() => newProfile(profile)}
            onNewPlayer={() => newPlayer(profile.id)}
            onDelete={() => {
              const n = players.filter((p) => p.profileId === profile.id).length;
              if (!window.confirm(`Delete ${profile.name}?${n ? ` Its ${n} player(s) move to ${profile.settings.base}, keeping their own sliders.` : ''}`)) return;
              deleteProfile(profile.id);
              reload();
              setSel({ kind: 'profile', id: builtInId(profile.settings.base) });
            }}
            onTest={(mode) => test(seatStyleOfProfile(profile), mode)}
          />
        )}
        {!player && !profile && (
          <div className="rounded-lg border border-line bg-surface p-8 text-sm text-muted xl:col-span-2">Pick a player or a profile on the left.</div>
        )}
      </div>
    </main>
  );
}

// ---- the list --------------------------------------------------------------------------------------

function ListBlock({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-bold tracking-wider text-muted uppercase">{title}</h3>
        {action}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ListItem({ active, color, label, sub, onClick }: { active: boolean; color?: string; label: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${active ? 'bg-surface-3 text-ink' : 'text-muted hover:bg-surface-2 hover:text-ink'}`}
    >
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color ?? 'transparent' }} />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="shrink-0 text-[11px] text-faint">{sub}</span>
    </button>
  );
}

// ---- editors ---------------------------------------------------------------------------------------

function PlayerEditor({
  player,
  profiles,
  onChange,
  onDelete,
  onTest,
}: {
  player: SavedPlayer;
  profiles: SavedProfile[];
  onChange: (p: SavedPlayer) => void;
  onDelete: () => void;
  onTest: (mode: TestMode) => void;
}) {
  const profile = profileById(player.profileId, profiles);
  const settings = playerSettings(player, profiles);
  const o = player.overrides;
  const set = (overrides: PlayerOverrides) => onChange({ ...player, overrides });

  const setSlider = (id: SliderId, v: number) => {
    const sliders = { ...o.sliders };
    if (v === profile.settings.sliders[id]) delete sliders[id];
    else sliders[id] = v;
    set({ ...o, sliders });
  };
  const setFlag = <K extends 'sizing' | 'limpTrap' | 'leads'>(k: K, v: StyleSettings[K]) => {
    const next = { ...o };
    if (v === profile.settings[k]) delete next[k];
    else next[k] = v as never;
    set(next);
  };

  return (
    <>
      <section className="space-y-5 rounded-lg border border-line bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={player.name} onChange={(name) => onChange({ ...player, name })} />
          </Field>
          <Field label="Profile" hint="He plays like this profile, except in the sliders you move below.">
            <select className={inputClass} value={player.profileId} onChange={(e) => onChange({ ...player, profileId: e.target.value })}>
              <ProfileOptions profiles={profiles} />
            </select>
          </Field>
        </div>
        <StyleControls
          settings={settings}
          home={profile.settings}
          homeName={profile.name}
          onSlider={setSlider}
          onSizing={(v) => setFlag('sizing', v)}
          onLimpTrap={(v) => setFlag('limpTrap', v)}
          onLeads={(v) => setFlag('leads', v)}
        />
        <Field label="Reads and tells" hint="What to look for at the table: his tells, his favourite lines, when he tilts.">
          <textarea
            className={`${inputClass} min-h-20`}
            value={player.notes ?? ''}
            onChange={(e) => onChange({ ...player, notes: e.target.value })}
            placeholder="Snap-calls with draws, tanks with the nuts. Gets stuck after 11pm."
          />
        </Field>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" onClick={() => onTest('play')} title="A 6-max table: you, him and your other saved players; bots play everyone but you">
            ▶ Play against {player.name}
          </Button>
          <Button onClick={() => onTest('watch')} title="Bots play every seat, cards face up, hand after hand">
            👀 Watch {player.name}
          </Button>
          <div className="flex-1" />
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </section>
      <Readout settings={settings} name={player.name} reference={profile.settings} referenceName={profile.name} />
    </>
  );
}

function ProfileEditor({
  profile,
  players,
  onChange,
  onDuplicate,
  onNewPlayer,
  onDelete,
  onTest,
}: {
  profile: SavedProfile;
  players: SavedPlayer[];
  onChange: (p: SavedProfile) => void;
  onDuplicate: () => void;
  onNewPlayer: () => void;
  onDelete: () => void;
  onTest: (mode: TestMode) => void;
}) {
  const home = typeSettings(profile.settings.base);
  const ro = !!profile.builtIn;
  const set = (settings: StyleSettings) => onChange({ ...profile, settings });

  return (
    <>
      <section className="space-y-5 rounded-lg border border-line bg-surface p-5">
        {ro ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{profile.name}</h2>
              <p className="text-sm text-muted">A built-in type. Duplicate it to make your own version, or build a player on it.</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={onDuplicate}>Duplicate to edit</Button>
              <Button onClick={onNewPlayer}>+ Player of this type</Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Profile name">
              <TextInput value={profile.name} onChange={(name) => onChange({ ...profile, name })} />
            </Field>
            <Field label="Built on" hint="What the sliders don't cover comes from this type: noise, sizing errors, fear of draws, trapping, open sizes.">
              <select
                className={inputClass}
                value={profile.settings.base}
                onChange={(e) => {
                  if (!window.confirm(`Rebuild on ${e.target.value}? The sliders move to its positions.`)) return;
                  set({ ...typeSettings(e.target.value), sizing: profile.settings.sizing, limpTrap: profile.settings.limpTrap, leads: profile.settings.leads });
                }}
              >
                {BASE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <StyleControls
          settings={profile.settings}
          home={home}
          homeName={profile.settings.base}
          readOnly={ro}
          onSlider={(id, v) => set({ ...profile.settings, sliders: { ...profile.settings.sliders, [id]: v } })}
          onSizing={(sizing) => set({ ...profile.settings, sizing })}
          onLimpTrap={(limpTrap) => set({ ...profile.settings, limpTrap })}
          onLeads={(leads) => set({ ...profile.settings, leads })}
        />
        {!ro && (
          <Field label="Note">
            <textarea className={`${inputClass} min-h-16`} value={profile.note ?? ''} onChange={(e) => onChange({ ...profile, note: e.target.value })} />
          </Field>
        )}
        {players.length > 0 && <p className="text-xs text-muted">Players on this profile: {players.map((p) => p.name).join(', ')}. Changes here change them too.</p>}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" onClick={() => onTest('play')}>
            ▶ Play against a {profile.name}
          </Button>
          <Button onClick={() => onTest('watch')}>👀 Watch a {profile.name}</Button>
          {!ro && (
            <>
              <Button onClick={onNewPlayer}>+ Player on this profile</Button>
              <Button variant="ghost" onClick={onDuplicate}>
                Duplicate
              </Button>
              <div className="flex-1" />
              <Button variant="danger" onClick={onDelete}>
                Delete
              </Button>
            </>
          )}
        </div>
      </section>
      <Readout settings={profile.settings} name={profile.name} reference={ro ? null : home} referenceName={profile.settings.base} />
    </>
  );
}

function ProfileOptions({ profiles }: { profiles: SavedProfile[] }) {
  const mine = profiles.filter((p) => !p.builtIn);
  return (
    <>
      {mine.length > 0 && (
        <optgroup label="Your profiles">
          {mine.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.settings.base})
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Built-in types">
        {profiles
          .filter((p) => p.builtIn)
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
      </optgroup>
    </>
  );
}

/** The six sliders, the sizing habit and the specials. `home` = where the profile or type has them. */
function StyleControls({
  settings,
  home,
  homeName,
  readOnly,
  onSlider,
  onSizing,
  onLimpTrap,
  onLeads,
}: {
  settings: StyleSettings;
  home: StyleSettings;
  homeName: string;
  readOnly?: boolean;
  onSlider: (id: SliderId, v: number) => void;
  onSizing: (v: Sizing) => void;
  onLimpTrap: (v: boolean) => void;
  onLeads: (v: boolean) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Style</h3>
          <span className="text-xs text-faint">3 = plays the price · below = less of it · above = more · ◆ = {homeName}</span>
        </div>
        <div className="divide-y divide-line">
          {SLIDERS.map((id) => (
            <SliderRow key={id} id={id} value={settings.sliders[id]} home={home.sliders[id]} homeName={homeName} readOnly={readOnly} onChange={(v) => onSlider(id, v)} />
          ))}
        </div>
      </div>
      <Field label="Bet sizes after the flop" hint={SIZING_INFO[settings.sizing].what}>
        {readOnly ? (
          <span className="text-sm">{SIZING_INFO[settings.sizing].label}</span>
        ) : (
          <Segmented<Sizing>
            size="sm"
            value={settings.sizing}
            onChange={onSizing}
            options={(Object.keys(SIZING_INFO) as Sizing[]).map((s) => ({ value: s, label: SIZING_INFO[s].label, title: SIZING_INFO[s].what }))}
          />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Toggle
          checked={settings.limpTrap}
          onChange={(v) => !readOnly && onLimpTrap(v)}
          label={<span className="text-sm">Limp-reraises premiums</span>}
          hint="Limps half his aces, kings, queens and AK first in, to re-raise an isolation."
        />
        <Toggle
          checked={settings.leads}
          onChange={(v) => !readOnly && onLeads(v)}
          label={<span className="text-sm">Leads into the raiser</span>}
          hint="Donk-bets his strong hands instead of checking to the preflop raiser."
        />
      </div>
    </div>
  );
}

function SliderRow({
  id,
  value,
  home,
  homeName,
  readOnly,
  onChange,
}: {
  id: SliderId;
  value: number;
  home: number;
  homeName: string;
  readOnly?: boolean;
  onChange: (v: number) => void;
}) {
  const info = SLIDER_INFO[id];
  const moved = Math.abs(value - home) > 1e-9;
  const pct = (v: number) => `${((v - 1) / 4) * 100}%`;
  return (
    <div className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)_70px]">
      <div>
        <div className="text-sm font-semibold">{info.label}</div>
        <div className="text-xs text-faint">{info.what}</div>
      </div>
      <div>
        <div className="relative">
          <input
            type="range"
            min={1}
            max={5}
            step={0.5}
            value={value}
            disabled={readOnly}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[var(--accent)] disabled:opacity-60"
            aria-label={info.label}
          />
          <span
            className="pointer-events-none absolute -bottom-2 -translate-x-1/2 text-[10px] text-muted"
            style={{ left: `calc(${pct(home)} * 0.97 + 1.5%)` }}
            title={`${homeName}: ${home}`}
          >
            ◆
          </span>
        </div>
        <div className={`mt-2 text-xs ${moved ? 'text-ink' : 'text-muted'}`}>{stepLabel(id, value)}</div>
        <div className="text-[11px] text-faint">Moves: {info.moves}</div>
      </div>
      <div className="flex items-start justify-end gap-1">
        <span className={`text-lg font-bold tabular-nums ${moved ? 'text-accent' : 'text-ink'}`}>{value}</span>
        {moved && !readOnly && (
          <button type="button" className="mt-1 text-xs text-muted hover:text-ink" title={`Back to ${homeName} (${home})`} onClick={() => onChange(home)}>
            ↺
          </button>
        )}
      </div>
    </div>
  );
}

// ---- what it does ----------------------------------------------------------------------------------

const pc = (x: number) => `${Math.round(x * 100)} %`;

function Readout({ settings, name, reference, referenceName }: { settings: StyleSettings; name: string; reference: StyleSettings | null; referenceName: string }) {
  const charts = useMemo(allCharts, []);
  const pre = useMemo(() => preflopPreview(stylePreflop(settings, STYLES), charts), [settings, charts]);
  const preRef = useMemo(() => (reference ? preflopPreview(stylePreflop(reference, STYLES), charts) : null), [reference, charts]);
  const motives = useMemo(() => styleMotives(settings, MOTIVE_PRESETS), [settings]);
  const motivesRef = useMemo(() => (reference ? styleMotives(reference, MOTIVE_PRESETS) : null), [reference]);
  const post = useEquity({ kind: 'preview', profile: motives }, `preview:${JSON.stringify(motives)}`);
  const postRef = useEquity(motivesRef ? { kind: 'preview', profile: motivesRef } : null, `preview:${JSON.stringify(motivesRef)}`);

  return (
    <aside className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <div>
        <h3 className="text-xs font-bold tracking-wider text-muted uppercase">What the bot does</h3>
        <p className="mt-1 text-xs text-faint">
          {styleSummary({ label: name, settings })}. Fixed spots, 100 BB, the button opens and the big blind calls. Check these against the real person.
          {reference && <> Grey: {referenceName}.</>}
        </p>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted">Before the flop</h4>
        <div className="space-y-2.5">
          {pre.map((r, i) => (
            <PreflopBar key={r.label} row={r} ref_={preRef?.[i]} />
          ))}
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold text-muted">After the flop {post.pending && <span className="text-faint">· working…</span>}</h4>
        {post.answer?.error && <p className="text-xs text-danger">{post.answer.error}</p>}
        <div className="space-y-2.5">
          {POSTFLOP_SPOTS.map((spot, i) => (
            <PostflopLine key={spot} row={post.answer?.preview?.[i]} ref_={reference ? postRef.answer?.preview?.[i] : undefined} />
          ))}
        </div>
      </div>
    </aside>
  );
}

function PreflopBar({ row, ref_ }: { row: PreflopRow; ref_?: PreflopRow }) {
  const callLabel = row.firstIn ? 'Limp' : 'Call';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{row.label}</span>
        <span className="tabular-nums">
          plays {pc(row.raise + row.call)}
          {ref_ && <span className="ml-1.5 text-faint">{pc(ref_.raise + ref_.call)}</span>}
        </span>
      </div>
      <div className="mt-1 flex h-2 overflow-hidden rounded bg-surface-3" title={`Raise ${pc(row.raise)} · ${callLabel} ${pc(row.call)} · Fold ${pc(row.fold)}`}>
        <div className="bg-accent" style={{ width: `${row.raise * 100}%` }} />
        <div className="bg-ok" style={{ width: `${row.call * 100}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-faint tabular-nums">
        Raise {pc(row.raise)} · {callLabel} {pc(row.call)}
      </div>
    </div>
  );
}

function PostflopLine({ row, ref_ }: { row?: PostflopRow; ref_?: PostflopRow }) {
  if (!row) return <div className="h-9 animate-pulse rounded bg-surface-2" />;
  const diff = ref_ ? row.share - ref_.share : 0;
  return (
    <div>
      <div className="text-xs text-muted">{row.label}</div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{row.what}</span>
        <span className="shrink-0 tabular-nums">
          <b>{pc(row.share)}</b>
          {ref_ && (
            <span className="ml-1.5 text-xs text-faint">
              {pc(ref_.share)}
              {Math.abs(diff) >= 0.02 && <span className={diff > 0 ? 'text-accent' : 'text-ok'}> {diff > 0 ? '▲' : '▼'}</span>}
            </span>
          )}
        </span>
      </div>
      {row.split && (
        <div className="text-[11px] text-faint tabular-nums">{row.split.map((s) => `${s.label} ${pc(s.share)}`).join(' · ')}</div>
      )}
    </div>
  );
}
