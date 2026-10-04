# LogiStack v3 roadmap

Started 2026-10-04. Restart of v2 (`C:\Users\marius.dinu\Projects\LogiStack v2`, GitHub `LogiStack-v2`,
last commit `92dab74` on `Before_Cleanup`). v2's UI pieces are good and get ported; its betting
engine, saved-hand format and Django backend are replaced.

## Principles

- **Local-first.** No backend. Hands live in the browser (IndexedDB) with JSON export/import.
- **Hand = setup + events.** Everything else is derived by replaying. Amounts are integer minor units.
- **Core is pure and tested.** `src/core` has no React; every rule has a test.
- **Parked:** strategy tree / YAML strategies, solver, auth, tiers, quizzes.

## Milestone 1: the replayer plays a hand

1. [x] Project setup: Vite 8, React 19, TypeScript 7, Tailwind 4, Vitest 5.
2. [x] Hand format v0 (`src/core/hand/types.ts`) and six sample hands.
3. [x] Rules engine with tests: 2-10 seats, button and positions, antes (each / BB ante),
       straddles, uncalled bets, all-ins, short all-in doesn't re-open betting, side pots,
       split pots with odd chips, casino rake (cap, no flop no drop), 7-2 bounty, squid game.
4. [ ] Replayer UI (see below).

## Replayer UI requirements (from Marius, 2026-10-04)

**Look:** the classic Holdem Manager 3 replayer, dark mode first; one or two more themes later
(all colors as CSS variables from day one).
- Stadium table, dark felt, thin accent rail, our logo as a watermark.
- Flat seat plates: name (big), stack (bold), position as a small tag; orange border = to act.
- Big upright cards above the plates; four-color deck option.
- Bets as chip + number on the felt; dealer button.
- Pot box: pot, and pot odds for the player facing a bet ("1.61:1 (38.3%)").
- Header: hand title and hand number.
- Room on the plate for: status icons (winning / tilt / drinking), player-type stripe,
  squid tokens, last action. Pot box line for 7-2 / straddle / rake.
- Playback controls under the table; action list on the right (port v2's ActionLog).

**Options button → modal** (settings stored per browser):
- Theme.
- Amounts as chips, big blinds, or currency.
- Show all known hole cards always, or only Hero's.
- More options will be added later.

**Seat layouts:** hand-placed coordinates per table size, Hero rotated to bottom center.
10-max coordinates exist (`PkApp v3/Position coordinates.txt` = v2 `components/table/coordinates.ts`).
6/8/9-max: Marius has defined them somewhere - not found on this machine yet.

**Position names** (v2 SDD §2.1, matches the v2 range library): seats between BB and BTN take the
last N of `UTG, UTG+1, UTG+2, UTG+3, LJ, HJ, CO` (6-max = LJ, HJ, CO).

## Milestone 2: hand wizard + Lab

The wizard fills a hand's setup:
1. Table: number of seats (6 / 8 / 9 / 10), home game or casino (casino → rake settings), blinds,
   ante, currency, table name.
2. Players: per seat name, stack, player type, tags (winning, tilt, drinking, ...), sitting out.
3. House rules: 7-2 game, squid game, straddle (UTG / button / re-straddle), "blind raise" (TBD),
   other home-game rules to be added (candidates: bomb pot, run it twice, double board).

The Lab is the replayer with editing on: enter actions and cards, click any earlier action to
rewind, act from there to branch (the old line is dropped). Save to IndexedDB, JSON export/import.

## Milestone 3: ranges and decisions

- Range painter (port v2 `RangeGrid` / `PokerMatrix`), assign a range to a villain at the current spot.
- Equity worker on Card52 (exact on flop/turn/river, Monte Carlo preflop).
- Call vs fold: equity vs pot odds. Raise: one-street EV with villain's response split by hand class
  (port v2 `HandEvaluatorInt` categorizer for that; fix its 2 failing tests).
- v2's 60 preflop ranges and 18 player types: export from Postgres to JSON first.

## Open questions

- Where do replayer hands come from besides the Lab: typed in only, or also imported from online
  hand histories (which sites)?
- 7-2 and squid house rules beyond the current options.
- Sessions (several hands at one table, for squid rounds and running statuses): now or later?
- What "blind raise" means in your games.
