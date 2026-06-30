import { useState } from 'react'

export default function AgentPrompt({
  contextLabel,
  placeholder,
  onSend,
  onClose,
}: {
  contextLabel: string
  placeholder?: string
  onSend: (text: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')

  const send = () => {
    if (!text.trim()) return
    onSend(text.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-accent/50 bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">🤖 Tell the agent</h2>
        <p className="mb-3 text-sm text-muted">{contextLabel}</p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
          }}
          rows={3}
          placeholder={
            placeholder ?? 'e.g. "move the project block to Saturday morning"'
          }
          className="mb-3 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm focus:border-accent focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!text.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
