-- Review 2: the admin dashboard, Premium requests and "Consider this" (src/shared/api.ts).
-- Additive only: the Worker before it keeps working with this schema (it names its columns).

-- the admin's note on a user ("Gabi, Thursday game"); never sent to the user
ALTER TABLE users ADD COLUMN note TEXT;
-- an open request for Premium (ISO time), or NULL
ALTER TABLE users ADD COLUMN premium_request TEXT;

-- the playbook's advice in our own words, for every user (core/advice/playbook.ts serverAdvice)
CREATE TABLE advice (
  book       TEXT NOT NULL,             -- the playbook's name; an upload replaces the whole book
  id         TEXT NOT NULL,             -- the entry's id in the playbook
  data       TEXT NOT NULL,             -- ServerAdvice as JSON: id, title, advice, when, strength
  updated_at TEXT NOT NULL,
  PRIMARY KEY (book, id)
);
