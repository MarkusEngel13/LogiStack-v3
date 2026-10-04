# LogiStack v3 roadmap

Started 2026-10-04. Restart of v2 (`C:\Users\marius.dinu\Projects\LogiStack v2`, GitHub `LogiStack-v2`,
last commit `92dab74` on `Before_Cleanup`). v2's UI pieces are good and get ported; its betting
engine, saved-hand format and Django backend are replaced. v3 lives on GitHub as `LogiStack-v3` (private).

## Principles

- **Local-first.** No backend. Hands live in the browser (localStorage now, IndexedDB with the Lab)
  with JSON export.
- **Hand = setup + events.** Everything else is derived by replaying. Amounts are integer minor units.
- **Core is pure and tested.** `src/core` has no React; every rule has a test.
- **Parked:** strategy tree / YAML strategies, solver, auth, tiers, quizzes.

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
6. [x] Options modal: theme (dark only so far), amounts as money / chips / BB,
       show all known hole cards or only Hero's.

## Next: replayer

**Look:** the classic Holdem Manager 3 replayer, dark mode first; one or two more themes later
(all colours are CSS variables already).
- Header: hand title and hand number.
- Board cards and pot box in the middle: pot, and pot odds for the player facing a bet
  ("1.61:1 (38.3%)"); a line for 7-2 / straddle / rake.
- Last action shown on the plate ("Raise 110", "Blind raise"); folded players dimmed.
- Playback controls under the table; action list on the right (port v2's ActionLog).
- Result at the end: winners per pot, rake, 7-2 bounties, squid payouts.

## Then: the Lab

The replayer with editing on: enter actions and cards, click any earlier action to rewind,
act from there to branch (the old line is dropped). IndexedDB storage.

## Then: ranges and decisions

- Range painter (port v2 `RangeGrid` / `PokerMatrix`), assign a range to a villain at the current spot.
- Equity worker on Card52 (exact on flop/turn/river, Monte Carlo preflop).
- Call vs fold: equity vs pot odds. Raise: one-street EV with villain's response split by hand class
  (port v2 `HandEvaluatorInt` categorizer for that; fix its 2 failing tests).
- v2's 60 preflop ranges and 18 player types: export from Postgres to JSON first.

## Decisions on record

- **Position names** (v2 SDD §2.1, matches the v2 range library): seats between BB and BTN take the
  last N of `UTG, UTG+1, UTG+2, UTG+3, LJ, HJ, CO`. 6-max = LJ, HJ, CO; 9-max starts at UTG+1.
- **Seat layouts:** only 10-max coordinates ever existed (v2 / PkApp v3); v3 computes all sizes
  along the rail. A drag-to-place layout editor (v1 `LayoutEditor.jsx`) can store per-size tweaks later.
- **Blind raise** = a raise made without looking at the cards (home games, usually a drinking player).
  Marked on the action (`blind` on the event) while entering the hand, when it's clear who acts -
  not in the wizard (Marius, 2026-10-04).

## Open questions

- 9-max naming: keep UTG+1 … CO (the v2 convention), or UTG, UTG+1, UTG+2, LJ, HJ, CO?
- Where do hands come from besides the wizard/Lab: also imports of online hand histories (which sites)?
- More home-game rules for the wizard (bomb pot, run it twice, double board, ...)?
- Sessions (several hands at one table, for squid rounds and running statuses): now or later?
