import { useState } from 'react'
import { addDays, format, isPast } from 'date-fns'
import { scheduleTasks, getFreeIntervals } from '../../agent/scheduler'
import { updateTask, deleteTask, saveSession } from '../../lib/db'
import { removeSession } from '../../lib/calendar'
import AgentPrompt from '../agent/AgentPrompt'
import type { Task, Session, BusyEvent, Preferences } from '../../lib/types'

const durMin = (s: Session) =>
  (new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000

function remainingEffort(t: Task): number {
  if (t.subtasks.length > 0)
    return t.subtasks.filter((s) => !s.done).reduce((m, s) => m + s.estimateMin, 0)
  return t.estimateMin
}

export default function OverloadBanner({
  uid,
  tasks,
  sessions,
  busy,
  prefs,
  onAskAgent,
}: {
  uid: string
  tasks: Task[]
  sessions: Session[]
  busy: BusyEvent[]
  prefs: Preferences
  onAskAgent: (instruction: string) => void | Promise<void>
}) {
  const [prompt, setPrompt] = useState<{ title: string; deadline: string } | null>(
    null,
  )
  const now = new Date()

  // A task is "at risk" if it's open, has an upcoming deadline, and its
  // scheduled work before that deadline is less than the effort still needed.
  // A task is genuinely "won't fit" only when the time it has already + the
  // FREE time before its deadline still can't cover the remaining effort.
  // (A task that's simply unscheduled but has plenty of free time is NOT
  // flagged — that just needs scheduling, not a hard decision.)
  const atRisk = tasks
    .map((t) => {
      if (t.status === 'done' || !t.deadline) return null
      const deadline = new Date(t.deadline)
      if (isPast(deadline)) return null // overdue is handled by recovery
      if (deadline.getTime() - now.getTime() > 14 * 864e5) return null
      const need = remainingEffort(t)
      if (need <= 0) return null
      const ownScheduled = sessions
        .filter((s) => s.taskId === t.id && s.status !== 'missed')
        .filter((s) => new Date(s.end) <= deadline)
        .reduce((m, s) => m + durMin(s), 0)
      const freeMin = getFreeIntervals(now, deadline, busy, sessions, prefs).reduce(
        (m, iv) => m + (iv.end.getTime() - iv.start.getTime()) / 60000,
        0,
      )
      const capacity = ownScheduled + freeMin
      if (capacity + 5 >= need) return null // it fits — no problem
      return { task: t, need, capacity }
    })
    .filter((x): x is { task: Task; need: number; capacity: number } => x !== null)

  if (atRisk.length === 0 && !prompt) return null

  const replan = async (task: Task) => {
    const mine = sessions.filter((s) => s.taskId === task.id)
    await Promise.all(mine.map((s) => removeSession(uid, s)))
    const others = sessions.filter((s) => s.taskId !== task.id)
    const res = scheduleTasks(uid, [task], others, busy, prefs)
    await Promise.all(res.sessions.map((s) => saveSession(s)))
    return res.unplaced.length === 0
  }

  const defer = async (task: Task) => {
    const newDeadline = addDays(
      task.deadline ? new Date(task.deadline) : now,
      2,
    ).toISOString()
    await updateTask(uid, task.id, { deadline: newDeadline })
    await replan({ ...task, deadline: newDeadline })
  }

  const shorten = async (task: Task) => {
    const subtasks = task.subtasks.map((s) => ({
      ...s,
      estimateMin: Math.max(10, Math.round(s.estimateMin * 0.6)),
    }))
    const estimateMin = Math.max(10, Math.round(task.estimateMin * 0.6))
    await updateTask(uid, task.id, { subtasks, estimateMin })
    await replan({ ...task, subtasks, estimateMin })
  }

  const drop = async (task: Task) => {
    await Promise.all(
      sessions
        .filter((s) => s.taskId === task.id)
        .map((s) => removeSession(uid, s)),
    )
    await deleteTask(uid, task.id)
  }

  return (
    <div className="mb-5 flex flex-col gap-3">
      {atRisk.map(({ task: t, need, capacity }) => {
        return (
          <div
            key={t.id}
            className="animate-in rounded-xl border border-warn/50 bg-warn/10 p-4"
          >
            <p className="mb-3 text-sm text-text">
              <span className="font-medium">🤖 Won’t fit in time:</span> “{t.title}”
              needs ~{need}m before{' '}
              {t.deadline && format(new Date(t.deadline), 'EEE MMM d, HH:mm')}, but
              only ~{Math.round(capacity)}m of free time is available. How should I
              handle it?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void defer(t)}
                className="rounded-lg border border-good/60 bg-good/15 px-3 py-1.5 text-sm hover:bg-good/25"
              >
                ✅ Push deadline +2 days &amp; re-plan
              </button>
              <button
                onClick={() => void shorten(t)}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
              >
                Cut scope ~40% &amp; re-plan
              </button>
              <button
                onClick={() => void drop(t)}
                className="rounded-lg border border-bad/50 px-3 py-1.5 text-sm text-bad hover:bg-bad/10"
              >
                Drop it
              </button>
              <button
                onClick={() =>
                  setPrompt({
                    title: t.title,
                    deadline: t.deadline
                      ? format(new Date(t.deadline), 'EEE MMM d, HH:mm')
                      : 'no deadline',
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
          contextLabel={`"${prompt.title}" (due ${prompt.deadline}) won't fit. Tell me what to defer, shorten, or drop.`}
          placeholder='e.g. "keep the assignment, push the exam prep to Saturday"'
          onSend={(t) =>
            void onAskAgent(
              `${t}\n\n(Context: task "${prompt.title}" (due ${prompt.deadline}) won't fit before its deadline. Consider task dependencies. Use update_session to move/resize existing blocks.)`,
            )
          }
          onClose={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
