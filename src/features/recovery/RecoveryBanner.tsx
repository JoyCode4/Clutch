import { updateSession, deleteRecovery } from '../../lib/db'
import type { RecoveryProposal, RecoveryOption } from '../../lib/types'

export default function RecoveryBanner({
  uid,
  proposals,
}: {
  uid: string
  proposals: RecoveryProposal[]
}) {
  if (proposals.length === 0) return null

  const approve = async (p: RecoveryProposal, opt: RecoveryOption) => {
    await updateSession(uid, p.sessionId, {
      start: opt.start,
      end: opt.end,
      status: 'scheduled',
      notified: false,
    })
    await deleteRecovery(uid, p.id)
  }

  const dismiss = async (p: RecoveryProposal) => {
    await deleteRecovery(uid, p.id)
  }

  return (
    <div className="mb-5 flex flex-col gap-3">
      {proposals.map((p) => (
        <div
          key={p.id}
          className="animate-in rounded-xl border border-warn/50 bg-warn/10 p-4"
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm text-text">
              <span className="font-medium">🤖 You missed a session for</span>{' '}
              “{p.taskTitle}”. I found {p.options.length || 'no'} way
              {p.options.length === 1 ? '' : 's'} to recover — pick one:
            </p>
            <button
              onClick={() => void dismiss(p)}
              className="shrink-0 text-xs text-muted hover:text-text"
            >
              dismiss
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {p.options.map((opt) => (
              <button
                key={opt.start}
                onClick={() => void approve(p, opt)}
                className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                  opt.recommended
                    ? 'border-good/60 bg-good/15 hover:bg-good/25'
                    : 'border-border bg-surface hover:bg-surface-2'
                }`}
                title={opt.note}
              >
                {opt.recommended ? '✅ ' : ''}
                {opt.label}
              </button>
            ))}
            {p.options.length === 0 && (
              <span className="text-sm text-muted">
                No free slots before the deadline — consider dropping or shortening it.
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
