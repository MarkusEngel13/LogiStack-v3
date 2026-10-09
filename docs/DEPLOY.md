# LogiStack on Cloudflare

Plan agreed 2026-10-08: move to Cloudflare step by step so others can test the app. Accounts with
tiers (Marius = admin, others edit or view), each account its own data, only the player profiles
shared.

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

## Step B - accounts, shared profiles, sync (later)

- A Worker API next to the site, one D1 database (every row has an owner; one database per account
  would be the same in effect and much more to manage).
- Who is calling: Cloudflare Access already proves the email (the `Cf-Access-Jwt-Assertion` header,
  checked in the Worker), so no passwords in the app.
- Roles in a table: admin (Marius: everything, manages users), editor (edits shared profiles),
  viewer (sees them). Everyone always edits their own hands and players.
- Shared: player profiles. Own: hands, own players, ranges, settings - synced, so they follow the
  account across devices and are backed up.
- The playbook never goes to the server.
- Open before building: who the testers are. Shared profiles are notes on real people (drinking,
  tilt, reads); if testers are from the same home game they see what is written about them - use
  nicknames, or keep notes and tells private to whoever wrote them.
