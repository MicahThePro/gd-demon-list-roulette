-- Usernames are stored lowercase, which is what makes a handle an identity rather
-- than a label.
--
-- Usernames used to keep the case they were typed in, with uniqueness and lookup
-- both falling to a second column carrying the lowercased form. That worked, but it
-- meant one handle had two spellings and everything that read a username had to know
-- which one it was getting: the stored form on the leaderboard, the folded form in
-- the unique index. Any code that compared the two without folding first would treat
-- one account as two, and a player whose handle drifted from its own index was a
-- report nobody could act on.
--
-- So the stored form is now folded on the way in, and the two columns hold the same
-- thing. Uniqueness is unchanged and still ignores case -- nothing about this
-- migration makes two people able to claim one handle -- it is simply enforced on the
-- only spelling of that handle there now is.
--
-- Existing rows are brought into the same shape here rather than left mixed. A
-- handle that reads "DemonRoulette" becomes "demonroulette": the same account, the
-- same sign in, the same uniqueness. It does change how the handle is *printed*, on
-- the leaderboard and in the admin panel, which is the visible cost of having one
-- spelling rather than two.
--
-- The UPDATE is safe to run against data where this is already true, and is a no-op
-- for those rows. Where it is not, it cannot collide: username_lower is already
-- UNIQUE and already holds lower(username) for every row, so folding username can
-- only produce a value already held by that same row.
--
-- display_name is deliberately untouched. It is a label, it keeps its case, and
-- nothing constrains it to be different from anybody else's -- two players may be
-- called the same thing, and the username beside them is what tells them apart.

UPDATE users SET username = lower(username);

-- The two columns are now the same value by construction. Kept in step explicitly
-- rather than dropped, because the index on username_lower is what enforces
-- uniqueness and login lookup, and both routes still name that column. Dropping it
-- would mean rewriting every comparison to fold a column that no longer needs
-- folding, for no gain.
UPDATE users SET username_lower = lower(username);
