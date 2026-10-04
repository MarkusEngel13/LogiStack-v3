# LogiStack v3

Local-first poker hand replayer and Lab (hand editor with ranges and pot odds). Successor to
[LogiStack-v2](https://github.com/MarkusEngel13/LogiStack-v2); see [docs/ROADMAP.md](docs/ROADMAP.md).

## Run

```powershell
npm.cmd install
npm.cmd run dev      # app at http://localhost:5173
npm.cmd test         # unit tests (engine + evaluator)
npm.cmd run build    # type check + production build
```

(`npm.cmd` instead of `npm` because PowerShell's execution policy blocks the `npm.ps1` shim on this machine.)

## Layout

```
src/core/            pure poker logic, no React
  cards.ts           Card52 integers (same encoding as v2)
  evaluator.ts       7-card showdown evaluator
  hand/types.ts      hand record format v0 (setup + events) - the source of truth for the format
  engine/            rules engine: replay a hand to any step, pots, side pots, rake, side games
  fixtures/          sample hands, each one testing specific rules
src/                 UI (React + Tailwind)
```

A hand is stored as **setup + events** only. Stacks, pots and results are always recomputed by
`replay()` / `replaySteps()`, so the replayer steps through states and the Lab branches by
truncating the event list.
