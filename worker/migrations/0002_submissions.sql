-- Video proof and moderation for submitted runs.
--
-- A run has to be vouched for, and the proof is a video. Storing the video
-- itself is not free: D1 caps a single row or BLOB at 2 MB, which is a couple
-- of seconds of footage, and Cloudflare's object store (R2) is the only
-- storage big enough, which needs a payment method on the account even to sit
-- inside its free tier.
--
-- So the video is not uploaded. A player submits a link to a video they have
-- already put somewhere, and a moderator opens it and watches. The run is only
-- judged against what that video shows, and the board still waits for a human.
--
-- This keeps the trust property that actually matters: no run reaches the
-- public leaderboard until somebody has looked at its video.

CREATE TABLE IF NOT EXISTS submissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id        INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  -- Where the video is. An http(s) link to somewhere the moderator can open:
  -- an unlisted YouTube video, a Discord attachment, a Drive file. Stored as
  -- given and shown as a link, never fetched by the Worker, so there is no
  -- third party request and nothing to keep in sync.
  video_url     TEXT    NOT NULL,
  -- The extension of the file at the other end, kept so a moderator knows what
  -- to expect: .mp4 plays in a browser, .mkv and .avi do not.
  container     TEXT    NOT NULL,
  -- A short note from the player, e.g. which recorder they used or where in
  -- the video the run starts. Optional.
  note          TEXT,
  created_at    INTEGER NOT NULL,
  -- pending | approved | rejected
  status        TEXT    NOT NULL DEFAULT 'pending',
  reviewed_at   INTEGER,
  review_note   TEXT
);

-- The moderation queue reads pending rows newest first, which is the index
-- that serves it. The run lookup serves the panel when a submission is opened.
CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_run ON submissions(run_id);
