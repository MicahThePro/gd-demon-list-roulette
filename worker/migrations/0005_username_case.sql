-- Usernames keep the case they were typed in, and are still unique without regard
-- to it.
--
-- Before this, normalizeUsername lowercased everything on the way in, so a handle
-- could never be capitalised: "DemonRoulette" was stored as "demonroulette" and the
-- owner could not have the name they wanted. Restoring the case was not enough on
-- its own, because the UNIQUE constraint on users.username is a plain byte
-- comparison -- it would happily hold "Bob" and "bob" as two different people, and
-- then which one a sign-in reached depended on which case was typed.
--
-- So uniqueness moves to a second column carrying the lowercased form, and that is
-- the one the index and the check are on. The handle as typed is the display form
-- and is what leaderboards and the admin panel show; the lowercase form is the
-- identity, and is what every lookup compares against. Signing in as "BOB",
-- "bob" or "Bob" finds the same account, and only the first account to claim a
-- name in any case can have it.
--
-- The column is populated from the existing rows here rather than by a trigger.
-- A trigger would be the stronger guarantee against a future INSERT that forgot to
-- set it, but every write to users goes through one prepared statement in
-- api.js, so the invariant is enforced where the value is produced and a trigger
-- would only be a second thing to keep true.
--
-- Adding a UNIQUE column fails outright if the existing data already violates it,
-- which is the correct outcome to notice at migration time rather than at sign-in.
ALTER TABLE users ADD COLUMN username_lower TEXT;

UPDATE users SET username_lower = lower(username);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users(username_lower);
