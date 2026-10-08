# LogiStack v3 roadmap

Started 2026-10-04. Restart of v2 (`C:\Users\marius.dinu\Projects\LogiStack v2`, GitHub `LogiStack-v2`,
last commit `92dab74` on `Before_Cleanup`). v2's UI pieces are good and get ported; its betting
engine, saved-hand format and Django backend are replaced. v3 lives on GitHub as `LogiStack-v3` (private).

## Principles

- **Local-first.** No backend. Hands live in the browser (localStorage; a hand is a few KB, so this
  holds well over a thousand hands - move to IndexedDB when that gets tight) with JSON export.
- **Hand = setup + events.** Everything else is derived by replaying. Amounts are integer minor units.
- **Core is pure and tested.** `src/core` has no React; every rule has a test.
- **Parked:** strategy tree / YAML strategies, solver, auth, tiers, quizzes.
- **Long jobs:** ask Marius before starting or re-running anything that takes minutes (the preflop
  table build takes ~22 min).

## Done

1. [x] Project setup: Vite 8, React 19, TypeScript 7, Tailwind 4, Vitest 5.
2. [x] Hand format v0 (`src/core/hand/types.ts`) and six sample hands.
3. [x] Rules engine with tests: 2-10 seats, button and positions, antes (each / BB ante),
       straddles, uncalled bets, all-ins, short all-in doesn't re-open betting, side pots,
       split pots with odd chips, casino rake (cap, no flop no drop), 7-2 bounty, squid game.
4. [x] **Hand wizard** (`src/ui/wizard/`), 4 steps:
       - Table: seats (HU-10), home game / casino (casino → rake %, cap, no flop no drop),
         currency, blinds, ante (none / every player / BB ante), table name.
         Changing the big blind rescales the straddle and ante, and in money games also the
         stacks (same BB depth) and the 7-2 / squid amounts. Amounts accept "0.25" and "0,25".
       - Players: click a seat on the table preview; name, stack, player type (colour stripe),
         status (winning / tilt / drinking), hole cards (card picker), Hero,
         sitting out, dealer button, empty seat. "Fill empty seats", "Same stack for all".
       - House rules: straddle (UTG / button-Mississippi, amount, re-straddle),
         7-2 game (bounty, who pays, suited counts, showdown only), squid game (value, squids held).
       - Review: the table after the blinds are posted (engine state), summary, title, hand number,
         errors from the engine's own setup checks. Create → saved, JSON export.
       The last setup is remembered for the next hand (hole cards and title cleared).
5. [x] Table component (`src/ui/table/`): HM3-style dark stadium table; seat positions computed
       for every size 2-10 (`geometry.ts`), Hero always bottom centre.
6. [x] Options modal: theme (dark / light), amounts as money / chips / BB,
       show all known hole cards or only Hero's, card faces, four-colour deck.
7. [x] Stack controls in the wizard: ±1 / ±10 / ±50 BB buttons, presets 50 / 100 / 150 / 200 / 300 BB,
       ↑/↓ in the stack field (Shift = ±10 BB).
8. [x] **Replay screen** (`src/ui/replay/`), opened from the Hands list (sample and saved hands)
       or after "Create hand":
       - Header: hand number, title, game details; badges for straddle / 7-2 / squid.
       - Table: board, HM3 pot box (pot, pot odds for the player facing a bet, side pots), bets,
         action tags on the plates ("Raise", "Call", "All-in", "Blind raise"), folded players dimmed.
       - Cards: Hero always face up; others per the Options setting, all shown at showdown.
       - End: winners glow with "Wins €X", final stacks include 7-2 / squid payments,
         pot box summarises rake and side games.
       - Playback: start / back / play-pause / next / end, jump to street, speed 0.5-2×;
         keys ←/→, Space, Home/End.
       - Action list on the right: reads like a hand history, street headers with cards,
         future rows dimmed, click a row to jump, result rows at the end.
       - A broken event (e.g. an imported file) stops the replay there with a message.

9. [x] **Straddles as actions** (2026-10-05): the wizard's house rules say what's allowed
       (UTG, button/Mississippi, re-straddles, usual amount); the straddle itself is an event entered
       before the first preflop action. Older saved hands are converted on load (`hand/migrate.ts`).
10. [x] **The Lab** (`src/ui/lab/`, `replay/HandScreen.tsx`): your own hands open editable,
       "Create hand" goes straight in, sample hands are replay-only with "Edit a copy".
       - Player to act: fold / check / call, bet or raise with an amount box and presets
         (2-4× preflop, 2.5-4× and pot facing a raise, ⅓-pot after the flop), all-in, "Blind" tick.
       - Straddle offers (per house rules) before the first preflop action.
       - Board: choose the cards or deal at random from the unseen cards.
       - Showdown: show unknown hands or muck; a winner without showdown can still show (7-2).
       - Click a line in the action list to go back to just before it; entering there replaces
         what came after (branch). Undo (button / Ctrl+Z) brings it back. Saved on every change.
       - Click a seat to set that player's hole cards.
11. [x] **Felt and cards** (2026-10-05): the felt reads pot box → board → logo, top to bottom; the
       board stays on the centre line, the pot box grows upward. v2's four card faces (Standard,
       Modernist, Royal, HUD) and the four-colour toggle are back, in Options.
12. [x] **Light theme** (2026-10-05): pale chrome and a grey felt; rail, pot box and cards as in dark.
       All colours are tokens in `index.css`; the saved theme is applied before first paint.

13. [x] **Range data** (`src/core/ranges/`): 13x13 grid in v2's layout, charts (raise / call / all-in %
       per hand) and combo weights with card removal; range text both ways (AA, AKs, TT+, ATs+,
       A5s-A2s, KQs-87s, AhKh, KQo:0.5). v2's 60 charts and 18 player types imported from v2's data
       dump (`scripts/import-v2-ranges.mjs` → `library.json`).
14. [x] **Fast evaluator** (`src/core/fastEval.ts`): bit masks, ~48 M seven-card hands/s in Node; equal to
       the readable evaluator on every 5-card hand and (SLOW=1) all 133.8 M seven-card hands.
15. [x] **Equity** (`src/core/equity/`): heads-up exact on every street - preflop from a table of all
       47,008 matchup classes (`scripts/build-preflop-table.mjs`, ~22 min once, result committed),
       after the flop every runout; multiway by Monte Carlo. Runs in a web worker in the app.
16. [x] **Ranges page** (v2's `/preflop` editor ported): brush sliders (fold gives way first), presets,
       Smart Paint, click-and-drag, combos on hover, stats bar, compare, text in/out, undo. Library
       charts stay untouched; the first stroke makes your copy ("MINE"), which saves itself.
17. [x] **Decision panel in the Lab**: the player to act against everyone who has put chips in.
       Each range comes from the chart for their preflop spot (opened, called, 3-bet, squeezed,
       vs a limp, ...; nearest position, 200 BB charts when deep, yours before the library's),
       or from your own painted range at that point (saved with the hand; dropped by a branch).
       Equity, pot odds needed, call / fold and EV(call), assuming the hand is checked down.
18. [x] **EQ page** (2026-10-06): 2-6 players, each an exact hand or a range (text, chart part, or
       painted with the Lab's range editor), board of 0/3/4/5 cards. Two players exact - range vs
       range from the table preflop, after the flop every runout with a sorted sweep (win and tie
       split too); 3+ players Monte Carlo (200,000 deals). Heat map: each hand class of a player
       against the others, per combo on hover. The setup is remembered in the browser.
       Hands played part of the time fill that part of their heat-map cell; picked board cards
       show greyed in the card picker.
19. [x] **Hand classes** (`src/core/handClass.ts`, 2026-10-06): made class (straight flush ... top / 2nd /
       3rd / low pair, ace-high, king-high, air) with kicker, level (nut / 2nd / 3rd / low) or position;
       flush draws with their level, straight draws (open = 2+ completing ranks, gutshot) and whether
       they draw to the nut straight, backdoors, overcards. Only what the hole cards add counts.
       Rewritten rather than ported (v2 had board-flush/straight and card-order bugs besides the draw
       bug). `rangeClasses()` = the Excel's made-hands and draws summaries, with average equity per
       class; shown on the EQ page for the heat-map player.

## Direction (agreed 2026-10-06): HHP made visible, fear and greed as the engine

Goal: practise hands that show Hungry Horse Poker's concepts instead of stating them: the opponent
capped after calling a small flop bet on a wet board, top pair that calls any size on a blank turn,
the static board that hides traps.

Sources:
- The spec: `OneDrive\Poker\165 - HungryHorse Plan\List of strategies HHP.docx` (77 video summaries).
  Its claims become tests.
- Marius's earlier attempts, same folder: `01 HHP Plan.xlsx` (sheet Rules = HHP's decision tree for
  Hero; DRY = his wet/dry and static/dynamic scoring) and `30 !!! New hand simulator REV3.xlsm`
  (preflop ranges per archetype in RangeDB; its ToDo already planned post-flop buckets, a "what-if"
  class filter, a drill "Director", the "quantum villain" and a psychology engine).
- Psychology: prospect theory (cautious when ahead, risk-seeking when behind) and regret theory;
  poker studies Smith, Levere & Kurtzman 2009 (looser after a big loss) and Eil & Lien 2014
  (break-even effect when losing, less risk when ahead).

**Organising principle (Marius, 2026-10-06): every player decision derives from fear and greed.**
Both are anticipated regret, measured in pots:
- fear: "I had the best hand and let them outdraw me". Strongest when many next cards hurt the hand
  (wet, dynamic boards) → bet or raise now, big (fast-play, the "big bet = strong" sizing tell).
- greed: "I had the best hand and didn't get paid". Wins when little can hurt the hand (static
  boards) → check, call, trap. On the river, fear of it checking through → lead.
- also loss aversion on absolute money (comfort in BB), embarrassment (showing a failed bluff, being
  pushed around) and the session reference point (winning → protect the win, losing → chase).
Player types are weights on these motives; statuses shift them. Texture is never a hand-made label:
it falls out of the fear numbers.

Found 2026-10-06: the step-3 response model below is texture-blind. BB defence vs a BTN open, ⅓-pot
bet: a Reg raises sets 90 % on J♠9♦2♠ and 97 % on A♣7♦2♥ (HHP: raise on wet, trap on static), so it
shows the Reg capped after a call on A-7-2. Phase 1 replaces it.

Defaults unless Marius says otherwise: HHP's bucket names; heads-up first, multiway later.

### Phase 1: the fear-and-greed engine (`src/core`, test-first)
1. [x] HHP buckets on top of the hand classes (`src/core/buckets.ts`, 2026-10-06): can play for
       stacks, thick value, thin value, showdown value, strong draws, weak draws, air; one main
       bucket per combo, a strong draw lifts thin value / showdown value / air into the draw bucket.
       Note (HHP video 7zlh-B0dSII): HHP's other split - value / showdown value / bluff - is
       relative to the opponent's range after their actions, so it comes from equity with step 3.
2. [x] Fear numbers (`src/core/fear.ts`, 2026-10-06): per combo, the share of the other range it
       beats now ("ahead") and, per next card, the share that overtakes it; fear = the part of the
       lead one card takes away on average. Exact, ~0.1 s for two real ranges; flop or turn only.
       BTN vs BB, can-play-for-stacks bucket: J♠9♦2♠ fear 4.9 % with 10 scary cards (the spades),
       A♣7♦2♥ 1.1 % with none. EQ page: "buckets and fear" panel (two players, flop or turn) with
       the card map of the next card per bucket.
3. [~] Motive model v1 (`src/core/motives/`, 2026-10-06): `decide()` scores every option for
       every combo - checked to / first to act (check, bet ⅓-1.5 pot, all-in only at low SPR) or
       facing a bet (fold, call, raise 2.5x/3.5x, all-in) - from greed x gains, loss aversion x
       losses (climbs past the comfortable amount), fear x the share of next cards that bite
       (weighted by how nut-like the hand feels), delayed gratification (discounted by fear: slow-
       play only pays on safe boards), fear of tough decisions, embarrassment of a caught bluff,
       liking for betting / calling; soft choice. Beliefs about the other side: `beliefs.ts`
       (continue share per bucket and size). Profiles and statuses: `profile.ts` (8 presets;
       winning = protect the win; tilt; drinking lively / tired; session losses = chasing).
       `rangeAfter()` = the narrowed range after an option (Phase 2's quantum villain).
       Fish preset on J♠9♦2♠ vs a ⅓-pot c-bet: sets raise 99 %, draws call 94 %, air hardly raises;
       on A♣7♦2♥ sets call 92 % (slow-play). Still open: the old `villain/response.ts` (used nowhere
       now but its own tests) can go; multi-street lines (Phase 3); calibration of the presets (Phase 5).
       Drinking (research, 2026-10-06): alcohol raises risky choices (lab tasks, e.g. BART at
       0.65 g/kg), heightens sensitivity to immediate reward rather than punishment (Iowa Gambling
       Task, 160 people, 2025), increases bets after losses (Tobias-Webb, Clark et al. 2019) and
       narrows attention to salient cues (alcohol myopia, Steele & Josephs 1990); its effect is
       biphasic - stimulant while rising, sedative while falling. So: drinking = less loss
       aversion, long shots overweighted, less embarrassment, noisier, chasing after losses;
       "lively" adds aggression, "tired" turns it into calling. Both are wizard statuses (Marius,
       2026-10-06): "Drinking, lively" 🍺 and "Drinking, tired" 🥴, one or the other.
       Spec: the Strategy Bible's claims (`OneDrive\Poker\165 - HungryHorse Plan\Strategy Bible`);
       HHP-0QWJrclAjlA-04, Mark: "generally fear and greed drive our opponents' decisions".
4. [~] HHP doctrine as tests (`src/core/motives/motives.test.ts`, 15 passing, claim ids in the
       names): sets fast-play on J♠9♦2♠ and slow-play on A♣7♦2♥; a call caps the range on the wet
       board only; draws passive; air rarely raises; neutral profile = pot odds; strong hands bet
       bigger than thin value; air bets less in position than out of it, bluffs go small;
       recreational players value-bet thin rivers less than regs; strong hands raise a small turn
       bet; low SPR + fear of tough decisions = jams; chasing after session losses; drinking
       lively / tired; protecting a win. More claims from the Strategy Bible to come.

### Phase 2: see it (the Lab)
5. [x] Quantum villain v1 (`src/core/motives/story.ts`, 2026-10-06): every player plays their whole
       range; each postflop action keeps each combo's chance of taking it (the motive model, the
       player's type and status from the wizard). Hero too: "Hero's line" = what it tells the
       others. Heads-up only (an action with 3+ players in leaves the range). A range set in the
       Lab resets that player from there on (god mode). Runs in the equity worker for the whole
       hand at once (~5 s for six actions; decisions cached, so one new action costs one
       decision); the Decision panel's equity uses the narrowed ranges. Showdown: "From range"
       deals the unknown hand from what is left. Tests: `story.test.ts` (a ⅓-pot call caps the
       Fish on J♠9♦2♠, not on A♣7♦2♥; resets; cache; multiway).
       Seeing it found three model faults, fixed: (a) out of position the model led its strong
       hands into the raiser - now a check to the player with the initiative expects their bet
       (60 %), so the free-card fear shrinks and the check-raise keeps trap value (HHP: heads-up
       donks are mostly weak); (b) believed folds grew too steeply with size, so every bluff was
       an overbet - beliefs now mostly inelastic (a small bet gets most of the folds); (c) the
       exact size narrowed too hard - now a soft size tell (75 % size, 25 % "a bet is a bet").
6. [x] Range story (2026-10-06): per player a bucket bar of the range now; per action "combos
       before → after" and the share that can play for stacks (marked "capped" when it halves);
       click an action for how much of each bucket took it, why, and the whole range's split.
       The why (`motives/why.ts`): the option the bucket preferred, the one it beat, and the
       motives that tipped it, plus the next cards that hurt it - "Raise 3.5x over Call: fear of
       being outdrawn, greed · 29 of 47 turn cards hurt it". "View" opens the range window: the
       13x13 coloured by bucket with what was taken out greyed (since the flop, or by one action),
       each combo on hover, the story with the motive amounts, and on the flop or turn the fear map
       of the next card against the other range. Still heads-up only (multiway: later).

### Phase 3: choose it (sizes and lines)
7. [x] Size explorer (2026-10-06, `motives/sizes.ts`, Lab: "Explore bet sizes…"): for the player
       to act (heads-up, after the flop) every bet - or raise, when facing a bet - from ⅓ pot to
       all-in: the other range's fold / call / raise, what the size says about your range (bucket
       bar), your EV with known cards (one street: checked down after a call, the better of fold
       and call against a raise), and the grid of who keeps going by bucket and size (elastic or
       inelastic). "Bet" enters the size in the Lab. Doctrine tests in `sizes.test.ts`.
       Model changes it forced (all HHP-backed, see the tests):
       - range reading per player (`rangeReading`, Fish 0.2, Reg 0.75): how much they narrow the
         other's range from what the other does. Recreational players think about their own hand:
         top pair calls any normal size (inelastic). Each player sees the other's range through
         their own reading (story.ts keeps a "seen" range per player).
       - respect for big bets (from ¾ pot) grows on later streets and is capped (turn 1.5x, river
         2x): big late bets are underbluffed and players know it, so they overfold to overbets
         (Marius, 2026-10-06; HHP-S7eq8103TDg-52, HHP-vsSFecrDrb0-32). It also makes raising into
         a big bet scary: raises against big bets are the nuts (HHP-hb5V55q-tTU-41/42).
       - probability weighting only overweights long shots; it no longer shrinks a big favourite
         (sets folded to shoves).
       Still smells (for the "does it smell right?" page): thick value raises small flop bets a lot
       (fear of the draws); the EV is one street only.
8. [x] "What happens if" (2026-10-06, `motives/whatIf.ts`, Lab: "What happens if…", flop and
       turn, heads-up): each line - check (behind), bet ⅓ / ¾ / 1.5x pot, or call / raise when
       facing a bet - with the other player's answer now (fold / call / raise, or check behind /
       bet), the part of their range that reaches the next street (bucket bar, combos, pot, your
       equity), and that range on the next card: a blank (changes least), a scare card (hurts you
       most, helps them most) or any card picked from a 13x4 map coloured by how it moves your
       equity. On J♠9♦2♠ with A♥J♥ against a Fish: check behind lets 262 combos reach the turn,
       ⅓ pot 217 and capped (its sets raised), 1.5x pot 72 - mostly top pair and good draws; the
       Q♠ costs 18-21 points whatever the line, the 7♦ nothing. Tests: `whatIf.test.ts`.
       Next: a second step (what they do on that card); multiway for the lines.
8b. [x] **EV this street, every option** (2026-10-09, `motives/sizes.ts`, `ui/lab/EvTable.tsx`): the Decision
       panel shows check and each bet size, or fold, call and each raise, all measured the same way (Marius: one
       street is enough for now) - chips won from here on, checked down once the street is over. A bet: they
       fold, call or raise (then the better of fold and call); a check out of position: they check behind or
       bet (then fold or call) - before, a check counted as a free showdown; a call: the players behind answer
       first. Best marked, each line playable, hover for how they answer. Works itself out heads-up and on the
       turn and river; a multiway flop on a click (three-way ~5 s, four-way ~11 s in Node). Not seen: a
       check-raise after a check, later streets (trap value, implied odds). The explorer and the panel share
       one answer (worker cache).
       **Size explorer multiway** (same day): every player answers in turn, each counting a player who
       answered before him as far as that player called (`decide()`'s new `presence`; left out = everyone in,
       so the story and the bots are unchanged); the first raise ends the round (you against the raiser,
       earlier calls dead money); equity against several by Monte Carlo. A bucket grid per player. Doctrine
       test: a bet gets fewer folds from two players than from one (HHP-rQP5RyjqanM-10). "What happens if"
       stays heads-up.
       Smell seen (already in the model before, unchanged): a Reg facing a ⅓-pot bet raises about half the
       time - on 2♥6♠7♣ as the preflop raiser facing a lead, 52 % (58 % of his air), thin value about half.
       Goes with the "LAG and maniac raise almost every c-bet" calibration below.

Multiway (2026-10-06): the motive model decides against everyone still in - equity and lead are
the products of the heads-up ones, a card is scary if it hurts the hand against anyone, a bet wins
the pot only if all fold and each caller adds to it, and a flat call with players still to act
behind keeps them in (trap value per player behind). The story narrows every action of every
player; each player sees each other's range through their own range reading. It produces HHP's
multiway claims (tests in `multiway.test.ts`): players stab less and value-bet thinner hands less
the more players are in; a lead into the raiser is draws and stabs heads-up (Fish on J♠9♦2♠: 22 %
can play for stacks) but strong three-way (85 %) - Gethen's donk point; strong hands flat more
with a player behind. Not yet: the size explorer and the lines are still heads-up.
Seats (2026-10-06): pointing at a player shows their range there (combos, buckets, last action),
clicking opens the range window; hole cards are set by clicking the cards. The range window's
13x13 has three fills (Marius, 2026-10-07): Range (share of each cell's combos left, removed grey),
Normalized (scaled so the fullest cell is full: the shape of a thin range), Full (every cell still in
the range filled by its bucket mix).
Check-raises (Marius's test, 2026-10-07; HHP-iTV2FKgpTZ0-57, HHP-S7eq8103TDg-43): a raise of one's own
bet reads as a much bigger bet, and even players who ignore big bets respect it (check-raises are
underbluffed and everyone has learned it - Marius); called flop / turn stabs are less embarrassing
than river bluffs (players over-stab), a bluff-raise still is; more players = more witnesses
(audience effect). Against a check-raise to 641 the c-bettor folds 85-86 % (Reg) and 73-80 % (Fish)
on J♠9♦2♠ and A♣7♦2♥, against a 1.5x pot lead (825) 57-65 %.

### Phase 4: practise it (trainer)
9. [ ] Director: set up a spot (positions, pot type, villain type, board texture) and deal from the
       ranges.
10. [ ] Concept library: each HHP spot as a ready hand; timed drills (15-30 s); multiverse buttons
        (another turn card, another villain); HHP's answer from Marius's Rules tree; Hero's own
        choices tagged with the fear they show.
10b. [~] Gym (Marius, 2026-10-07): play hands against bots. Done (2026-10-07): bots after the flop
        (`motives/bot.ts`): the player to act's real cards draw an action from the motive model's
        chances for that combo - the same chances that narrow its range, so its line always fits
        its range story. Lab: "🤖 Bot plays" for the player to act; "Bots play the others after the
        flop" acts for every seat but Hero. A bot without cards is dealt a hand from its range at
        that point (what its actions so far allow). In bots mode their cards stay hidden until the
        showdown, the note shows only the action, and when the hand is over "How the bots decided"
        lists every bot move with its chances. Before the flop (`motives/preflop.ts`): the chart for the spot the bot faces (open, vs limpers, vs an open, squeeze, vs a 3-bet, vs a 4-bet), bent by player type - width against a Chen-formula hand order (Fish x1.7, whale x2.6, nit x0.7), calls and limps instead of raises for Fish and whales (premiums still raise), more raises for LAG and maniac - and HHP's live sizes (open 3 BB, isolate 6 BB + 1 per limper in position, 7 + 1 out of it, 3-bet 3x / 4x, 4-bet 2.5x / 3x, 5-bet all-in). A bot with unknown cards gets a random hand. The play loop (2026-10-07, `hand/nextHand.ts`): when a hand is over, "Deal next hand" (key N) deals the next one at the same table - the button moves, stacks carry over (under a big blind = rebuy), Hero gets two random cards - and with bots on, the board is dealt by itself too, so the table plays until it's Hero's turn. Watch mode (2026-10-07, hand flag `watch`): "👀 Watch the bots" on the Hands page sets up a 6-max casino table of mixed bot types with no Hero (`wizard/watchTable.ts`); bots play every seat with all cards dealt face up at the start, every decision shows live with its chances, and the next hand is dealt by itself. Pause (the Decision panel then shows the player to act), Step (one move), speed ½x-4x. A watched hand makes room for the next one unless kept (📌), so the library doesn't fill up; ticking "Watch" on your own hand keeps it. Cost: preflop moves take ~0.2 s, postflop decisions 2-10 s each (multiway flops slowest) - the worker computes the model over every combo of each range. Still to do: a session view (results over hands), the 'smells fishy' button on bot moves, faster postflop bots.
        Plan: After the flop each bot holds real
        cards and draws its action from the motive model's chances for that combo (the same model
        that narrows ranges, so the range story after the hand shows exactly how its line read);
        before the flop it plays its chart frequencies. Needs: preflop bot play (charts per spot,
        sizes, limps), a deal / play loop, timing, a hand review screen. Caveats: one-street
        thinking, fixed size menu, no memory between hands, uncalibrated presets.
10c. [x] Faster postflop bots (2026-10-08), exact instead of by bucket: (a) a bet's continuing range is
        the other range's buckets scaled by how often each goes on, so `partsByGroup` (equity/field.ts)
        sweeps the board once per opponent keeping totals per bucket, and every bet size re-weights
        them (`fromParts`) - before, each size ran its own sweep; (b) a bot decides from its one real
        hand (the model scores each hand on its own, so the chances are identical). Same decisions,
        ~4x faster: 30 seeded hands at a mixed 6-max table, postflop decision median 916 -> 207 ms,
        p90 3.9 -> 0.9 s, worst 18 -> 4 s (multiway flops); a hand 5.4 -> 1.5 s on average.
        `core/sim/play.ts` plays whole hands headless (the stats report's engine); timing:
        `SLOW=1 npx vitest run src/core/sim/bench.test.ts`. Left: multiway flops (fear numbers are
        n×m×49 per opponent), the story's full-range decisions (needed to narrow ranges).
10d. [x] **Players page** (2026-10-08, `core/players/`, `ui/players/`): real players and profiles as six
        sliders in poker words (Loose, Preflop aggression, Postflop aggression, Sticky, Respects big
        bets, Bluffs; 1-5 in half steps, 3 = plays the price, the number is the exploit), a sizing
        habit and two specials (limp-reraises premiums; leads into the raiser = `expectsBet`). Each
        slider moves one or two motive weights (`style.ts` MAP); what the sliders don't cover comes
        from the base type, and a slider left at its type's position keeps the preset's value
        exactly. Bluffs is calibrated on frequencies, not on the neutral profile (no embarrassment
        bluffs ~90 % of the air). A profile = a style with a name; a player = a profile + the sliders
        that differ for them (+ reads and tells). Readout: 4 preflop spots (the bent charts) and 5
        postflop spots (the motive model, in the worker), next to the profile's or type's numbers.
        Seats carry a `style` snapshot (the hand stays self-contained); the wizard's seat editor picks
        a saved player; "Play against" / "Watch" deal a 6-max test table from your last wizard game.
        Export / import as JSON.
        Question wizard (2026-10-08, `core/players/questions.ts`, "+ Ask me" / "Re-check with questions"):
        11 questions about what you have seen him do (table size first; top pair on a dry board for
        Sticky), "Don't know" keeps the profile's value; the closest profile is suggested and the
        player is saved on it with the sliders that differ (answers kept for re-checks). "How many
        hands" is a share of hands turned into Loose through the charts at your table size (VPIP from
        first-in play x 0.66, so a reg shows ~19 % nine-handed, ~23 % six-handed); Loose 5 widened so
        it reaches ~60 %. Next: the readout as the calibration screen (Phase 5); a player's
        reads into the advice tags (playbook "opponent calls anything" etc.).

### Phase 5: calibrate
11. [ ] Fit to the Excel table (was step 4) for the magnitudes; Marius's DRY scoring as a
        cross-check of the computed fear numbers.
12. [ ] "Does it smell right?" page (Marius, 2026-10-06; not urgent). The model's numbers are too
        abstract to check one by one, so: a random spot (positions, pot type, street, board, bet
        size) and a random player (type, drinking / tilt / winning / session result) → what their
        range does, shown as ranges and bucket bars (raised / called / folded). Marius looks and
        says "feels right" or "smells fishy", with a note; the verdicts are saved with the spot so
        they become test cases (fishy ones point at the motive weight to fix).

### Strategy Bible backlog
The bible (`OneDrive\Poker\165 - HungryHorse Plan\Strategy Bible`): HHP complete on 2026-10-08 -
all 197 videos, 9058 claims (two age-restricted videos skipped).
- [x] HHP: every video, the vlogs too.
- [~] Charlie Carrel: all of `videos_CC.csv` (~399), the bankroll-challenge episodes too (he gives
      advice while playing). Drama / reaction videos with under 4 poker terms per 1000 words are
      skipped (they gave 0-6 claims; the transcript is kept). 184 videos / 3512 claims by 2026-10-09
      (batch 7: 30 videos, mostly 2021 bankroll-challenge streams - thin, 5-44 claims each). His
      angle differs from HHP's: little fear/greed, much ego and embarrassment (reverse tells,
      "nobody wants to look stupid"), and he calls range-checking lazy - against HHP's "check your
      range out of position against recs".
- [x] HHP playbook (2026-10-08): claims grouped by street into ~300-claim chunks, pass 1 merges each
      chunk into entries tagged with the advice vocabulary, pass 2 merges each street across chunks
      (big streets in three parts: first to act / facing a bet / the rest), `build.py` fills in the
      sources (video at the moment, speaker, quote). 1334 entries (1186 tied to moments, 148
      general). Tools in `Tools\ytdlp\work\playbook`; output `Strategy Bible\playbook\HHP_playbook.json`
      and a readable `HHP_PLAYBOOK.md`.
- [ ] Charlie Carrel's playbook when his videos are in (`group.py` is HHP-only so far), shown beside
      HHP's, with "Charlie disagrees" where they clash.
- [ ] vs_doc: check the playbook against the old 77-summary doc.

### Advice at the right moment ("HHP says", 2026-10-08)
`core/advice/spot.ts` names any moment of a hand in the playbook's words (street, pot type,
players, position, preflop role, decision, size faced, the line so far, board and scare cards,
the opponent's type and statuses, depth); `core/advice/playbook.ts` matches the playbook's
entries to it (every dimension an entry names must fit; the most specific first, then the best
sourced). The Lab shows the top 3 under the Decision panel for the player to act, with what
drives the opponent, the coaches' own words and a link to the video at that moment. The
playbook is private: the user loads their copy from a file (kept in the browser's IndexedDB),
it never ships with the app. The bots' log carries the top entry's title beside each move (watch
mode and the Lab). Next: the gym's coach voice ("HHP says fold here" vs what you did), Charlie
Carrel's playbook beside HHP's, and "smells fishy" verdicts on entries that show at the wrong moment.

Sizing habits (2026-10-08, from Marius's 25c game - the numbers are for orientation). Before, every
type picked its size by payoff only, so value hands drifted to pot. Now each type has a usual size
per street and a usual raise, and leaving them costs "habit" (a motive, shown as such): the
autopilot regs (and unknown players) bet half pot on every street whatever the hand and raise 3x;
TAGs (the thinking players) size by payoff; nits bet small; fish mean half pot but land nearer two
thirds on the flop and under half later, and size up mostly on the river (so a big river bet from a
fish is a tell, his usual size is not); maniacs bet half pot to pot, rarely more. The chips then go
in like a person's: counted in the head and rounded (`motives/chips.ts`; fish stray a fifth, regs
little, drinking more). Preflop opens by type: regs and TAGs 3-4 BB, fish mostly 3, TAGs and
maniacs sometimes 5, maniacs now and then 8.
- [ ] Limping ranges for fish (they limp a lot; today a share of their opens turns into limps).
- [ ] Charlie's call-side embarrassment: the fear of calling into the nuts (players fold to a
      confident shove) and the ego pull of the hero call.
- [ ] LAG and maniac raise almost every c-bet and bet nearly every hand (their liking for
      aggression outweighs everything) - calibrate.

Drinking: both, by phase (see step 3). "Winning" = "protect the win" (tighter), as in Marius's
simulator and Eil & Lien (done in `motives/profile.ts`).

Later: multiway; HHP's own preflop charts (the doc lists 200 BB ranges) beside v2's library; villain
preflop ranges per type from the simulator's RangeDB (TAG, LAG, NIT, LAS, ...); postflop narrowing
for 3+ players; Ranges page top-x % and quick selects; v2's card backs.

## Before the change of direction: villain response model (2026-10-06)

Goal: approximate how a villain answers every Hero bet size, realistic but with few inputs, then
the EV of each size (Marius's old Excel "03 - New GUI.xlsm" did this with 4 numbers per hand class
per spot: raise % at 1 BB and at pot, continue 100 % up to A BB and 0 % at B BB, linear in BB).

Design decisions:
- One decision rule for every villain combo and Hero size: scores for fold (0), call (what the
  call wins at that price x realisation + call incentive - fear + sunk cost) and raise (value at the
  top, bluff-raises with draws; aggression; less against big bets; a raise that is all-in is a shove),
  turned into probabilities by a soft choice (noise). S-curves come out of the rule.
- Sizes in % of pot, but absolute money counts: fear grows once a call passes the player's comfort
  amount in BB (a 300 BB shove at 400 BB deep is not "just 80 % pot"); sunk cost when committed.
- ~7 settings per player type (presets: station, reg, nit, maniac, ...): call incentive (GTO Wizard
  style), price-driven vs hand-class-driven, comfort/fear, sunk cost, big-bet read (respects vs
  suspicious; chosen instead of modelling a perceived Hero range per size), aggression, noise.
- Player statuses already in the wizard shift the settings: tilt, drinking, winning.
- Draw strength matters: draws to strong hands (nut flush draw, draws that can stack the opponent)
  get a bigger calling boost than weak gutshots ("people love to call with draws").
- God-mode override per hand class stays possible, as the exception.
- Marius's Excel table becomes the first preset by fitting the settings to it (a calibration test:
  if the fit is poor, a setting is missing).

Build order:
1. [x] Hand classes for any board (done 2026-10-06, see 19 above).
2. [x] Villain's equity per combo against Hero's range on the board (exact engine, range-vs-range mode).
3. [x] Response model (`src/core/villain/response.ts`, done 2026-10-06; texture-blind, see above). Scores in pot units:
   fold 0; call = mix of price thinking (equity x realisation x pot after the call - the call) and
   hand thinking (class equity vs 40 %, small size effect) + call incentive - fear (BB beyond the
   comfort amount) + sunk cost + draw love (by draw strength, needs chips behind); raise = the same
   value without the call-only likings + aggression x (strength - size) + semi-bluffs; soft choice
   with the player's noise. Big-bet read is a power curve on equity (bluff-catchers drop, nuts stay).
   Presets for the wizard's 8 types; tilt / drinking / winning shift them; per-class overrides.
   Checked: neutral player = pot-odds rule; continuing falls with size below 50 % equity (except
   suspicious players, by design); rises with strength; sets never fold; fear at 400 BB deep;
   sunk cost; draws; statuses; a station folds less than a reg, a reg less than a nit (from 1/2 pot).
   Not checked any more: "defends near MDF" - only true against a balanced Hero range.
   Change of plan: step 2 (villain per-combo equity vs Hero's range) came with the EQ page
   (`rangeVsRange(...).players[1].vsField`).
4. Fit to the Excel table → moved to Phase 5 (11).
5. Lab: villain profile + sliders, S-curve preview per class, EV-by-size curve with the best size;
   the same model for Hero facing a bet → moved to Phase 3 (7).

## Decisions on record

- **Position names** (Marius, 2026-10-05): SB, BB, BTN; back from the button CO, HJ, LJ; any seats
  before those are UTG, UTG+1, UTG+2, ... from the first to act. 6-max = LJ HJ CO,
  9-max = UTG UTG+1 UTG+2 LJ HJ CO, 10-max adds UTG+3. The v2 range library uses 10-max names, so
  range lookup goes by the number of players still to act behind (9-max UTG ↔ 10-max UTG+1).
- **Seat layouts:** only 10-max coordinates ever existed (v2 / PkApp v3); v3 computes all sizes
  along the rail. A drag-to-place layout editor (v1 `LayoutEditor.jsx`) can store per-size tweaks later.
- **Blind raise** = a raise made without looking at the cards (home games, usually a drinking player).
  Marked on the action (`blind` on the event) while entering the hand, when it's clear who acts -
  not in the wizard (Marius, 2026-10-04).

## Open questions

- Where do hands come from besides the wizard/Lab: also imports of online hand histories (which sites)?
- More home-game rules for the wizard (bomb pot, run it twice, double board, ...)?
- Sessions (several hands at one table, for squid rounds and running statuses): now or later?
