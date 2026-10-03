-- Escalating lockouts for the admin passcode.
--
-- The passcode guards routes that can delete an account and sign in as any player,
-- so guessing it is the only attack that matters and it needs a real answer. A PBKDF2
-- comparison is slow, which helps, but "slow" is not a limit: without a record of
-- attempts the same guess can be repeated for as long as the attacker likes, from as
-- many machines as they like.
--
-- This is that record. One row per client address, holding how many consecutive
-- wrong guesses have been made and when the next guess becomes acceptable. Every
-- wrong answer moves that number up, and the wait between attempts grows with it.
--
-- Keyed on the address rather than on anything the client controls. A client-supplied
-- identifier would be reset by clearing storage, which is the one move an attacker
-- reaches for first. The address is at least something they would have to change
-- networks to shed.
CREATE TABLE IF NOT EXISTS admin_attempts (
  -- The client address, as the platform reports it. Held as text because it can be
  -- an IPv6 address and is compared for equality only.
  client_key   TEXT PRIMARY KEY,
  -- Consecutive wrong guesses. Reset to zero by a correct one, so a moderator who
  -- fumbles their own passcode a few times is not punished for the next good one.
  failures     INTEGER NOT NULL DEFAULT 0,
  -- When the next guess is acceptable. Equal to `at` before anything has failed, so
  -- the very first attempt is never delayed.
  next_allowed INTEGER NOT NULL,
  -- Set once the escalation runs out. A permanent ban is kept as a flag here rather
  -- than as a huge `next_allowed`, because "forever" is not a timestamp and encoding
  -- it as one is how a bug turns into a lockout nobody can clear.
  banned_at    INTEGER,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_attempts_banned ON admin_attempts(banned_at);