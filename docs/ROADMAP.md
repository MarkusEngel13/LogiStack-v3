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

## Next

- Bet / raise EV: villain's fold / call / raise response (a "continues with X %" slider first,
  then hand categories from v2's `HandEvaluatorInt`, with its draw bug fixed).
- Postflop range narrowing (today the automatic ranges stay preflop ranges after the flop).
- Ranges page: top-x % selection, quick selects; v2's card backs.

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
