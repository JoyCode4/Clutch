import { useState } from 'react'
import { format } from 'date-fns'
import { updateSession, updateTask } from '../../lib/db'
import { removeSession } from '../../lib/calendar'
import { findNextSlot } from '../../agent/scheduler'
import { findOverlaps } from '../../agent/conflicts'
import OverlapConfirm from './OverlapConfirm'
import type {
  Task,
  Session,
  BusyEvent,
  Preferences,
  SessionStatus,
} from '../../lib/types'

const STATUSES: { value: SessionStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'missed', label: 'Missed' },
]

function toLocalInput(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}

export default function SessionEditor({
  uid,
  session,
  task,
  allSessions,
  busy,
  prefs,
  onClose,
}: {
  uid: string
  session: Session
  task: Task | null
  allSessions: Session[]
  busy: BusyEvent[]
  prefs: Preferences
  onClose: () => void
}) {
  const initialDuration = Math.round(
    (new Date(session.end).getTime() - new Date(session.start).getTime()) / 60000,
  )
  const [startLocal, setStartLocal] = useState(toLocalInput(session.start))
  const [duration, setDuration] = useState(initialDuration)
  const [status, setStatus] = useState<SessionStatus>(session.status)
  const [overlapTitles, setOverlapTitles] = useState<string[] | null>(null)

  const commit = async (startISO: string, endISO: string) => {
    await updateSession(uid, session.id, {
      start: startISO,
      end: endISO,
      status,
      notified: false,
    })
    onClose()
  }

  const save = async () => {
    const start = new Date(startLocal)
    const end = new Date(start.getTime() + duration * 60000)
    // Confirm before allowing an overlap.
    const titles = findOverlaps(
      start.toISOString(),
      end.toISOString(),
      allSessions,
      busy,
      session.id,
    )
    if (titles.length > 0) {
      setOverlapTitles(titles)
      return
    }
    await commit(start.toISOString(), end.toISOString())
  }

  const moveToFreeAndSave = () => {
    const slot = findNextSlot(
      duration,
      busy,
      allSessions.filter((s) => s.id !== session.id),
      prefs,
      new Date(startLocal),
    )
    if (!slot) {
      alert('No free slot found within your working hours.')
      return
    }
    void commit(slot.start.toISOString(), slot.end.toISOString())
  }

  const autoReschedule = () => {
    const slot = findNextSlot(
      duration,
      busy,
      allSessions.filter((s) => s.id !== session.id),
      prefs,
    )
    if (!slot) {
      alert('No free slot found in the next two weeks within your working hours.')
      return
    }
    setStartLocal(toLocalInput(slot.start.toISOString()))
    setStatus('scheduled')
  }

  const remove = async () => {
    await removeSession(uid, session)
    onClose()
  }

  const toggleSub = (subId: string) => {
    if (!task) return
    const subtasks = task.subtasks.map((s, idx) => {
      const currentId = s.id || `${s.title}-${idx}`
      return currentId === subId ? { ...s, done: !s.done } : s
    })
    const allDone = subtasks.length > 0 && subtasks.every((s) => s.done)
    void updateTask(uid, task.id, {
      subtasks,
      status: allDone ? 'done' : 'in_progress',
    })
  }

  // steps relevant to THIS block (fallback to all task steps)
  const blockSteps = task
    ? task.subtasks.filter(
        (s) =>
          session.subtaskTitles.length === 0 ||
          session.subtaskTitles.includes(s.title),
      )
    : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs text-muted">Work block · part of task</p>
        <h2 className="mb-1 text-lg font-semibold">{session.taskTitle}</h2>
        {task?.deadline && (
          <p className="mb-3 text-xs text-muted">
            Task deadline: {format(new Date(task.deadline), 'EEE MMM d, HH:mm')}
          </p>
        )}

        {blockSteps.length > 0 ? (
          <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3">
            <p className="mb-2 text-xs text-muted">Steps in this block:</p>
            <div className="flex flex-col gap-1">
              {blockSteps.map((s, idx) => {
                const stepKey = s.id || `${s.title}-${idx}`
                return (
                  <label
                    key={stepKey}
                    className="flex items-center gap-2 text-sm text-text/90"
                  >
                    <input
                      type="checkbox"
                      checked={s.done}
                      onChange={() => toggleSub(stepKey)}
                      className="accent-accent"
                    />
                    <span className={s.done ? 'line-through opacity-60' : ''}>
                      {s.title}
                    </span>
                    <span className="ml-auto text-xs text-muted">
                      {s.estimateMin}m
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ) : (
          session.subtaskTitles.length > 0 && (
            <p className="mb-4 text-sm text-muted">
              {session.subtaskTitles.join(' · ')}
            </p>
          )
        )}

        <label className="mb-1 block text-sm text-muted">Start</label>
        <input
          type="datetime-local"
          value={startLocal}
          onChange={(e) => setStartLocal(e.target.value)}
          className="mb-4 w-full rounded-lg border border-border bg-surface-2 p-2 text-text [color-scheme:dark]"
        />

        <label className="mb-1 block text-sm text-muted">
          Duration (minutes)
        </label>
        <input
          type="number"
          min={5}
          step={5}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="mb-4 w-full rounded-lg border border-border bg-surface-2 p-2 text-text"
        />

        <label className="mb-1 block text-sm text-muted">Status</label>
        <div className="mb-4 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                status === s.value
                  ? 'border-accent bg-accent/20'
                  : 'border-border hover:bg-surface-2'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={autoReschedule}
          className="mb-4 w-full rounded-lg border border-accent/50 bg-accent/10 py-2 text-sm hover:bg-accent/20"
        >
          ↻ Auto-reschedule to next free slot
        </button>

        <div className="flex items-center justify-between">
          <button
            onClick={() => void remove()}
            className="rounded-lg border border-bad/50 px-4 py-2 text-sm text-bad hover:bg-bad/10"
          >
            Delete
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              onClick={() => void save()}
              className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:brightness-110"
            >
              Save
            </button>
          </div>
        </div>
      </div>

      {overlapTitles && (
        <OverlapConfirm
          titles={overlapTitles}
          canMoveFree
          onMoveFree={() => {
            setOverlapTitles(null)
            moveToFreeAndSave()
          }}
          onKeepAnyway={() => {
            setOverlapTitles(null)
            const start = new Date(startLocal)
            const end = new Date(start.getTime() + duration * 60000)
            void commit(start.toISOString(), end.toISOString())
          }}
          onCancel={() => setOverlapTitles(null)}
        />
      )}
    </div>
  )
}
