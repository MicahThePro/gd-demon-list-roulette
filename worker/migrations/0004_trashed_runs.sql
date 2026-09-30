-- Trashed runs.
--
-- A moderator trashing a run does not delete the row: a run that is hard
-- deleted is gone from the leaderboard forever, and the wrong click could not be
-- undone. Trashing hides it instead -- everywhere it would be read: the public
-- leaderboard, the player's own run list, and the account panel. The row stays
-- with its statistics intact, so un-trashing puts the run back exactly where it
-- was, leaderboard rank included.
--
-- Modelled as a row rather than a deleted_at column on runs, because "was this
-- run ever trashed, and when" is only interesting while it is trashed, and a
-- table keyed by run id makes every read a plain LEFT JOIN anti-join.
CREATE TABLE IF NOT EXISTS trashed_runs (
  run_id     INTEGER PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason     TEXT,
  trashed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trashed_runs_user ON trashed_runs(user_id, trashed_at DESC);
