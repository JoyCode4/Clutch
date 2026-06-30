import { useState } from 'react'
import { format } from 'date-fns'
import { detectConflicts } from '../../agent/conflicts'
import { findNextSlot } from '../../agent/scheduler'
import { updateSession } from '../../lib/db'
import AgentPrompt from '../agent/AgentPrompt'
import type { Session, BusyEvent, Preferences } from '../../lib/types'

const MIN_BLOCK_MIN = 25

export default function ConflictBanner({
  uid,
  sessions,
  busy,
  prefs,
  onAskAgent,
}: {
  uid: string
  sessions: Session[]
  busy: BusyEvent[]
  prefs: Preferences
  onAskAgent: (instruction: string) => void | Promise<void>
}) {
  const [prompt, setPrompt] = useState<{
    sessionId: string
    taskTitle: string
    otherTitle: string
  } | null>(null)
  const conflicts = detectConflicts(sessions, busy)
  if (conflicts.length === 0 && !prompt) return null

  const durationMin = (s: Session) =>
    Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000)

  const moveToFreeSlot = async (move: Session, otherStart: string) => {
    const from = new Date(Math.max(Date.now(), new Date(otherStart).getTime()))
    const slot = findNextSlot(
      durationMin(move),
      busy,
      sessions.filter((s) => s.id !== move.id),
      prefs,
      from,
    )
    if (!slot) {
      alert('No free slot found within your working hours over the next 2 weeks.')
      return
    }
    await updateSession(uid, move.id, {
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      status: 'scheduled',
      notified: false,
    })
  }

  const shorten = async (s: Session, untilISO: string) => {
    const newEnd = new Date(untilISO)
    const mins = (newEnd.getTime() - new Date(s.start).getTime()) / 60000
    if (mins < MIN_BLOCK_MIN) {
      alert(
        `Shortening would leave under ${MIN_BLOCK_MIN} min — too short. Try moving it instead.`,
      )
      return
    }
    await updateSession(uid, s.id, { end: newEnd.toISOString() })
  }

  return (
    <div className="mb-5 flex flex-col gap-3">
      {conflicts.map((c, i) => {
        const a = c.a
        const otherTitle = c.bSession?.taskTitle ?? c.bBusy?.title ?? ''
        const otherStart = c.bSession?.start ?? c.bBusy?.start ?? a.start
        const aTime = `${format(new Date(a.start), 'EEE HH:mm')}`
        return (
          <div
            key={i}
            className="animate-in rounded-xl border border-bad/50 bg-bad/10 p-4"
          >
            <p className="mb-3 text-sm text-text">
              <span className="font-medium">🤖 Scheduling conflict:</span> “
              {a.taskTitle}” ({aTime}) overlaps{' '}
              {c.bBusy ? 'your commitment' : 'session'} “{otherTitle}”. How should
              I fix it?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void moveToFreeSlot(a, otherStart)}
                className="rounded-lg border border-good/60 bg-good/15 px-3 py-1.5 text-sm hover:bg-good/25"
              >
                ✅ Move “{a.taskTitle}” to next free slot
              </button>

              {c.bSession && (
                <button
                  onClick={() => void moveToFreeSlot(c.bSession!, a.end)}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
                >
                  Move “{c.bSession.taskTitle}” instead
                </button>
              )}

              <button
                onClick={() => void shorten(a, otherStart)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Shorten “{a.taskTitle}” to fit
              </button>

              <button
                onClick={() =>
                  setPrompt({
                    sessionId: a.id,
                    taskTitle: a.taskTitle,
                    otherTitle,
                  })
                }
                className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-sm hover:bg-accent/20"
              >
                Other — tell the agent…
              </button>
            </div>
          </div>
        )
      })}

      {prompt && (
        <AgentPrompt
          contextLabel={`Conflict: "${prompt.taskTitle}" overlaps "${prompt.otherTitle}". Tell me what to do.`}
          onSend={(t) =>
            void onAskAgent(
              `${t}\n\n(Context: the work block [${prompt.sessionId}] for task "${prompt.taskTitle}" overlaps "${prompt.otherTitle}". Use update_session on that block id to fix it.)`,
            )
          }
          onClose={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
