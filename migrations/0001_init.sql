-- LogiStack accounts and data (D1 / SQLite; plain SQL that also runs on Postgres with small changes).
-- One database for everyone: every row of data has an owner; the Worker only hands out a user's
-- own rows, and profiles their owners shared.

CREATE TABLE users (
  email      TEXT PRIMARY KEY,          -- from the login (Cloudflare Access today)
  plan       TEXT NOT NULL DEFAULT 'free',   -- free | premium | pro (src/shared/plans.ts)
  role       TEXT NOT NULL DEFAULT 'user',   -- user | editor | admin
  created_at TEXT NOT NULL,
  seen_at    TEXT NOT NULL
);

CREATE TABLE items (
  owner      TEXT NOT NULL REFERENCES users(email),
  kind       TEXT NOT NULL,             -- hand | player | profile | range | settings | fishy
  id         TEXT NOT NULL,             -- the app's own id for the item
  data       TEXT NOT NULL,             -- the item as the app stores it (JSON)
  shared     INTEGER NOT NULL DEFAULT 0,-- profiles only: visible to everyone
  updated_at TEXT NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0,-- kept as a tombstone so other devices learn of it
  PRIMARY KEY (owner, kind, id)
);

CREATE INDEX items_shared ON items (kind, shared) WHERE shared = 1 AND deleted = 0;
