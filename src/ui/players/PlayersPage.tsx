import { useEffect, useMemo, useState } from 'react';
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
  type Leads,
  type LimpTrap,
  type OpenTell,
  type PairJam,
  type SeatStyle,
  type SliderId,
  type Sizing,
  type StyleSettings,
} from '../../core/players/style';
import type { HandRecord } from '../../core/hand/types';
import { Button, Field, inputClass, RangeSlider, Segmented, TextInput, Toggle } from '../controls';
import { useEquity } from '../lab/useEquity';
import { downloadJson } from '../library';
import { playerTypeColor } from '../playerTypes';
import { allCharts } from '../ranges/charts';
import { QuestionWizard } from './QuestionWizard';
import { useToast } from '../toast';
import { PlayerCheck } from '../sim/PlayerCheck';
import { readSuggestions, tagById } from '../../core/players/reads';
import { answerLabel, openBand, openBBOf, QUESTIONS } from '../../core/players/questions';
import { oldAnswerLabel } from '../../core/players/versions';
import { ExploitCheck } from '../sim/ExploitCheck';
import { useSyncStatus } from '../sync/useSyncStatus';
import { gradeBadge, gradeColor, gradeLabel, gradeText } from './gradeColor';
import { ReviewWizard } from './ReviewWizard';
import { styleSummary } from './SavedPlayerPicker';
import { testTable, type TestMode } from './seating';
import { TypeFit, useTypeFit } from './TypeFit';
import {
  builtInId,
  deletePlayer,
  restoreSaved,
  snapshotSaved,
  deleteProfile,
  exportAll,
  importAll,
  loadPlayers,
  loadProfiles,
  overridesFrom,
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

/** The raise-size bands as the bots open them (questions.ts's answers). */
const OPEN_CHOICES = [
  { value: 2, label: 'Min (2 BB)' },
  { value: 3.5, label: '3-4 BB' },
  { value: 5.5, label: '5-6 BB' },
  { value: 8, label: '7 BB+' },
];

/**
 * The Players page: real players and the profiles they are built from, as seven sliders in poker
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
  /** The question wizard: for a new player ({}), or to re-check one. */
  const [asking, setAsking] = useState<{ player?: SavedPlayer } | null>(null);
  const [exploit, setExploit] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  // players whose old answers the changed questions couldn't map by themselves
  const toReview = players.filter((p) => p.review?.length);
  const changed = new Set(toReview.flatMap((p) => p.review!.map((a) => a.q))).size;

  const reload = () => {
    setPlayers(loadPlayers());
    setProfiles(loadProfiles());
  };

  /** A new player not saved yet: he's saved when you name him or change anything (a stray tap on "+ Sliders" leaves nothing behind). */
  const [draft, setDraft] = useState<SavedPlayer | null>(null);
  const toast = useToast();
  const player = sel?.kind === 'player' ? (players.find((p) => p.id === sel.id) ?? (draft?.id === sel.id ? draft : undefined)) : undefined;
  // moving on from an untouched new player drops him
  useEffect(() => {
    if (draft && !(sel?.kind === 'player' && sel.id === draft.id)) setDraft(null);
  }, [sel, draft]);
  const profile = sel?.kind === 'profile' ? profiles.find((p) => p.id === sel.id) : undefined;

  const newPlayer = (profileId = player?.profileId ?? profile?.id ?? builtInId('Unknown')) => {
    const p: SavedPlayer = { id: crypto.randomUUID(), name: 'New player', profileId, overrides: {} };
    setDraft(p);
    setSel({ kind: 'player', id: p.id });
  };
  const newProfile = (from: SavedProfile) => {
    const p: SavedProfile = {
      id: crypto.randomUUID(),
      name: from.builtIn || from.sharedBy ? `My ${from.name}` : `${from.name} (copy)`,
      settings: structuredClone(from.settings),
      note: from.builtIn ? undefined : from.note,
    };
    const before = snapshotSaved();
    saveProfile(p);
    reload();
    setSel({ kind: 'profile', id: p.id });
    toast({
      text: `Profile “${p.name}” created`,
      undo: () => {
        restoreSaved(before);
        reload();
        setSel({ kind: 'profile', id: from.id });
      },
    });
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
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      {toReview.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-accent/50 bg-accent/10 px-4 py-3">
          <div className="min-w-0 flex-1 text-sm">
            <b>
              {changed} question{changed === 1 ? '' : 's'} changed - review {toReview.length} player{toReview.length === 1 ? '' : 's'}
            </b>
            <span className="block text-xs text-muted">Some old answers fit more than one new answer. The best guess is ready: one tap each.</span>
          </div>
          <Button variant="primary" onClick={() => setReviewing(true)}>
            Review
          </Button>
        </div>
      )}
      {reviewing && (
        <ReviewWizard
          players={toReview}
          profiles={profiles}
          onSave={(p) => {
            savePlayer(p);
            setPlayers(loadPlayers());
          }}
          onClose={() => setReviewing(false)}
        />
      )}
      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)_400px]">
        <aside className="space-y-5">
          <ListBlock
            title="Players"
            action={
              <div className="flex gap-1">
                <Button variant="primary" className="px-2.5 py-1 text-xs" onClick={() => setAsking({})} title="A new player from a few questions about what you have seen him do">
                  + Ask me
                </Button>
                <Button variant="secondary" className="px-2.5 py-1 text-xs" onClick={() => newPlayer()} title="A new player: start from a profile and set the sliders yourself">
                  + Sliders
                </Button>
              </div>
            }
          >
            {draft && (
              <ListItem active={sel?.kind === 'player' && sel.id === draft.id} label={draft.name} sub="new · saved once you change something" onClick={() => setSel({ kind: 'player', id: draft.id })} />
            )}
            {players.length === 0 && !draft && <p className="px-2 text-xs text-faint">No players yet. Add the people you play with.</p>}
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
                sub={p.builtIn ? 'built-in type' : p.sharedBy ? `shared · ${p.sharedBy.split('@')[0]}` : `on ${p.settings.base}${p.shared ? ' · shared' : ''}`}
                onClick={() => setSel({ kind: 'profile', id: p.id })}
              />
            ))}
          </ListBlock>
          <Button className="w-full" onClick={() => setExploit(true)} title="Does an adjustment win against your pool? Hero plays the same hands as A and as B">
            ⚖ Exploit check…
          </Button>
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
              if (draft?.id === p.id) setDraft(null);
              reload();
            }}
            onDelete={() => {
              if (draft?.id === player.id) {
                setDraft(null);
                setSel(null);
                return;
              }
              const before = snapshotSaved();
              deletePlayer(player.id);
              reload();
              setSel(null);
              toast({
                text: `${player.name} deleted`,
                undo: () => {
                  restoreSaved(before);
                  reload();
                  setSel({ kind: 'player', id: player.id });
                },
              });
            }}
            onTest={(mode) => test(seatStyleOfPlayer(player, profiles), mode)}
            onAsk={() => setAsking({ player })}
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
              const before = snapshotSaved();
              deleteProfile(profile.id);
              reload();
              setSel({ kind: 'profile', id: builtInId(profile.settings.base) });
              toast({
                text: `${profile.name} deleted${n ? ` · its ${n} player${n === 1 ? '' : 's'} moved to ${profile.settings.base}` : ''}`,
                undo: () => {
                  restoreSaved(before);
                  reload();
                  setSel({ kind: 'profile', id: profile.id });
                },
              });
            }}
            onTest={(mode) => test(seatStyleOfProfile(profile), mode)}
          />
        )}
        {exploit && <ExploitCheck onClose={() => setExploit(false)} />}
        {asking && (
          <QuestionWizard
            player={asking.player}
            profiles={profiles}
            onClose={() => setAsking(null)}
            onSave={(p) => {
              savePlayer(p);
              reload();
              setSel({ kind: 'player', id: p.id });
              setAsking(null);
            }}
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
        <h3 className="mr-2 text-xs font-bold tracking-wider text-muted uppercase">{title}</h3>
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
  onAsk,
}: {
  player: SavedPlayer;
  profiles: SavedProfile[];
  onChange: (p: SavedPlayer) => void;
  onDelete: () => void;
  onTest: (mode: TestMode) => void;
  onAsk: () => void;
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
  const setFlag = <K extends 'sizing' | 'limpTrap' | 'leads' | 'pairJam' | 'openBB' | 'openTell'>(k: K, v: StyleSettings[K]) => {
    const next = { ...o };
    if (v === profile.settings[k] || v === undefined || (k === 'openTell' && v === 'no' && !profile.settings.openTell)) delete next[k];
    else next[k] = v as never;
    set(next);
  };
  const fit = useTypeFit(settings, profiles);
  const better = fit.best.length === 1 && fit.best[0]!.id !== profile.id ? fit.best[0]! : null;
  // another profile under the same sliders: what the sliders don't cover (noise, size errors...) changes
  const moveTo = (p: SavedProfile) => onChange({ ...player, profileId: p.id, overrides: overridesFrom(settings, p.settings) });
  const exact = settings.openBB && openBBOf(openBand(settings.openBB)) !== settings.openBB ? settings.openBB : null;

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
        <div className="-mt-2 text-xs text-muted">
          His sliders fit:{' '}
          <TypeFit
            match={fit}
            action={
              better && (
                <button type="button" className="ml-1 rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:text-ink" onClick={() => moveTo(better)} title={`His sliders stay; what they don't cover comes from ${better.name}`}>
                  Put him on {better.name}
                </button>
              )
            }
          />
        </div>
        <StyleControls
          settings={settings}
          home={profile.settings}
          homeName={profile.name}
          onSlider={setSlider}
          onSizing={(v) => setFlag('sizing', v)}
          onLimpTrap={(v) => setFlag('limpTrap', v)}
          onLeads={(v) => setFlag('leads', v)}
          onPairJam={(v) => setFlag('pairJam', v)}
        />
        <div className="grid gap-4">
          <Field label="Opens to" hint={exact ? `Exactly ${exact} BB, told at the table.` : 'His first-in raise size. A min-raise is cheap to call.'}>
            <Segmented<number>
              size="sm"
              value={settings.openBB ? (openBBOf(openBand(settings.openBB)) ?? 0) : 0}
              onChange={(v) => setFlag('openBB', v || undefined)}
              options={[{ value: 0, label: 'As his type' }, ...OPEN_CHOICES]}
            />
          </Field>
          <Field label="Raise size by hand" hint="A live tell: his size gives his hand away.">
            <Segmented<OpenTell>
              size="sm"
              value={settings.openTell ?? 'no'}
              onChange={(v) => setFlag('openTell', v)}
              options={[
                { value: 'no', label: 'No' },
                { value: 'strong', label: 'Bigger with strong' },
                { value: 'weak', label: 'Bigger with weak' },
              ]}
            />
          </Field>
        </div>
        <Field label="Reads and tells" hint="What to look for at the table: his tells, his favourite lines, when he tilts.">
          <textarea
            className={`${inputClass} min-h-20`}
            value={player.notes ?? ''}
            onChange={(e) => onChange({ ...player, notes: e.target.value })}
            placeholder="Snap-calls with draws, tanks with the nuts. Gets stuck after 11pm."
          />
        </Field>
        <ToldAtTable player={player} />
        <PlayerReads
          player={player}
          settings={settings}
          onChange={onChange}
          onSlider={setSlider}
          onFlag={(f) => (f === 'limpTrap' ? setFlag('limpTrap', 1) : setFlag('leads', 2))}
        />
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" onClick={() => onTest('play')} title="A 6-max table: you, him and your other saved players; bots play everyone but you">
            ▶ Play against {player.name}
          </Button>
          <Button onClick={() => onTest('watch')} title="Bots play every seat, cards face up, hand after hand">
            👀 Watch {player.name}
          </Button>
          <Button variant="ghost" onClick={onAsk} title="Answer the questions again (your last answers are filled in); sets the sliders from them">
            ? Re-check with questions
          </Button>
          <div className="flex-1" />
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </section>
      <Readout settings={settings} name={player.name} reference={profile.settings} referenceName={profile.name} playerId={player.id} />
    </>
  );
}

/** What you told the app about him during games (✎ on the live screen), by day. */
function ToldAtTable({ player }: { player: SavedPlayer }) {
  const log = player.observed ?? [];
  if (log.length === 0) return null;
  const days = new Map<string, string[]>();
  for (const o of log) {
    const day = new Date(o.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const q = QUESTIONS.find((x) => x.id === o.q);
    // told before the questions changed: an answer the current ones don't have, in its old words
    const now = answerLabel(o.q, o.a);
    const a = now === o.a ? oldAnswerLabel(o.q, o.a, 1) : now;
    days.set(day, [...(days.get(day) ?? []), `${q?.sets ?? o.q}: ${a}`]);
  }
  return (
    <Field label="Told at the table" hint="From ✎ on the live screen; each answer moved his sliders when you saved it.">
      <ul className="space-y-1 text-sm">
        {[...days.entries()].reverse().map(([day, items]) => (
          <li key={day}>
            <span className="text-xs text-faint">{day}</span> · {items.join(' · ')}
          </li>
        ))}
      </ul>
    </Field>
  );
}

/** Showdowns you saw him play (from the live screen), and what they suggest for his sliders. */
function PlayerReads({
  player,
  settings,
  onChange,
  onSlider,
  onFlag,
}: {
  player: SavedPlayer;
  settings: StyleSettings;
  onChange: (p: SavedPlayer) => void;
  onSlider: (id: SliderId, v: number) => void;
  onFlag: (f: 'limpTrap' | 'leads') => void;
}) {
  const reads = player.reads ?? [];
  if (reads.length === 0) return null;
  const { sliders, flags } = readSuggestions(reads, settings);
  const flagText = { limpTrap: 'Limp-reraises', leads: 'Leads into the raiser' };
  return (
    <Field label={`Showdowns seen (${reads.length})`} hint="From the live screen's “Showdown I saw”. Suggestions move a slider one step; you decide.">
      {(sliders.length > 0 || flags.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {sliders.map((x) => (
            <Button key={x.slider} variant="secondary" onClick={() => onSlider(x.slider, x.to)} title={`${Math.abs(x.votes)} of ${x.of} tagged reads lean ${x.votes > 0 ? 'up' : 'down'}`}>
              {SLIDER_INFO[x.slider].label} {x.from} → {x.to}
            </Button>
          ))}
          {flags.map((f) => (
            <Button key={f} variant="secondary" onClick={() => onFlag(f)}>
              Turn on: {flagText[f]}
            </Button>
          ))}
        </div>
      )}
      <ul className="space-y-1">
        {[...reads].reverse().map((r) => (
          <li key={r.id} className="flex items-start gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="w-12 shrink-0 font-mono font-semibold">{r.hand}</span>
            <span className="min-w-0 flex-1">
              {r.board && <span className="mr-2 font-mono text-xs text-muted">{r.board}</span>}
              {r.tags.map((t) => tagById(t)?.label ?? t).join(' · ') || <span className="text-faint">no tags</span>}
              {r.note && <span className="block text-xs text-muted">{r.note}</span>}
              <span className="block text-[11px] text-faint">{new Date(r.at).toLocaleDateString()}</span>
            </span>
            <button
              type="button"
              className="text-xs text-faint hover:text-danger"
              title="Delete this read"
              onClick={() => onChange({ ...player, reads: reads.filter((x) => x.id !== r.id) })}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
    </Field>
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
  const ro = !!profile.builtIn || !!profile.sharedBy;
  const set = (settings: StyleSettings) => onChange({ ...profile, settings });
  const account = useSyncStatus().account;

  return (
    <>
      <section className="space-y-5 rounded-lg border border-line bg-surface p-5">
        {ro ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">{profile.name}</h2>
              <p className="text-sm text-muted">
                {profile.sharedBy
                  ? `Shared by ${profile.sharedBy}. Duplicate it to make your own version, or build a player on it.`
                  : 'A built-in type. Duplicate it to make your own version, or build a player on it.'}
              </p>
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
                  set({ ...typeSettings(e.target.value), sizing: profile.settings.sizing, limpTrap: profile.settings.limpTrap, leads: profile.settings.leads, pairJam: profile.settings.pairJam });
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
          onPairJam={(pairJam) => set({ ...profile.settings, pairJam })}
        />
        {!ro && account && (
          <Toggle
            checked={!!profile.shared}
            onChange={(shared) => {
              if (shared && !account.limits.shareProfiles) {
                window.alert('Sharing profiles is part of the Pro plan.');
                return;
              }
              onChange({ ...profile, shared });
            }}
            label={<span className="text-sm">Share with everyone</span>}
            hint="Everyone with a LogiStack account sees this profile (read-only) and can build players on it. Your players and their notes stay yours."
          />
        )}
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
  const mine = profiles.filter((p) => !p.builtIn && !p.sharedBy);
  const shared = profiles.filter((p) => p.sharedBy);
  return (
    <>
      {shared.length > 0 && (
        <optgroup label="Shared with you">
          {shared.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.settings.base})
            </option>
          ))}
        </optgroup>
      )}
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

/** The seven sliders, the sizing habit and the specials. `home` = where the profile or type has them. */
function StyleControls({
  settings,
  home,
  homeName,
  readOnly,
  onSlider,
  onSizing,
  onLimpTrap,
  onLeads,
  onPairJam,
}: {
  settings: StyleSettings;
  home: StyleSettings;
  homeName: string;
  readOnly?: boolean;
  onSlider: (id: SliderId, v: number) => void;
  onSizing: (v: Sizing) => void;
  onLimpTrap: (v: LimpTrap) => void;
  onLeads: (v: Leads) => void;
  onPairJam: (v: PairJam) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
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
        <Choice<Sizing>
          readOnly={readOnly}
          value={settings.sizing}
          onChange={onSizing}
          options={(Object.keys(SIZING_INFO) as Sizing[]).map((s) => ({ value: s, label: SIZING_INFO[s].label, title: SIZING_INFO[s].what }))}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Limp-reraises" hint={LIMP_TRAP_HINT[settings.limpTrap]}>
          <Choice<LimpTrap>
            readOnly={readOnly}
            value={settings.limpTrap}
            onChange={onLimpTrap}
            options={[
              { value: 0, label: 'Never' },
              { value: 1, label: 'With a monster' },
              { value: 2, label: 'Often' },
            ]}
          />
        </Field>
        <Field label="Leads into the raiser" hint={LEADS_HINT[settings.leads]}>
          <Choice<Leads>
            readOnly={readOnly}
            value={settings.leads}
            onChange={onLeads}
            options={[
              { value: 0, label: 'Never' },
              { value: 1, label: 'Rarely' },
              { value: 2, label: 'Sometimes' },
              { value: 3, label: 'Often' },
            ]}
          />
        </Field>
        <Field label="Check-raises all-in with a pair" hint={PAIR_JAM_HINT[settings.pairJam]}>
          <Choice<PairJam>
            readOnly={readOnly}
            value={settings.pairJam}
            onChange={onPairJam}
            options={[
              { value: 0, label: 'Never' },
              { value: 1, label: 'Now and then' },
              { value: 2, label: 'Very often' },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

const LIMP_TRAP_HINT: Record<LimpTrap, string> = {
  0: 'His limps hold no big hands: isolate wide and big.',
  1: 'Limps half his aces, kings, queens and AK first in, to re-raise an isolation.',
  2: 'Limps most premiums and strong hands like TT or AQ to re-raise: isolate tighter.',
};
const LEADS_HINT: Record<Leads, string> = {
  0: 'Checks to the preflop raiser.',
  1: 'Leads only monsters: believe his leads.',
  2: 'Leads strong hands and draws instead of checking to the raiser.',
  3: 'Leads any piece: raise his leads.',
};
const PAIR_JAM_HINT: Record<PairJam, string> = {
  0: 'His check-raise all-in is a big hand.',
  1: 'Now and then jams a pair under the top card (99 on J-8-4) with three pots or less behind, more when draws are around.',
  2: 'Jams most pairs under the top card with three pots or less behind, sometimes second pair; short-stacked weaker pairs too: call his jams wider.',
};

/** A row of choices, or the chosen one as text when read-only. */
function Choice<T extends string | number>({
  readOnly,
  value,
  onChange,
  options,
}: {
  readOnly?: boolean;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
}) {
  if (readOnly) return <span className="text-sm">{options.find((o) => o.value === value)?.label ?? String(value)}</span>;
  return <Segmented<T> size="sm" value={value} onChange={onChange} options={options} />;
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
  const back = moved && !readOnly && (
    <button type="button" className="mt-1 text-xs text-muted hover:text-ink" title={`Back to ${homeName} (${home})`} onClick={() => onChange(home)}>
      ↺
    </button>
  );
  return (
    <div className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[170px_minmax(0,1fr)_80px]">
      <div className="flex items-start justify-between gap-3 sm:block">
        <div>
          <div className="text-sm font-semibold">{info.label}</div>
          <div className="text-xs text-faint">{info.what}</div>
        </div>
        {/* on a phone the number sits next to the name */}
        <div className="flex shrink-0 items-start gap-1 sm:hidden">
          <GradeNumber value={value} moved={moved} />
          {back}
        </div>
      </div>
      <div>
        <div className="relative">
          <RangeSlider
            min={1}
            max={5}
            step={0.5}
            value={value}
            disabled={readOnly}
            onChange={onChange}
            className="w-full disabled:opacity-60"
            style={{ accentColor: gradeColor(value) }}
            label={info.label}
          />
          <span
            className="pointer-events-none absolute -bottom-2 -translate-x-1/2 text-[10px] text-muted"
            style={{ left: `calc(${pct(home)} * 0.97 + 1.5%)` }}
            title={`${homeName}: ${home}`}
          >
            ◆
          </span>
        </div>
        <div className="mt-2 text-xs font-medium" style={{ color: gradeText(value) }}>
          {stepLabel(id, value)}
        </div>
        <div className="text-[11px] text-faint">Moves: {info.moves}</div>
      </div>
      <div className="hidden items-start justify-end gap-1 sm:flex">
        <GradeNumber value={value} moved={moved} />
        {back}
      </div>
    </div>
  );
}

/** A slider's number in its grade colour; outlined when it is moved off the profile. */
function GradeNumber({ value, moved }: { value: number; moved: boolean }) {
  return (
    <span
      className={`rounded-md px-2 text-lg font-bold tabular-nums ${moved ? 'ring-2 ring-ink ring-offset-1 ring-offset-surface' : ''}`}
      style={gradeBadge(value)}
      title={moved ? 'Moved off the profile' : undefined}
    >
      {gradeLabel(value)}
    </span>
  );
}

// ---- what it does ----------------------------------------------------------------------------------

const pc = (x: number) => `${Math.round(x * 100)} %`;

function Readout({ settings, name, reference, referenceName, playerId }: { settings: StyleSettings; name: string; reference: StyleSettings | null; referenceName: string; playerId?: string }) {
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
      <PlayerCheck style={{ label: name, settings }} exceptId={playerId} />
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
