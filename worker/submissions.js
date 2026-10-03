/**
 * Video proof, and the moderation queue.
 *
 *   POST   /api/submissions                  a run plus a link to its video
 *   GET    /api/submissions/mine             what the signed in player has sent
 *   GET    /api/admin/submissions            the review queue (passcode)
 *   GET    /api/admin/submissions/:id        one submission with its run (passcode)
 *   POST   /api/admin/submissions/:id/approve  put it on the board (passcode)
 *   POST   /api/admin/submissions/:id/reject   turn it down (passcode)
 *   POST   /api/admin/submissions/:id/delete   remove it entirely (passcode)
 *
 * The video is NOT uploaded and NOT stored. A run is submitted with a link to a
 * video the player has already put on their own host, and a moderator opens
 * that link and watches it. Nothing is fetched by the Worker, so there is no
 * object storage, no upload bandwidth, and nothing to pay for.
 *
 * A submission is `pending` when it arrives and the run stays off the
 * leaderboard until somebody approves it. That is the part that matters: the
 * public board only ever holds runs a person has watched.
 */

import { checkAdminPasscode } from './admin.js'
import { getSessionUser } from './auth.js'

// The file types a moderator might be sent. This is a hint for the review
// screen, not a check on the URL: a Google Drive link and a YouTube link carry
// no extension at all, so the player picks the type and the moderator is told
// what to expect before clicking.
const CONTAINERS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm'])

// Only webm and mp4 play inline in a browser. The rest are accepted, since a
// player may have whatever their recorder produced, but the panel says plainly
// that the link has to be opened elsewhere rather than leaving a dead player.
export const PLAYABLE = new Set(['webm', 'mp4'])

const MAX_URL_LENGTH = 2000
const MAX_NOTE_LENGTH = 200

const asInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numeric = Math.trunc(Number(value))
  return Number.isFinite(numeric) ? numeric : null
}

const readBody = async (request) => {
  try {
    const body = await request.json()
    return body && typeof body === 'object' ? body : {}
  } catch {
    return null
  }
}

const requireUser = async (db, request) => getSessionUser(db, request)

/**
 * A submitted link has to be a real http(s) URL.
 *
 * Anything else is refused, and in particular a `javascript:` or `data:` URL is
 * refused, because the moderator's page renders this string as a link they
 * click. A link to nowhere is not proof of anything, and a link that runs
 * script is worse than none at all.
 */
const normalizeVideoUrl = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw || raw.length > MAX_URL_LENGTH) {
    return null
  }

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }

  return parsed.toString()
}

const insertSubmission = async (db, { runId, url, container, note, now, status = 'pending', reviewedAt = null, reviewNote = null }) => {
  const row = await db
    .prepare(
      `INSERT INTO submissions (run_id, video_url, container, note, created_at, status, reviewed_at, review_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(runId, url, container, note, now, status, reviewedAt, reviewNote)
    .first()

  return row?.id ?? null
}

const submissionSummary = (row) => ({
  id: row.id,
  runId: row.run_id,
  status: row.status,
  container: row.container,
  note: row.note,
  createdAt: row.created_at,
  reviewedAt: row.reviewed_at,
  reviewNote: row.review_note,
})

/* The queue row plus enough of the run for a moderator to judge it without a
   second request: who, how far, how long, and the round list to check against
   what the video shows.

   A trashed run is not in the queue. Trashing is the decision that the run does
   not belong on this site, and leaving its submission in the queue would put one
   click away from putting it back -- approving a run somebody had already thrown
   away. The row itself is untouched, so un-trashing brings the submission back
   with it. */
const queueRow = (row) => ({
  ...submissionSummary(row),
  videoUrl: row.video_url,
  username: row.username,
  displayName: row.display_name,
  source: row.source,
  runStatus: row.run_status,
  score: row.score,
  percentStep: row.percent_step,
  passed: row.passed,
  roundsPlayed: row.rounds_played,
  skipped: row.skipped,
  totalMs: row.total_ms,
  runCreatedAt: row.run_created_at,
  rounds: safeRounds(row.rounds_json),
})

const safeRounds = (value) => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const QUEUE_SQL = `
  SELECT s.id, s.run_id, s.status, s.container, s.note, s.video_url,
         s.created_at, s.reviewed_at, s.review_note,
         u.username, u.display_name,
         r.source, r.status AS run_status, r.score, r.percent_step, r.passed,
         r.rounds_played, r.skipped, r.total_ms, r.created_at AS run_created_at,
         (SELECT json_group_array(json_object(
            'name', rr.level_name,
            'target', rr.target_percent,
            'achieved', rr.achieved_percent,
            'result', rr.result,
            'ms', rr.elapsed_ms,
            'skipReason', rr.skip_reason
          ))
            FROM (SELECT * FROM run_rounds WHERE run_id = r.id ORDER BY round_number) rr
         ) AS rounds_json
    FROM submissions s
    JOIN runs r ON r.id = s.run_id
    JOIN users u ON u.id = r.user_id
   WHERE NOT EXISTS (SELECT 1 FROM trashed_runs t WHERE t.run_id = r.id)
`

/* The whole queue, or just one submission. A single query rather than a page of
   rows plus a detail request each, because the round list is what decides a
   submission and having it in hand avoids a click per item. */
const listSubmissions = async (db, { status, id } = {}) => {
  if (id) {
  const row = await db.prepare(`${QUEUE_SQL} AND s.id = ?`).bind(id).first()
    return row ? [queueRow(row)] : []
  }

  const statement = status
    ? db.prepare(`${QUEUE_SQL} AND s.status = ? ORDER BY s.created_at DESC LIMIT 200`).bind(status)
    : db.prepare(`${QUEUE_SQL} ORDER BY s.created_at DESC LIMIT 200`)

  const result = await statement.all()
  return (result.results ?? []).map(queueRow)
}

export const handleSubmissionRoutes = async ({ db, request, url, key, adminPasscode }) => {
  const route = key.replace(/^api\//, '')
  const now = Date.now()

  /* --- a player submitting their own proof -------------------------------- */
  if (route === 'submissions' && request.method === 'POST') {
    const user = await requireUser(db, request)
    if (!user) {
      return { error: 'Sign in to submit a run', status: 401 }
    }

    const body = await readBody(request)
    if (!body) {
      return { error: 'Could not read that submission', status: 400 }
    }

    const runId = asInteger(body.runId)
    if (runId === null || runId < 1) {
      return { error: 'That submission names no run', status: 400 }
    }

    // Scoped to the signed in player, so a submission can only ever be
    // attached to a run of their own.
    const run = await db
      .prepare('SELECT id, source, score, status FROM runs WHERE id = ? AND user_id = ?')
      .bind(runId, user.id)
      .first()
    if (!run) {
      return { error: 'That run is not yours to submit', status: 404 }
    }

    /* One submission per run, for good.
     *
     * The client's "already submitted" flag is a localStorage mirror, so it is
     * a convenience and not a rule: clearing site data or opening the site in
     * another browser forgets it. This check is the rule, and it is what stops
     * one run filling the queue with a dozen copies for a moderator to reject
     * by hand.
     *
     * Deliberately not scoped to `status = 'pending'`. Once a run has been sent
     * it is sent: a rejected run stays rejected and an approved one stays on
     * the board, and in neither case does the same run get a second turn at
     * the queue. A player who thinks the video was judged unfairly sends a
     * different run.
     *
     * The index on (run_id) serves this lookup. */
    const existing = await db
      .prepare('SELECT id, status FROM submissions WHERE run_id = ? ORDER BY id LIMIT 1')
      .bind(runId)
      .first()
    if (existing) {
      return {
        error:
          existing.status === 'pending'
            ? 'That run is already waiting to be checked'
            : existing.status === 'approved'
              ? 'That run is already on the global leaderboard'
              : 'That run was already sent, and it was turned down',
        status: 409,
      }
    }

    const isDirectSubmitBypass = String(user.username ?? '').trim().toLowerCase() === 'geometricalmike'
    const videoUrl = isDirectSubmitBypass
      ? normalizeVideoUrl(body.videoUrl) ?? 'https://example.invalid/direct-submit'
      : normalizeVideoUrl(body.videoUrl)

    if (!isDirectSubmitBypass && !videoUrl) {
      return {
        error: 'That link is not usable. Paste a full https:// link to your video.',
        status: 400,
      }
    }

    const rawContainer = String(body.container ?? '').toLowerCase().replace(/^\./, '')
    const container = isDirectSubmitBypass
      ? (CONTAINERS.has(rawContainer) ? rawContainer : 'mp4')
      : rawContainer

    if (!isDirectSubmitBypass && !CONTAINERS.has(container)) {
      return {
        error: `Pick the file type: ${[...CONTAINERS].join(', ')}.`,
        status: 400,
      }
    }

    const note =
      typeof body.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) || null : null

    const submissionId = await insertSubmission(db, {
      runId,
      url: videoUrl,
      container,
      note,
      now,
      status: isDirectSubmitBypass ? 'approved' : 'pending',
      reviewedAt: isDirectSubmitBypass ? now : null,
      reviewNote: isDirectSubmitBypass ? 'Direct submission for @geometricalmike' : null,
    })

    if (submissionId === null) {
      return { error: 'Could not record that submission', status: 500 }
    }

    return {
      status: 201,
      body: {
        submission: {
          id: submissionId,
          runId,
          status: isDirectSubmitBypass ? 'approved' : 'pending',
        },
      },
    }
  }

  if (route === 'submissions/mine' && request.method === 'GET') {
    const user = await requireUser(db, request)
    if (!user) {
      return { error: 'Sign in to do that', status: 401 }
    }

    const result = await db
      .prepare(
        `SELECT s.id, s.run_id, s.status, s.container, s.note, s.video_url,
                s.created_at, s.reviewed_at, s.review_note, r.score, r.source
           FROM submissions s
           JOIN runs r ON r.id = s.run_id
          WHERE r.user_id = ?
            AND NOT EXISTS (SELECT 1 FROM trashed_runs t WHERE t.run_id = r.id)
          ORDER BY s.created_at DESC
          LIMIT 50`,
      )
      .bind(user.id)
      .all()

    return {
      status: 200,
      body: {
        submissions: (result.results ?? []).map((row) => ({
          ...submissionSummary(row),
          score: row.score,
          source: row.source,
        })),
      },
    }
  }

  /* --- moderation -------------------------------------------------------- */
  if (route.startsWith('admin/')) {
    // Every admin route checks before touching the database, so a wrong
    // passcode cannot even tell whether a submission exists.
    const passcode = await checkAdminPasscode(request, adminPasscode, db)
    if (!passcode.ok) {
      // A lockout carries its own status and wording, so the escalating ladder is
      // visible to whoever is typing rather than showing as a flat "Wrong passcode"
      // over and over. retry_after_seconds is what the panel counts down from.
      return {
        error: passcode.message ?? 'Wrong passcode',
        status: passcode.permanent ? 403 : passcode.locked ? 429 : 401,
        retry_after_seconds: passcode.retryAfterSeconds ?? null,
      }
    }

    const rest = route.slice('admin/'.length)

    if (rest === 'submissions' && request.method === 'GET') {
      const status = url.searchParams.get('status')
      const valid = ['pending', 'approved', 'rejected'].includes(status) ? status : null
      return { status: 200, body: { submissions: await listSubmissions(db, { status: valid }) } }
    }

    const match = rest.match(/^submissions\/(\d+)(?:\/(approve|reject|delete))?$/)
    if (!match) {
      return { error: 'Unknown admin endpoint', status: 404 }
    }

    const id = Number(match[1])
    // A non-capturing group above, so the action lands in match[2] rather than
    // being shifted one along by the slash.
    const action = match[2] ?? null

    if (request.method === 'GET' && !action) {
      const [submission] = await listSubmissions(db, { id })
      if (!submission) {
        return { error: 'No such submission', status: 404 }
      }
      return { status: 200, body: { submission } }
    }

    if (request.method === 'POST' && (action === 'approve' || action === 'reject')) {
      const body = (await readBody(request)) ?? {}
      const status = action === 'approve' ? 'approved' : 'rejected'
      const note = typeof body.note === 'string' ? body.note.slice(0, MAX_NOTE_LENGTH) : null

      const result = await db
        .prepare(
          `UPDATE submissions SET status = ?, reviewed_at = ?, review_note = ?
             WHERE id = ? RETURNING id, run_id`,
        )
        .bind(status, now, note, id)
        .first()

      if (!result) {
        return { error: 'No such submission', status: 404 }
      }

      return { status: 200, body: { ok: true, id: result.id, runId: result.run_id, status } }
    }

    if (request.method === 'POST' && action === 'delete') {
      // The run id is read before the row goes, because deleting the
      // submission is what tells us which run to remove. The submission is the
      // child here, not the other way round.
      const row = await db.prepare('SELECT run_id FROM submissions WHERE id = ?').bind(id).first()
      if (!row) {
        return { error: 'No such submission', status: 404 }
      }

      // Nothing is stored but the link, so removing the run is all there is to
      // do: the video lives on the player's own host and is theirs to remove.
      await db.prepare('DELETE FROM runs WHERE id = ?').bind(row.run_id).run()
      return { status: 200, body: { ok: true } }
    }

    return { error: 'Method not allowed', status: 405 }
  }

  return null
}
