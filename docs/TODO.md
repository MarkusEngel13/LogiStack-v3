# Review to-do (Marius, from 2026-10-09)

Marius's notes from using the app, one line each. We agree them in batches of 2-3; nothing is built
until agreed. `[ ]` open · `[~]` agreed, to build · `[-]` parked · `[x]` built.


## Tonight (Marius, Cloudflare dashboard) - 2026-10-10
- [x] Done (2026-10-10): open to Everyone after all (see 67). Earlier idea: 4-5 testers by email. Zero Trust Free is chosen (card
      on file, not charged; at 50 seats further logins are blocked, not billed). Cloudflare One ->
      Access controls -> Policies -> "author-page - Production" -> Edit -> Include, Emails: add theirs.
- [-] Open sign-up (parked): Zero Trust -> Access -> Applications -> logistack -> Policies: a policy for
      everyone (Include -> **Everyone**, login by one-time PIN by email). New users land on Free by
      themselves (the server makes the account at the first login); you upgrade them in Users and plans.
      Keep "author-page - Production" as it is. Mind the free Zero Trust limit: 50 users.
- [ ] Optional: Zero Trust -> Settings -> seat expiration, so users inactive for a while give their
      seat back by themselves (stays within 50).

## Going live (soon)
- [ ] Buy a domain and move off `logistack.mariusdinu81.workers.dev` (custom domain on the Worker;
      Cloudflare Registrar if it sells the ending). `logistack.com` is taken (registered 2011, a
      software company "Logistack" uses it) - check `.poker`, `.app`, `logistackpoker.com` at the
      registrar, and think about the name clash before going public.
- [ ] Then: own sign-up and login instead of Cloudflare Access (no 50-user limit), see comment 5.
- Name, parked (2026-10-10): **VillainGym** is the favourite (villaingym.com had no registration
  record on 2026-10-10 - confirm at the registrar). Other free-looking .com: poolexploit, exploitreads,
  exploitlive, poolreads, readthepool, learnthepool, poolprofiler, villainprofiler, exploittrainer,
  homegamelab. Or keep LogiStack with logistack.poker ($52/yr, available).

## Monetization (Germany) - 2026-10-10
Marius is self-employed in Germany (writer). No lawyers: we do it together, with a legal-text
service for the texts and the protection against warning letters. Rough work: 1.5-2 weeks.
- [ ] Tax setup (Marius, before the first sale): the app is a business (gewerblich), not writing:
      register a Gewerbe (about 20-60 EUR) and tell the Finanzamt about the new activity. VAT status
      is one for all his work (writing + app): check whether he is Kleinunternehmer (under 25,000 EUR
      last year and 100,000 EUR this year, all activities) or charges VAT - ask the Finanzamt.
- [ ] Payments: a merchant of record (Paddle, 5 % + 0.50 USD per payment, no monthly fee) sells in
      its own name and handles VAT in every EU country, invoices, refunds. Stripe directly is
      cheaper but then EU VAT (OSS) is ours. Price yearly or 8+ EUR/month so the fixed fee stays
      small. Web only (app stores take 15-30 %).
- [ ] Build: Paddle checkout, a webhook that sets the plan (plans.ts tiers exist), a cancel page.
- [ ] Own login (email code and/or Google), sessions, replacing Cloudflare Access (50-user cap);
      an email-sending service (free to ~20 USD/month).
- [ ] Account: delete my account (with all data) and export my data (GDPR); admin "Delete user".
- [ ] Legal pages: Impressum (address needed: own or an address service, ~10-20 EUR/month),
      privacy policy (processors: Cloudflare, Paddle, email service - sign their DPAs), terms.
      Texts from a service (IT-Recht Kanzlei 9.90-24.90 EUR/month), kept up to date by it.
- [ ] Checkout: tick box "start now, I lose the 14-day withdrawal right" for immediate access;
      a cancel-subscription button (Kündigungsbutton, § 312k BGB) and, separate from it, the
      withdrawal button (required since 19 June 2026), both always reachable.
- [ ] No cookie banner as long as we store only what the app needs (login, app data): no
      analytics, no ads, no trackers. Say so in the privacy policy. Any analytics -> banner.
- [ ] Cloudflare Workers Paid (5 USD/month): enough for 1000+ users (10M requests, 5 GB D1),
      D1 Time Travel as the backup. Check the storage per user once hands pile up.
- [ ] No real-money gambling, no ads for poker sites: a training tool stays outside gambling law.
- Running costs at the start: about 25-60 EUR/month plus payment fees.
- [ ] Prices (agreed 2026-10-10), VAT included:
      | Plan    | Monthly   | Yearly | Early bird (locked while subscribed) |
      | Premium | 9.99 EUR  | 79 EUR  | 5.99 EUR / 49 EUR a year |
      | Pro     | 19.99 EUR | 159 EUR | 11.99 EUR / 99 EUR a year |
      Kept after VAT and Paddle: Premium ~7.46/month or ~62/year, Pro ~15.37/month or ~125/year
      (early bird: ~4.30, ~38, ~9.05, ~78). Show yearly as a monthly figure ("79 EUR a year, 6.58 a month").
- [ ] Tiers: Free = 20 hands, 3 players, 2 profiles, 3 ranges, the daily quiz set. Premium = no
      limits, size explorer, "what happens if", EV tables, quiz practice. Pro = Premium + stats on
      your players, sharing profiles, and (before early bird ends) the exploit quizzes, the Tonight
      dashboard, Live tips. Pro must be clearly worth double.
- [ ] Early bird: honest and limited - e.g. the first 200 members or until a fixed date, and keep it
      (no fake countdowns: UWG). The price stays as long as the subscription runs (a Paddle discount
      that never expires on that subscription). A 14-day free Pro trial.
- Scenarios (assumptions, year one; half of year-one payers early birds, ~6.60 EUR kept per payer
  per month, ~8.30 at full price later):
  cautious 1,000 sign-ups, 2.5 % pay = 25 -> ~165 EUR/month; middle 5,000, 3.5 % = 175 -> ~1,150;
  strong 20,000, 4.5 % = 900 -> ~5,900 (later ~7,500). Reach decides it (English + German,
  communities, a poker YouTuber or podcast); yearly plans and the daily quiz keep people.
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

## Touch (phone) - 2026-10-10
43. [x] A finger that scrolls never changes anything: the 13x13 grid paints only after "✏ Edit"
        (coloured frame, "Done"), else a swipe scrolls and a tap shows the cell. Mouse unchanged.
44. [x] Sliders on a phone move only on a sideways drag (a vertical swipe or a tap on the track
        does nothing), with − / + buttons beside them (`RangeSlider` in `controls.tsx`).
45. [x] "+ Sliders" makes a draft player, saved only once you name him or change something;
        deleting a player, profile, hand or fishy mark (and copying a profile) shows "… · Undo" for
        6 s instead of a confirm box (`ui/toast.tsx`). Cause of this morning's two unnamed players.

## Layers - 2026-10-10
46. [x] No more windows on windows: every "tell me more" opens in one inspector (`ui/layers.tsx`) -
        a column on the right on a computer (the page moves aside and stays in view), a sheet from
        the bottom on a phone - with a trail ("Options · you › Gabi's range") and ← Back.
47. [x] Back always works: ←, Esc, and the phone's back button or gesture (one history step per layer).
48. [x] EV table, "Explore bet sizes" and "What happens if" are one "Options up close" panel with
        tabs: EV (with Stable?), How they answer, Next street.
49. [x] The card picker opens next to where you tapped (a sheet on a phone); the question wizard,
        the review of changed questions and the exploit check are pages with ← Back; real
        windows only for Options, the account, users and plans, "unsaved changes", naming a chart.

## Quizzes (Gym) - 2026-10-10
50. [x] Gym tabs "Play · Watch" and "Quizzes"; the home Gym card says "Play · Watch · Quiz" and shows
        how many of today's questions are left. Results sync to the account (kind `quiz`: one item a
        day plus your levels, chip set and missed questions). `core/quiz/*`, `ui/quiz/*`.
51. [x] Today's ten (the same on every device), a streak, levels (8 of the last 10 right moves you
        up), missed questions come back in later sets, stats per quiz.
52. [x] Guess the stack (5 levels, v2's ladder, your own chip colours and values, the stack's look by
        player type), Table maths (4: pot odds, sizes, raises, SPR, side pots, geometric bets,
        minimum defence, bluff share), Ranges (3: charts, facing an open, flop equity), Draws and
        combos (3: outs, draws on a board, combos with blockers).
53. [x] Range building (3): bucket a hand facing an open or a 3-bet (value / bluff / call / fold, read
        from the library charts: a raise with several stronger hands only calling is a bluff), and
        paint a whole chart (scored on the combos either side plays, 80 % to pass).
54. [x] Ranges on the board (5): bucket your hand on the flop (HHP's buckets), ahead / close / behind
        his opening range, count his can-play-for-stacks combos, who has more nuts (raiser or BB),
        river blockers.
55. [x] Read the player (2): his stack's look, his tracker numbers (VPIP, PFR, 3-bet, AF).
56. [ ] Next step: exploit quizzes (best line against this villain, read the villain from a hand,
        his combos value vs bluff on the river), postflop buckets by bet / check-call / check-fold
        (need the EV engine as the reference), bet size by texture, stack style shown on the tables.

## Review of the phone day - 2026-10-10
57. [x] Guess the stack, level 3: the hidden chip landed on a chip the slob had put on top from the
        next tower, so the answer key was off (€47.40 for €46.65). Fixed + a test over 3000 stacks.
58. [x] The quiz chart painter: a finger paints only after "✏ Edit" or picking a bucket ("Done" to
        scroll again), like the PF Ranges grid.
59. [x] `CLAUDE.md` in the repo: the rules for every session, phone included (no AI lines in commits).
60. [x] Quiz storage (revised): keep only today's set, the questions you got wrong (they come back;
        max 40; Guess the stack's never kept) and a score line a day. Older days fold into one
        history item. The admin keeps every day in full.
61. [x] Free plan: at most 10 quiz items on the server (`state`, history, the last days; only those
        names accepted), and only the day's set: practice beyond it is for paid plans. A set already
        started can be finished.
62. [x] Range building facing an open: buckets 3-bet for value / 3-bet merged (thin value,
        protection) / 3-bet as a bluff / call / fold, read from the library's "vs 4Bet" charts: goes on
        vs a 4-bet = value; folds and stronger than most calls = merged; folds and weaker than hands
        that only call = bluff (BTN, SB, BB have charts; other seats borrow the nearest). Facing a
        3-bet: value / bluff / call / fold, clear cases only.
63. [x] Paint the chart: scored on raise / call / fold only (the chart's own words); value, merged
        and bluff stay in the one-hand questions.
64. [x] Admin: every quiz level open.
65. [x] Player habit + wizard question: check-raise all-in with a pocket pair under the top card
        and above the second (sometimes second pair), on the flop or turn, when he fears draws.
        Only at a reasonable SPR (about 3 or less: a fish doesn't x-raise 10x the pot); 100 BB
        usually too deep, but a 3-bet pot (90 BB behind, pot 20-25 BB) is close. At a small SPR also
        with weaker hands when he puts you on AK with no pair. Levels: never / now and then / very
        often. Feeds his jam range (Lab range story, EV table calls wider, bots, Live tip).
66. [ ] Options panel on a laptop (takes 58 % of the width): Marius checks first.

## Open sign-up - 2026-10-10
67. [x] Anyone logs in with a code Cloudflare emails them (policy Everyone, Zero Trust Free, seats
        expire after 2 weeks without a login) and lands on Free by themselves. Done by Marius.
68. [x] Admin dashboard: its own module card (a joker, light red, only the admin sees it). Overview
        tiles, Premium requests, users (search, filters, sort; table on a computer, cards on a
        phone; a user's panel: plan, role, items against the limits, note, delete), the plans'
        limits, the advice upload. Plan limits stay in the code for now.
69. [x] "Ask for Premium" for Free users; the admin approves or declines. Later: a subscription link.
70. [x] "Consider this": the playbook's advice in our own words goes to the server (the admin uploads
        it from his browser; the coaches' words, names and videos stay there); Free sees 1 piece per
        moment, Premium and Pro 3. The admin keeps "Playbook says" (+ "users see"). The coaches'
        wording gets edited later.
71. [x] A welcome card for new users: Free's limits, their data on the server (only theirs), ask for
        Premium or deletion under the account.
72. [x] Shared profiles show "LogiStack" (or a pseudonym), never the sharer's email.
74. [x] No "playbook" anywhere users read (not even "it never leaves your browser"): the advice is
        simply given. Only the admin's upload and his file loading still name it.

## Strategy Bible - 2026-10-10
75. [ ] HHP's second channel "Hungrier Horse" (short videos, 3-4 min): gather it like the main
        channel (list, transcripts, claims, bible check) and fold its advice into the HHP playbook.
76. [ ] Once a month: gather whatever HHP (both channels) and Carrel put out since the last run,
        extract, rebuild the playbooks, upload the new advice for users (Admin dashboard).

## Later
39. [x] Solution stability: nudge the inputs (preflop range 5-10 % narrower or wider, other
        parameters 5-15 % up or down) and show whether the suggested line holds or flips - a line
        that flips on a 5 % change is not a safe exploit.
73. [ ] Onboarding (long term): the app can be overwhelming at first, so on a new user's first login
        a short intro to the modules (Live, Lab, Gym, Players, PF Ranges, Equity: what each is for).
        Afterwards, a detailed walkthrough per module, started by choice, never forced. A Help menu
        lists every walkthrough so they can be restarted at any time. Remember per account what was seen.
