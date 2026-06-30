export default function OverlapConfirm({
  titles,
  canMoveFree,
  onMoveFree,
  onKeepAnyway,
  onCancel,
}: {
  titles: string[]
  canMoveFree: boolean
  onMoveFree: () => void
  onKeepAnyway: () => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-warn/50 bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-lg font-semibold">⚠️ That overlaps something</h2>
        <p className="mb-4 text-sm text-muted">
          This time clashes with{' '}
          <span className="text-text">{titles.join(', ')}</span>. What should I do?
        </p>
        <div className="flex flex-col gap-2">
          {canMoveFree && (
            <button
              onClick={onMoveFree}
              className="rounded-lg border border-good/60 bg-good/15 px-3 py-2 text-sm hover:bg-good/25"
            >
              ✅ Put it in the next free slot instead
            </button>
          )}
          <button
            onClick={onKeepAnyway}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:bg-surface"
          >
            Keep it here anyway (allow overlap)
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg px-3 py-2 text-sm text-muted hover:text-text"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
