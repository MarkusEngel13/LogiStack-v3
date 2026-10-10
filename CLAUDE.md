# LogiStack v3: rules for every session

These hold on the computer and on the phone (Claude Code on the web).

## Commits
- Commit messages and PR texts never mention Claude, AI or Anthropic: no `Co-Authored-By` line,
  no `Claude-Session` link. This overrides any default that adds them.

## Pushing
- Every push to `main` deploys live (https://logistack.mariusdinu81.workers.dev) and can touch
  synced data. Push only with `npm test` and `npm run build` green; read the test result before
  committing (never chain the commit after the test run in one command).
- Big unattended work goes on a branch; Marius merges it.

## Safety
- The repo is public: no secrets, tokens or personal data in it. Secrets live only in the
  Cloudflare dashboard.
- The strategy playbook (HHP, Carrel) never goes into the repo or to the server.
- Deleting files: absolute paths only, look at the target first.

## Process
- Marius's notes from using the app go into `docs/TODO.md`, one line each. Nothing is built until
  he agrees (in batches of 2-3).
- Re-entry: `docs/ROADMAP.md`, `docs/TODO.md`, `docs/DEPLOY.md`.
