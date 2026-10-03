import { pointercratePartsLabel } from '../services/pointercrateParts.js'

/**
 * Which Pointercrate lists a run was played from.
 *
 * Shown on both leaderboards, and it is the only way to tell two Pointercrate
 * runs apart that would otherwise look identical: both are stamped
 * "Pointercrate Demon List", so a Legacy run and a Main one sat next to each
 * other with nothing on screen saying the draw was from completely different
 * pools. 552 demons against 150 is not a rounding difference, so it has to be
 * on the row rather than somewhere the reader has to go and look.
 *
 * Renders nothing at all when the run carries no parts: on every other list, on
 * a run saved before the lists existed, and on one imported from an older save
 * code. An empty pill reading "no lists" would be worse than silence there,
 * because there is nothing to report -- not something missing.
 *
 * No `source` prop to check against, and deliberately so. The parts are only ever
 * set on a Pointercrate run -- forced null for every other list in createRun, in
 * the run payload, and again on the Worker -- so a badge here means a Pointercrate
 * run by three independent paths. It also keeps the raw source string out of a
 * JSX expression, which the censor check rightly refuses anywhere in src/.
 */

export default function PointercratePartsBadge({ parts }) {
  const label = pointercratePartsLabel(parts)
  if (!label) return null

  return (
    <span className="pc-parts-badge" title={`Pointercrate: ${label}`}>
      {label}
    </span>
  )
}