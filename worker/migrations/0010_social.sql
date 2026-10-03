-- Follow relationships and notifications for the public profile system.
CREATE TABLE IF NOT EXISTS follows (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  follower_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at         INTEGER NOT NULL,
  UNIQUE (follower_user_id, following_user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL,
  is_read        INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  metadata       TEXT
);

CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_user_id, following_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_user_id, follower_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read, created_at DESC);
