import { useState } from 'react'
import { format } from 'date-fns'
import { updateTask, saveSession, newId } from '../../lib/db'
import { removeSession } from '../../lib/calendar'
import { scheduleTasks } from '../../agent/scheduler'
import type {
  Task,
  TaskType,
  Subtask,
  Session,
  BusyEvent,
  Preferences,
} from '../../lib/types'

const TYPES: { value: TaskType; label: string }[] = [
  { value: 'general', label: '📌 General' },
  { value: 'meeting', label: '🗓️ Meeting' },
  { value: 'bill', label: '💳 Bill' },
  { value: 'interview', label: '🎯 Interview' },
  { value: 'call', label: '📞 Call' },
  { value: 'email', label: '✉️ Email' },
]

export default function EditTaskForm({
  uid,
  task,
  sessions,
  busy,
  prefs,
  onClose,
}: {
  uid: string
  task: Task
  sessions: Session[]
  busy: BusyEvent[]
  prefs: Preferences
  onClose: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [type, setType] = useState<TaskType>(task.type)
  const [deadline, setDeadline] = useState(
    task.deadline ? format(new Date(task.deadline), "yyyy-MM-dd'T'HH:mm") : '',
  )
  const [subs, setSubs] = useState<Subtask[]>(task.subtasks)
  const [description, setDescription] = useState(task.description ?? '')
  const [repeat, setRepeat] = useState(task.recurrence ?? 'none')
  const [repeatTime, setRepeatTime] = useState(task.recurTime ?? '18:00')
  const [replan, setReplan] = useState(false)

  const field =
    'w-full rounded-lg border border-border bg-surface-2 p-2 text-text focus:border-accent focus:outline-none'

  const addStep = () =>
    setSubs((s) => [
      ...s,
      { id: newId(), title: '', estimateMin: 30, order: s.length, done: false },
    ])
  const patchStep = (id: string, patch: Partial<Subtask>) =>
    setSubs((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const removeStep = (id: string) =>
    setSubs((s) => s.filter((x) => x.id !== id))

  const save = async () => {
    if (!title.trim()) return
    const cleanSubs = subs
      .filter((s) => s.title.trim())
      .map((s, i) => ({ ...s, title: s.title.trim(), order: i }))
    const estimateMin =
      cleanSubs.length > 0
        ? cleanSubs.reduce((m, s) => m + (s.estimateMin || 0), 0)
        : task.estimateMin
    const allDone = cleanSubs.length > 0 && cleanSubs.every((s) => s.done)
    const deadlineISO = deadline ? new Date(deadline).toISOString() : null

    const updated: Task = {
      ...task,
      title: title.trim(),
      type,
      deadline: deadlineISO,
      subtasks: cleanSubs,
      estimateMin,
      status: allDone ? 'done' : task.status === 'done' ? 'in_progress' : task.status,
    }
    const isHabit = repeat !== 'none'
    const patch: Partial<Task> = {
      title: updated.title,
      type: updated.type,
      deadline: updated.deadline,
      subtasks: updated.subtasks,
      estimateMin: updated.estimateMin,
      status: updated.status,
      description: description.trim(),
      recurrence: isHabit ? (repeat as Task['recurrence']) : null,
    }
    if (isHabit) {
      patch.recurTime = repeatTime
      patch.recurDurationMin = updated.estimateMin || 30
    }
    await updateTask(uid, task.id, patch)

    if (replan) {
      await Promise.all(
        sessions
          .filter((s) => s.taskId === task.id)
          .map((s) => removeSession(uid, s)),
      )
      const others = sessions.filter((s) => s.taskId !== task.id)
      const res = scheduleTasks(uid, [updated], others, busy, prefs)
      await Promise.all(res.sessions.map((s) => saveSession(s)))
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Edit task</h2>

        <label className="mb-1 block text-sm text-muted">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`mb-3 ${field}`}
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className={`${field} [color-scheme:dark]`}
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Deadline</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={`${field} [color-scheme:dark]`}
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Repeats</label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as typeof repeat)}
              className={`${field} [color-scheme:dark]`}
            >
              <option value="none">No (one-off)</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekends">Weekends</option>
            </select>
          </div>
          {repeat !== 'none' && (
            <div>
              <label className="mb-1 block text-sm text-muted">Time</label>
              <input
                type="time"
                value={repeatTime}
                onChange={(e) => setRepeatTime(e.target.value)}
                className={`${field} [color-scheme:dark]`}
              />
            </div>
          )}
        </div>

        <label className="mb-1 block text-sm text-muted">
          Description / notes (drafted emails appear here)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Notes, an agent-drafted email, links…"
          className={`mb-4 resize-y ${field}`}
        />

        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm text-muted">Steps (to-dos)</label>
          <button
            onClick={addStep}
            className="rounded-lg border border-accent/40 bg-accent/10 px-2 py-0.5 text-xs text-accent hover:bg-accent/20"
          >
            ＋ Add step
          </button>
        </div>
        <div className="mb-4 flex flex-col gap-2">
          {subs.length === 0 && (
            <p className="text-xs text-muted">No steps — add some, or leave empty.</p>
          )}
          {subs.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={s.done}
                onChange={(e) => patchStep(s.id, { done: e.target.checked })}
                className="accent-accent"
              />
              <input
                value={s.title}
                onChange={(e) => patchStep(s.id, { title: e.target.value })}
                placeholder="Step…"
                className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm focus:border-accent focus:outline-none"
              />
              <input
                type="number"
                min={5}
                step={5}
                value={s.estimateMin}
                onChange={(e) =>
                  patchStep(s.id, { estimateMin: Number(e.target.value) })
                }
                className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm"
              />
              <button
                onClick={() => removeStep(s.id)}
                className="text-muted hover:text-bad"
                title="Delete step"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        <label className="mb-4 flex items-center gap-2 text-sm text-text/90">
          <input
            type="checkbox"
            checked={replan}
            onChange={(e) => setReplan(e.target.checked)}
            className="accent-accent"
          />
          Re-plan calendar blocks for this task
        </label>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!title.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:brightness-110 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
