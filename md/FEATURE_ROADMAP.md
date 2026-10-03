# GD List Roulette Product Roadmap

This roadmap focuses on features that make a roulette run more worth starting,
more fair to compare, and more rewarding to finish. It is a product direction,
not a promise or a release schedule.

The app already has several foundations that these ideas build on: multiple
level-list sources, run rules, active-run recovery in the same browser, accounts,
profiles, follows, notifications, run history, global submissions, and admin
review. This roadmap is about making those pieces work together in better
player-facing experiences, not replacing features that already exist.

## Product principles

- A challenge should be reproducible: players competing in the same event must
  get the same eligible levels and rules.
- A result should say exactly what happened and what evidence it has. Do not
  describe a browser-reported result as independently verified.
- Joining a challenge should be quick. Advanced rules should stay optional.
- Sharing a challenge must never share or restore someone's in-progress run.
- New competitive features should reuse the account and moderation systems, not
  create a second leaderboard with different trust rules.

## Recommended next

### 1. Repeatable challenge links

Let a player create a fresh challenge link with a fixed list pool and rules.
Anyone opening it starts their own new run against the same challenge rather
than loading the creator's run.

Include the challenge's list source, eligible list sections or rank range,
percentage step, skip policy, and a stable challenge version. Resolve and freeze
the eligible level IDs when creating the challenge so later source-list updates
cannot quietly change what the link means. Clearly show when a link is no longer
supported or its source data is unavailable.

**Why it matters:** friends can compare attempts on the same challenge without
portable save codes or manually matching settings.

**First release:** create, copy, preview, and start a challenge link. Do not add
player uploads or arbitrary scripts.

### 2. Official daily challenge

Offer one site-wide challenge each day with a fixed level pool and rules.
Everyone gets a fresh attempt at the same challenge; the challenge date, source
snapshot, rules, and eligible levels are visible before starting.

Use the existing account submission and review flow. Label submissions as
unreviewed until reviewed; do not let the daily board imply that a score is
verified simply because it was submitted. Decide attempt limits and tie-breaking
before implementation.

**Why it matters:** gives players a reason to return and a fair shared goal
without requiring them to arrange a live session.

### 3. Run recap cards

Create a compact, shareable summary after a run: outcome, final target, levels
played, skips, elapsed time, challenge/list identity, and whether the result was
submitted or reviewed. Include links to public level pages where available.

The card should be generated from the finished run and never expose account
tokens, private settings, or a way to resume the run. Offer copy text first;
image export can follow if players find the recap useful.

**Why it matters:** makes a run easy to talk about and gives leaderboard posts
useful context.

## High-value follow-ups

### 4. Personal progress report

Add an account page showing progress over time, with filters by list and date:

- highest target reached and best completed run
- runs started, completed, failed, skipped, and given up
- completion rate and typical time per level
- recent results compared with the player's earlier results

Define each metric in plain language and exclude unreviewed submissions from
any statistic labelled as accepted or verified. Allow a player to hide their
report from other people if it becomes public.

**Why it matters:** turns run history into feedback players can use to choose
their next challenge, rather than just a list of old attempts.

### 5. Better challenge discovery

Show a small set of useful, explainable ways to choose a run before the player
starts: list size, list sections, rank span, and a plain-language difficulty or
intensity estimate when the source provides enough data.

Add filtering and sorting only for fields that are actually available and
reliable. Do not invent a universal difficulty score across unrelated lists.

**Why it matters:** helps players find a good run without making the setup form
into a maze.

### 6. Player-made challenge presets

Let signed-in players publish named rule presets built from supported settings.
Presets should link to a fresh challenge, have a short description, and include
the exact rules and source data they require.

Add report and moderation actions before making a public directory. Start with
links shared directly between players; only add browsing, sorting, or featured
presets after there is enough quality content.

**Why it matters:** players can create recognizable community formats without
adding unsafe custom code or confusing preset settings with official rules.

### 7. Submission status and feedback

Give each submitted run a clear status timeline: submitted, in review, accepted,
or rejected. When rejected, show a moderator-provided reason and what the
player can do next. Notify the player when the status changes, using the
existing notification system.

Keep moderator notes private unless explicitly written as player-facing
feedback. Avoid promising a review deadline unless moderators can meet it.

**Why it matters:** players should not have to repeatedly check a leaderboard
or guess whether a submission was received.

### 8. Challenge history and rematches

Keep a public archive of completed official daily challenges. Let a player
replay an old challenge as a practice run, clearly separated from its original
competitive results.

Offer a rematch link that copies the challenge definition, not anybody's run
state. Preserve the original date and source version so results remain
interpretable.

**Why it matters:** missed days remain playable, and a good challenge can have
a life beyond one day.

## Community competition

### 9. Async head-to-head challenges

Let one player challenge another to the same repeatable challenge. Each player
plays independently; the result compares the same rules, source snapshot, and
level order.

Use an explicit invite, expiry, and result-visibility policy. Do not compare
scores from different challenge versions. Start with direct invitations rather
than matchmaking.

**Why it matters:** adds friendly competition without requiring both players to
be online at once.

### 10. Scheduled seasons

Group official challenges into a short season with a visible start and end,
clear scoring rules, and a final standings page. Keep the scoring simple enough
to explain in one sentence and show how missing a challenge affects a total.

Reuse the reviewed-submission status. Do not introduce prizes, paid entry, or
stakes without a separate policy and moderation plan.

**Why it matters:** gives regular players a longer goal while keeping individual
runs short and approachable.

## Reliability and trust

### 11. Challenge integrity record

For every official or shared challenge, store an immutable definition and
version: rules, source snapshot, level order or seed, creation time, and
challenge owner. Display that identity with the run and submission.

This makes runs easier to compare and investigate. It is not proof that a
player legitimately achieved a percentage; keep that claim separate from
challenge reproducibility.

### 12. Submission evidence workflow

Improve the existing submission review around evidence that moderators can
actually evaluate. Let a submitter provide an evidence link, show its review
state, and let moderators record a concise decision and reason.

Set limits and a privacy/retention policy before accepting uploaded files.
Prefer links initially so the app does not unexpectedly become a video-hosting
service. Never expose private evidence links on public profiles by default.

### 13. Player data controls

Let players view and manage the information attached to their account: profile
visibility, notification preferences, and a clear way to request account
deletion. Explain which accepted leaderboard records remain public and what
happens to them if an account is removed.

**Why it matters:** social and competitive features should come with understandable
control over personal data.

## Suggested delivery order

1. **Repeatable challenge links** — establish a stable challenge format and
   validate it with players.
2. **Run recap cards** — make current runs easier to share without changing
   leaderboard policy.
3. **Submission status and feedback** — improve the existing competitive flow.
4. **Official daily challenge** — build on versioned challenge definitions.
5. **Personal progress report** — use the run and review data already collected.
6. **Player-made presets**, then **async head-to-head** and **seasons** if the
   first features see regular use.

## Explicitly out of scope for now

- Portable codes that restore somebody else's in-progress run.
- A universal difficulty rating that pretends unrelated lists are comparable.
- Public claims of anti-cheat or verification based only on client-side data.
- A real-time multiplayer game, chat system, or open-ended user scripting.
- Paid tournaments, prizes, or a marketplace before safety, moderation, and
  privacy policies exist.

## How to choose what comes next

Before starting a roadmap item, answer these questions:

1. Does it make starting, playing, comparing, or understanding a run better?
2. Can players explain the rules and result in plain language?
3. Does it reuse the existing account, submission, and moderation systems?
4. What data does it add, who can see it, and how can a player remove it?
5. What is the smallest version that can be tested with real players?

If those answers are unclear, keep the idea in discovery rather than adding a
large feature because it sounds impressive.
