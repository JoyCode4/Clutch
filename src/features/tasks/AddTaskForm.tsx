import { useState } from 'react'
import { format } from 'date-fns'
import { saveTask, saveSession, newId, uniqueTitle } from '../../lib/db'
import { scheduleTasks } from '../../agent/scheduler'
import type {
  Task,
  TaskType,
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

function priorityNum(level: string, deadlineISO: string): number {
  let base = level === 'high' ? 80 : level === 'low' ? 30 : 55
  const hours = (new Date(deadlineISO).getTime() - Date.now()) / 3.6e6
  if (hours < 24) base += 18
  else if (hours < 72) base += 10
  return Math.max(0, Math.min(100, base))
}

export default function AddTaskForm({
  uid,
  tasks,
  sessions,
  busy,
  prefs,
  onClose,
}: {
  uid: string
  tasks: Task[]
  sessions: Session[]
  busy: BusyEvent[]
  prefs: Preferences
  onClose: () => void
}) {
  const todayEnd = (() => {
    const d = new Date()
    d.setHours(23, 59, 0, 0)
    return format(d, "yyyy-MM-dd'T'HH:mm")
  })()

  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('general')
  const [deadline, setDeadline] = useState(todayEnd)
  const [estimate, setEstimate] = useState(30)
  const [priority, setPriority] = useState('medium')
  const [scheduleNow, setScheduleNow] = useState(true)
  const [repeat, setRepeat] = useState('none')
  const [repeatTime, setRepeatTime] = useState('18:00')
  // type-specific meta
  const [amount, setAmount] = useState('')
  const [payLink, setPayLink] = useState('')
  const [phone, setPhone] = useState('')
  const [emailTo, setEmailTo] = useState('')

  const isHabit = repeat !== 'none'

  const save = async () => {
    if (!title.trim()) return
    const deadlineISO = new Date(deadline).toISOString()
    const meta: Task['meta'] = {}
    if (type === 'bill') {
      if (amount) meta.amount = amount
      if (payLink) meta.payLink = payLink
    }
    if (type === 'call' && phone) meta.phone = phone
    if (type === 'email' && emailTo) meta.emailTo = emailTo

    const task: Task = {
      id: newId(),
      uid,
      title: uniqueTitle(
        title.trim(),
        tasks.map((t) => t.title),
      ),
      type,
      deadline: isHabit ? null : deadlineISO,
      status: 'todo',
      priority: priorityNum(priority, deadlineISO),
      estimateMin: estimate,
      subtasks: [],
      source: 'manual',
      createdAt: Date.now(),
      ...(Object.keys(meta).length ? { meta } : {}),
      ...(isHabit
        ? {
            recurrence: repeat as Task['recurrence'],
            recurTime: repeatTime,
            recurDurationMin: estimate,
          }
        : {}),
    }
    await saveTask(task)

    // habits get their daily block from the instantiation effect; one-off tasks
    // schedule now if requested.
    if (!isHabit && scheduleNow) {
      const res = scheduleTasks(uid, [task], sessions, busy, prefs)
      await Promise.all(res.sessions.map((s) => saveSession(s)))
    }
    onClose()
  }

  const field = 'w-full rounded-lg border border-border bg-surface-2 p-2 text-text focus:border-accent focus:outline-none'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Add a task</h2>

        <label className="mb-1 block text-sm text-muted">What needs doing?</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Pay electricity bill"
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
            <label className="mb-1 block text-sm text-muted">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${field} [color-scheme:dark]`}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Deadline</label>
            <input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={`${field} [color-scheme:dark]`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted">Effort (min)</label>
            <input
              type="number"
              min={10}
              step={5}
              value={estimate}
              onChange={(e) => setEstimate(Number(e.target.value))}
              className={field}
            />
          </div>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm text-muted">Repeats</label>
            <select
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className={`${field} [color-scheme:dark]`}
            >
              <option value="none">No (one-off)</option>
              <option value="daily">Daily</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekends">Weekends</option>
            </select>
          </div>
          {isHabit && (
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

        {/* type-specific fields */}
        {type === 'bill' && (
          <div className="mb-3 grid grid-cols-2 gap-3">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (e.g. ₹1,200)"
              className={field}
            />
            <input
              value={payLink}
              onChange={(e) => setPayLink(e.target.value)}
              placeholder="Payment link"
              className={field}
            />
          </div>
        )}
        {type === 'call' && (
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number"
            className={`mb-3 ${field}`}
          />
        )}
        {type === 'email' && (
          <input
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
            placeholder="Recipient email"
            className={`mb-3 ${field}`}
          />
        )}

        {isHabit ? (
          <p className="mb-4 text-xs text-muted">
            🔁 A block will appear automatically each {repeat === 'daily' ? 'day' : repeat} at {repeatTime}.
          </p>
        ) : (
          <label className="mb-4 flex items-center gap-2 text-sm text-text/90">
            <input
              type="checkbox"
              checked={scheduleNow}
              onChange={(e) => setScheduleNow(e.target.checked)}
              className="accent-accent"
            />
            Schedule a work block into my calendar now
          </label>
        )}

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
            Add task
          </button>
        </div>
      </div>
    </div>
  )
}
