-- Account administration: a mirror of each player's local data, one-time
-- login codes, and a log of what a moderator did.

-- The player data the site keeps in the browser, so a moderator can see what an
-- account actually holds. One row per user, holding the same JSON blob the
-- client stores locally: the run history and the player's settings.
--
-- The client is the source of truth and uploads on change, so this is a mirror
-- rather than the authority. A player who has never signed in has no row here,
-- and a row can be older than what is in the browser until they load the site
-- again, which the panel says rather than presenting a stale mirror as current.
CREATE TABLE IF NOT EXISTS player_data (
  user_id     INTEGER PRIMARY KEY,
  -- The same packed history the leaderboard code carries, so one player's rows
  -- render exactly as they do in their own browser.
  history     TEXT,
  settings    TEXT,
  -- When the client last uploaded, which is the only honest answer to "is this
  -- current".
  synced_at   INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- A one-time code that signs a moderator in as a player, so they can look at the
-- site from that account's point of view.
--
-- The code is stored as a SHA-256 digest rather than as itself, for the same
-- reason session tokens are: a leaked database cannot be replayed against the
-- API. `used_at` is what makes it single-use. Generating a new code clears any
-- earlier one by deleting the row, so there is never more than one live code per
-- account and a code that has been replaced is dead whether or not it was used.
CREATE TABLE IF NOT EXISTS login_codes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  -- The digest of the code, never the code.
  code_hash   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL,
  -- Set when the code is redeemed. The row is kept rather than deleted so the
  -- panel can say the code was used rather than that it never existed, and so a
  -- second attempt is told the difference between wrong and already spent.
  used_at     INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- One live code per account: issuing a new one replaces the old.
CREATE UNIQUE INDEX IF NOT EXISTS login_codes_user ON login_codes(user_id);

-- What a moderator did, so a leaked passcode leaves a trail rather than nothing.
-- Only destructive and impersonating actions are recorded: a read of the queue is
-- ordinary use, deleting an account is not.
CREATE TABLE IF NOT EXISTS admin_audit (
  id          INTEGER PRIMARY KEY,
  -- A free-text action name, e.g. 'account.delete' or 'login-code.issue'.
  action      TEXT    NOT NULL,
  target_id   INTEGER,
  -- The username as it was at the time, so the log still reads sensibly after
  -- the account it names has been deleted.
  target_name TEXT,
  at          INTEGER NOT NULL,
  detail      TEXT
);

CREATE INDEX IF NOT EXISTS admin_audit_at ON admin_audit(at DESC);
