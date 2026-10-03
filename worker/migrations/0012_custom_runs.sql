CREATE TABLE IF NOT EXISTS custom_runs (
  id                 TEXT PRIMARY KEY,
  creator_user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source             TEXT NOT NULL,
  percent_step       INTEGER NOT NULL,
  allow_skip         INTEGER NOT NULL,
  level_time_limit_ms INTEGER NOT NULL DEFAULT 0,
  total_time_limit_ms INTEGER NOT NULL DEFAULT 0,
  levels_json        TEXT NOT NULL,
  created_at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_runs_creator
  ON custom_runs (creator_user_id, created_at DESC);
