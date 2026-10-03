import { useEffect, useState } from 'react'
import { getCustomRun, getCustomRunLevel } from '../services/customRunService'
import { censorText } from '../utils/censor'

const formatLimit = (milliseconds) =>
  milliseconds > 0
    ? `${Number((milliseconds / 60_000).toFixed(1)).toLocaleString()} minutes`
    : 'Off'

export default function CustomRunPage({ id, onStart, onBack }) {
  const [loadedRun, setLoadedRun] = useState({ id: null, definition: null, error: '', isLoading: true })
  const { definition, error, isLoading } =
    loadedRun.id === id
      ? loadedRun
      : { definition: null, error: '', isLoading: true }
  const [isStarting, setIsStarting] = useState(false)

  useEffect(() => {
    let active = true
    getCustomRun(id)
      .then((result) => {
        if (active) setLoadedRun({ id, definition: result, error: '', isLoading: false })
      })
      .catch((loadError) => {
        if (active) {
          setLoadedRun({
            id,
            definition: null,
            error: loadError?.message ?? 'Could not load this custom run.',
            isLoading: false,
          })
        }
      })
    return () => {
      active = false
    }
  }, [id])

  const start = async () => {
    if (!definition || isStarting) return
    setIsStarting(true)
    try {
      const { level } = await getCustomRunLevel(id, 1)
      onStart(definition, level)
    } catch (startError) {
      setLoadedRun((current) => ({
        ...current,
        id,
        error: startError?.message ?? 'Could not start this custom run.',
      }))
    } finally {
      setIsStarting(false)
    }
  }

  if (isLoading) {
    return <main className="page-shell"><section className="panel custom-run-landing"><p>Loading custom run…</p></section></main>
  }

  return (
    <main className="page-shell">
      <section className="panel custom-run-landing">
        <p className="eyebrow">Custom challenge</p>
        <h1>{censorText(definition?.source ?? 'Custom run')}</h1>
        {error && <p className="validation-message" role="alert">{error}</p>}
        {definition && (
          <>
            <p className="lead">
              Created by <strong>{censorText(definition.creator.displayName)}</strong> (@{definition.creator.username}).
              This challenge has {definition.levelCount} ordered levels. The level order is hidden until you play.
            </p>
            <div className="custom-run-rules-summary">
              <div><span>Percentage increment</span><strong>+{definition.percentStep}%</strong></div>
              <div><span>Allow skipping</span><strong>{definition.allowSkip ? 'Yes' : 'No'}</strong></div>
              <div><span>Time per level</span><strong>{formatLimit(definition.levelTimeLimitMs)}</strong></div>
              <div><span>Total run limit</span><strong>{formatLimit(definition.totalTimeLimitMs)}</strong></div>
            </div>
            <p className="settings-note">
              These are the creator’s rules. Your settings on the home page do not change this challenge.
              Custom runs are not added to your personal run history or submitted to the global leaderboard.
            </p>
            <div className="action-row">
              <button type="button" className="primary-button" onClick={start} disabled={isStarting}>
                {isStarting ? 'Starting…' : 'Start custom run'}
              </button>
              <button type="button" className="secondary-button" onClick={onBack}>Back home</button>
            </div>
          </>
        )}
        {!definition && !error && <p>This custom run could not be loaded.</p>}
      </section>
    </main>
  )
}
