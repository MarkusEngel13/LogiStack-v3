# LogiStack on Cloudflare

Plan agreed 2026-10-08: move to Cloudflare step by step so others can test the app. Accounts with
tiers (Marius = admin, others edit or view), each account its own data, only the player profiles
shared.

## State (2026-10-09)

Deployed as a **Worker with static assets** (Cloudflare now steers new projects to Workers, not
Pages): `wrangler.jsonc` serves `dist/` as a single-page app; Workers Builds runs `npm run build`, then
`npx wrangler deploy` on every push to `main` (build token "logistack build token"). Live at
https://logistack.mariusdinu81.workers.dev - headers checked (noindex, no framing, long cache on assets).
Preview addresses switched off in `wrangler.jsonc` (`preview_urls: false`).

**Still to do (next session, with Marius): the login.** The site is public until then (harmless: no
data, no playbook, not indexed). Worker `logistack` -> the **Access** tab (or Domains -> workers.dev row)
-> Enable Cloudflare Access; Zero Trust first time: team name + Free plan (asks for a payment method,
charges nothing); policy Include -> Emails = Marius's address only, login by One-time PIN. Test in a
private window: Cloudflare's login page, email code, the app. Don't switch workers.dev off - Access
goes in front of it. (Seen 2026-10-09: the Overview said "No URLs enabled" while the address still
answered - a stale overview.)

The Pages route below was the first plan; kept for reference.

## Step A - hosting behind a login (no database)

The app stays as it is: everything runs in the browser, each tester's hands live in their own
browser (localStorage / IndexedDB). Cloudflare only hosts the built files and asks for a login.

Ready (2026-10-09):
- Build checked from a clean clone: `npm ci` + `npm run build` -> `dist/` (~1 MB: page, equity worker,
  preflop table). The lockfile carries the Linux builds Cloudflare's build machine needs.
- The production build played bot hands in Edge: equity worker, preflop table, EV table, no errors.
- `public/_headers` (never indexed, never framed, long cache for hashed assets) and `public/robots.txt`.
- Nothing private in the build: the HHP / Carrel playbook is loaded per browser from your file and
  never ships; tests (which cite claim ids) aren't part of the build.

To do together in the dashboard (dash.cloudflare.com; menu names may have moved a little):

1. **Pages project from GitHub.** Workers & Pages -> Create -> Pages -> Connect to Git -> GitHub
   (authorize Cloudflare for `MarkusEngel13`, only the `LogiStack-v3` repo).
   - Project name: `logistack` (address `logistack.pages.dev`; if taken, pick another).
   - Production branch: `main`. Framework preset: None (or Vite).
   - Build command: `npm run build`. Build output directory: `dist`. Root directory: empty.
   - Environment variable: `NODE_VERSION` = `22`.
   - Save and Deploy (first build 1-2 min). From then on every push to `main` deploys itself;
     other branches get preview addresses.
2. **Zero Trust (first time only).** Pick a team name and the Free plan. Cloudflare asks for a
   payment method even for the free plan; nothing is charged (up to 50 users).
3. **The login.** Pages project -> Settings -> General -> Enable access policy. On its own this locks
   only the preview addresses (`*.logistack.pages.dev`), not `logistack.pages.dev` itself, so:
   select Enable access policy again, and in the Access application's public hostname delete the
   `*` in the subdomain and save. Check that there are now two Access applications (the site and
   its previews). In each policy: Allow, include Emails = your address (testers later), login by
   one-time PIN (a code by email). Session length: a month is comfortable.
4. **Test.** A private window -> `https://logistack.pages.dev` -> Cloudflare's login page -> email code
   -> the app. A wrong email gets no code.

Notes:
- Until step 3 is done the address is public (but not indexed, and nothing private is on it).
- Data is per browser and device: hands entered on the phone are not on the laptop (that's step B).
  Export / import JSON moves them by hand.
- The playbook: load it once per browser (Lab -> HHP says -> Load playbook).

## Step B - accounts, plans, sync (built 2026-10-09 on branch `step-b`)

What it is:
- **One D1 database** (`migrations/0001_init.sql`): `users` (email, plan, role) and `items` (owner,
  kind, id, the item as JSON, shared, updated_at, deleted). Every row has an owner; the Worker only
  hands out the caller's own rows, plus profiles their owners shared.
- **The Worker** (`worker/index.ts`) serves the app and `/api` (me, items, admin). Who is calling comes
  from Cloudflare Access's signed token, checked against Access's keys (`worker/auth.ts`, tested);
  swapping Access for a sign-up service later touches that one file.
- **Plans** (`src/shared/plans.ts`): Free (20 hands, 3 players, 2 profiles, 3 charts), Premium
  (unlimited), Pro (+ share profiles, stats). Admins and editors get everything. The server
  enforces the counts; items over a limit stay in that browser, and the account badge says so.
- **Sync** (`src/ui/sync/`): the app still reads and writes the browser; logged in, it pulls and
  merges at start and pushes every change a moment later. Watched bot hands stay local unless kept.
  Without the server (`npm run dev`) the app runs local-only, as before.
- **Shared: only profiles** (Marius, 2026-10-09). Players and their reads stay private.
- **Backup** (Options -> Backup): export / import everything this browser keeps. Browser data
  belongs to one address, so this is how the data made in VS Code (localhost) gets onto the website.

### Tonight, in order

**1. The login (Cloudflare dashboard, ~15 min).**
- Zero Trust (first time): pick a team name, Free plan (asks for a card, charges nothing).
- Workers & Pages -> `logistack` -> Settings -> Domains & Routes -> the workers.dev row -> enable
  **Cloudflare Access** (or the Access tab). Policy: Allow, Include -> Emails = your address; login
  by one-time PIN. Session length: a month.
- Note two values: the **team domain** (`<team>.cloudflareaccess.com`, Zero Trust -> Settings) and
  the app's **AUD tag** (Zero Trust -> Access -> Applications -> logistack -> Overview).
- Test in a private window: Cloudflare's login page, the email code, the app.

**2. The database (VS Code terminal, ~5 min).**
```powershell
git fetch; git checkout step-b; npm.cmd ci
npx.cmd wrangler login                          # opens the browser once
npx.cmd wrangler d1 create logistack            # prints a database_id
```
- Put that `database_id` into `wrangler.jsonc` (replacing the zeros).
```powershell
npx.cmd wrangler d1 migrations apply logistack --remote   # creates the tables
```

**3. The settings (dashboard, ~3 min).** Workers & Pages -> `logistack` -> Settings -> Variables
and Secrets -> add three, type **Secret** (deploys keep secrets; plain variables would be wiped):
`ADMIN_EMAILS` = your address, `ACCESS_TEAM_DOMAIN` = the team domain, `ACCESS_AUD` = the AUD tag.
(Secrets because the repository is public.)

**4. Go live.**
```powershell
git add wrangler.jsonc; git commit -m "D1 database id"; git checkout main; git merge step-b; git push
```
Workers Builds deploys in a minute or two.

**5. Check.**
- The site: top right shows your name and **Admin**, with a green dot.
- Move your data: on `npm run dev` (localhost) Options -> Backup -> Export everything; on the
  website Options -> Backup -> Import. It syncs up by itself; the account badge shows the counts.
- A second device (the phone): log in, the same hands and players are there.
- Friends: add their emails to the Access policy; after their first login they show up in
  Account -> Users and plans, where you set Premium / Pro.

Later schema changes: a new file in `migrations/`, then `wrangler d1 migrations apply logistack --remote`
before pushing the code that needs it.

### Before charging money (not now)
- Access is for teams (free up to 50 users): paying customers need a sign-up service (Clerk, Auth0,
  Supabase Auth ...) in `worker/auth.ts`.
- Payments: a merchant of record (Paddle, Lemon Squeezy) handles EU VAT; its webhook sets
  `users.plan`. Check the provider accepts poker training tools.
- Players' notes on real people are personal data (GDPR): privacy policy, private by default.
- The HHP / Carrel playbook stays out of anything sold.
