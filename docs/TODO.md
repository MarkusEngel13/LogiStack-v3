# Review to-do (Marius, from 2026-10-09)

Marius's notes from using the app, one line each. We agree them in batches of 2-3; nothing is built
until agreed. `[ ]` open · `[~]` agreed, to build · `[-]` parked · `[x]` built.

## Phone layout
1. [x] Phone: the LogiStack logo above (or just under) the menu bar. (ROADMAP "Next")
2. [x] Phone: the menu bar wraps its text and links instead of running off the screen. (ROADMAP "Next")
3. [x] Phone, Hands: smaller buttons that wrap, so a hand's title stays on one line (now 3-5 lines). (ROADMAP "Next")
40. [x] Phone, Ranges: the 13x13 matrix is tiny (about 30x30 px): make it big enough to see and edit. (ROADMAP "Next")

## Account
41. [x] The account popup (click on the badge) has no close button.
42. [x] "Users and plans" has no close button either, and opens too high: its top is off the screen.

## Home and naming
4. [x] Call the tabs "modules" from now on. (ROADMAP "Next")
5. [x] A start page: the modules as v2's animated playing cards; Hands + New join as the Lab; a Gym;
       the app opens there. (ROADMAP "Next")

## Players
6. [x] Grades 1-5 colour-coded: bright green (1), cyan, yellow, orange, bright red (5). (ROADMAP "Next")
7. [x] Profile questions: brainstorm the whole set again (8-13 are his examples). (ROADMAP "Next")
8. [x] Raise size answers: 3-4 BB, 5-6 BB, 7 BB+ (some raise bigger than 7 BB). (ROADMAP "Next")
9. [x] 3-bet: add "very rarely". (ROADMAP "Next")
10. [x] Limp re-raise: add "often" / "rarely" (realistic? does it help?). (ROADMAP "Next")
11. [x] Postflop aggression: add "c-bets with mixed frequency" (known to be average, not "don't know"). (ROADMAP "Next")
12. [x] Q7 vs Q8: how are they different? Clarify or merge. (ROADMAP "Next")
13. [x] Q9 donk bet: add "sometimes" / "rarely". (ROADMAP "Next")
14. [x] When the profile questions change, a wizard helps adapt the existing players to them. (ROADMAP "Next")
15. [x] Check: his typical fish come out as "unknown" - look at their stats. (ROADMAP "Next")
16. [x] Check: Jansen comes out LAG and Michel TAG - feels reversed (Michel much looser, c-bets less). (ROADMAP "Next")

## Range editor
17. [x] An explicit Save button, no auto-save; warn when leaving with unsaved changes. (ROADMAP "Next")
18. [x] A pill "Unsaved" as soon as the range differs from the saved one. (ROADMAP "Next")

## EQ
19. [x] Quick ranges, more of them and the same set in the main window and the player edit modal:
        Clear, Top 3 % (QQ+, AK), Top 5 %, Top 10 %, Top 10 % capped (minus the very top).
20. [x] After the flop, "Random flop" becomes "Random turn" and deals a turn (then river). (ROADMAP "Next")

## Watching the bots
21. [x] A full-screen table (watching the bots and elsewhere; nice on the phone).
22. [x] Controls stay put when an action happens; the pause button visible on the phone.
23. [x] The bots' decision log at the bottom of the page.
24. [x] Bots at 9-max tables, not only 6-max.

## Lab, Decision panel, modals
25. [x] Question: the Decision panel's EV preflop - from the known hole cards or from ranges? One
        street or more?
26. [x] Size explorer smell: stack-off combos raise more against ½ pot than against ⅓ pot - should
        be the other way round. Hand: "#4 Home game" (9.10.2026 22:07, 9-max €0.10/€0.25): Hero SB
        8♠6♠ vs Seat 2 (BB), flop J♥9♥4♠, pot €1.50, Hero first. Seat 2 raises with "can play for
        stacks" ▲52 % vs ⅓ pot, ▲81 % ½, ▲99 % ¾, ▲100 % pot; "thick value" ▲49 / 55 / 82 / 49 %.
27. [x] Every range / EQ / what-if modal shows the spot in its title: who vs whom, known cards, board.
28. [x] "What happens if": clearer whose range is which (villain "reaches the turn", hero "your
        equity"?) - better visual cues.
29. [x] "What happens if": pick other bet sizes (½ pot was missing) - in the modal or in Options.
-  Keep: opening a hand in the Lab to watch the ranges change ("basically what I was asking for").

## Advice naming
30. [x] Stop calling it "HHP" (HHP says, HHP tips): a neutral name, no copyright trouble if the app
        is ever sold. How?

## Live module
31. [x] Table setup: only the players in seat order from Hero, with stacks; no "who's button".
32. [x] Each hand starts with one click on the button seat (or the BB?).
33. [x] Click the first player who acts and his action; everyone before him folded (no clicks).
34. [x] Raise buttons 2 / 3 / 4 / 5 BB, plus a box with quick +/- steps.
35. [x] Flop, turn, river: pick the cards, then the actions the same way.
36. [x] Skip to the showdown at any point to enter the seen cards before forgetting them - by cards
        or from the 13x13 matrix (when no flush is possible).
37. [x] The long list of preset outcome buttons is too long to use under pressure (replaced by 31-36).
38. [x] Keep "no flush card / flush card", add "second flush draw on the turn".

## Later
39. [~] Solution stability: nudge the inputs (preflop range 5-10 % narrower or wider, other
        parameters 5-15 % up or down) and show whether the suggested line holds or flips - a line
        that flips on a 5 % change is not a safe exploit.
