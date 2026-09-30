-- GD List Roulette accounts and global leaderboard.
--
-- Applied to the Worker's D1 database with:
--   npx wrangler d1 migrations apply demon-roulette --remote
--
-- Everything is IF NOT EXISTS so the migration is safe to re-run.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Lowercased handle, unique, and the login name.
  username      TEXT    NOT NULL UNIQUE,
  -- The name shown on leaderboards. Separate from username so a handle can
  -- never carry characters that break a leaderboard row.
  display_name  TEXT    NOT NULL,
  -- PBKDF2-SHA256, stored as "iterations:saltHex:hashHex". The plaintext
  -- password is never written anywhere.
  password_hash TEXT    NOT NULL,
  salt          TEXT    NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- One row per finished run a player submitted. The statistics the leaderboards
-- rank on are stored as columns rather than recomputed from run_rounds, so a
-- board is a single indexed sort no matter how many rounds a run had.
CREATE TABLE IF NOT EXISTS runs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The client's run id. Unique per user so re-submitting the same run
  -- replaces it instead of filling the board with duplicates.
  run_key        TEXT    NOT NULL,
  source         TEXT    NOT NULL,
  percent_step   INTEGER NOT NULL,
  -- completed | gaveup | failed
  status         TEXT    NOT NULL,
  timed_out      INTEGER NOT NULL DEFAULT 0,
  -- How far the run got. 100 for a cleared run.
  score          INTEGER NOT NULL,
  target_reached INTEGER NOT NULL,
  rounds_played  INTEGER NOT NULL,
  passed         INTEGER NOT NULL,
  skipped        INTEGER NOT NULL,
  total_ms       INTEGER NOT NULL,
  avg_ms         INTEGER,
  -- JSON object of skip reason id -> count.
  skip_reasons   TEXT    NOT NULL DEFAULT '{}',
  created_at     INTEGER NOT NULL,
  UNIQUE (user_id, run_key)
);

-- The boards sort on score and passed, so they are indexed together in the
-- order the default board reads them.
CREATE INDEX IF NOT EXISTS idx_runs_score ON runs(score DESC, passed DESC);
CREATE INDEX IF NOT EXISTS idx_runs_passed ON runs(passed DESC, score DESC);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);

CREATE TABLE IF NOT EXISTS run_rounds (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id           INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  round_number     INTEGER NOT NULL,
  level_id         TEXT,
  level_name       TEXT    NOT NULL,
  target_percent   INTEGER,
  achieved_percent INTEGER,
  -- success | skipped | failure | gaveup | timeout
  result           TEXT    NOT NULL,
  elapsed_ms       INTEGER,
  video            TEXT,
  skip_reason      TEXT
);

CREATE INDEX IF NOT EXISTS idx_run_rounds_run ON run_rounds(run_id, round_number);
