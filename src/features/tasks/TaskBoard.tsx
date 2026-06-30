import { useState } from 'react'
import { format, isPast, isToday } from 'date-fns'
import { updateTask, deleteTask, updateSession, saveSession } from '../../lib/db'
import { removeSession } from '../../lib/calendar'
import { scheduleTasks } from '../../agent/scheduler'
import type {
  Task,
  Session,
  TaskType,
  BusyEvent,
  Preferences,
} from '../../lib/types'
import TypeActions from './TypeActions'
import AddTaskForm from './AddTaskForm'
import EditTaskForm from './EditTaskForm'

const TYPE_ICON: Record<TaskType, string> = {
  general: '📌',
  meeting: '🗓️',
  bill: '💳',
  interview: '🎯',
  call: '📞',
  email: '✉️',
}

function priorityColor(p: number) {
  if (p >= 75) return 'bg-bad'
  if (p >= 50) return 'bg-warn'
  return 'bg-good'
}

export default function TaskBoard({
  uid,
  tasks,
  sessions,
  busy,
  prefs,
  selectedTaskId,
  onSelectTask,
}: {
  uid: string
  tasks: Task[]
  sessions: Session[]
  busy: BusyEvent[]
  prefs: Preferences
  selectedTaskId: string | null
  onSelectTask: (id: string | null) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showAll, setShowAll] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)

  // "Today" view: blocks scheduled today, due today, overdue & open, or undated & open.
  const isTodayRelevant = (task: Task) => {
    if (sessions.some((s) => s.taskId === task.id && isToday(new Date(s.start))))
      return true
    if (task.deadline && isToday(new Date(task.deadline))) return true
    if (task.deadline && isPast(new Date(task.deadline)) && task.status !== 'done')
      return true
    if (!task.deadline && task.status !== 'done') return true
    return false
  }

  // keep the calendar in sync when a task's done-state changes
  const syncSessions = (taskId: string, done: boolean) => {
    sessions
      .filter((s) => s.taskId === taskId)
      .forEach((s) => {
        if (done && s.status !== 'done')
          void updateSession(uid, s.id, { status: 'done' })
        if (!done && s.status === 'done')
          void updateSession(uid, s.id, { status: 'scheduled' })
      })
  }

  const sorted = [...tasks].sort((a, b) => {
    if (a.status === 'done' && b.status !== 'done') return 1
    if (b.status === 'done' && a.status !== 'done') return -1
    if (b.priority !== a.priority) return b.priority - a.priority
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
    return da - db
  })

  const visible = showAll ? sorted : sorted.filter(isTodayRelevant)

  const toggleSub = (task: Task, subId: string) => {
    const subtasks = task.subtasks.map((s, idx) => {
      const currentId = s.id || `${s.title}-${idx}`
      return currentId === subId ? { ...s, done: !s.done } : s
    })
    const allDone = subtasks.length > 0 && subtasks.every((s) => s.done)
    void updateTask(uid, task.id, {
      subtasks,
      status: allDone ? 'done' : 'in_progress',
    })
    syncSessions(task.id, allDone)
  }

  const toggleDone = (task: Task) => {
    const done = task.status !== 'done'
    void updateTask(uid, task.id, { status: done ? 'done' : 'todo' })
    syncSessions(task.id, done)
  }

  const removeTask = async (task: Task) => {
    // cascade: remove the task's calendar blocks (and their Google events) too
    await Promise.all(
      sessions
        .filter((s) => s.taskId === task.id)
        .map((s) => removeSession(uid, s)),
    )
    await deleteTask(uid, task.id)
  }

  const planTask = async (task: Task) => {
    const res = scheduleTasks(uid, [task], sessions, busy, prefs)
    if (res.sessions.length === 0) {
      alert(
        'No free slots before the deadline within your working hours — adjust the deadline or free up time.',
      )
      return
    }
    await Promise.all(res.sessions.map((s) => saveSession(s)))
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tasks</h2>
        <div className="flex items-center gap-2 text-xs">
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              onClick={() => setShowAll(false)}
              className={`rounded px-2 py-0.5 ${
                !showAll ? 'bg-accent/20 text-text' : 'text-muted'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setShowAll(true)}
              className={`rounded px-2 py-0.5 ${
                showAll ? 'bg-accent/20 text-text' : 'text-muted'
              }`}
            >
              All
            </button>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:brightness-110"
          >
            ＋ Add
          </button>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-muted">
          {tasks.length === 0
            ? 'No tasks yet — use the brain dump or ＋ Add to create one.'
            : showAll
              ? 'No tasks.'
              : 'Nothing for today. Switch to “All” to see everything.'}
        </p>
      )}

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {visible.map((task) => {
          const sessCount = sessions.filter((s) => s.taskId === task.id).length
          const done = task.status === 'done'
          const overdue =
            task.deadline && isPast(new Date(task.deadline)) && !done
          const isOpen = expanded[task.id]
          return (
            <div
              key={task.id}
              onClick={() =>
                onSelectTask(selectedTaskId === task.id ? null : task.id)
              }
              className={`cursor-pointer rounded-xl border bg-surface-2 p-3 transition ${
                selectedTaskId === task.id
                  ? 'border-accent ring-1 ring-accent/50'
                  : 'border-border'
              } ${done ? 'opacity-50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleDone(task)
                  }}
                  className={`mt-0.5 h-5 w-5 shrink-0 rounded-md border ${
                    done
                      ? 'border-good bg-good text-bg'
                      : 'border-border hover:border-good'
                  }`}
                >
                  {done ? '✓' : ''}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span>{TYPE_ICON[task.type]}</span>
                    <span
                      className={`font-medium ${done ? 'line-through' : ''}`}
                    >
                      {task.title}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {task.deadline && (
                      <span className={overdue ? 'text-bad' : ''}>
                        {overdue ? '⚠ overdue · ' : 'due '}
                        {format(new Date(task.deadline), 'EEE MMM d, HH:mm')}
                      </span>
                    )}
                    {task.recurrence && (
                      <span className="rounded bg-accent/15 px-1.5 text-accent">
                        🔁 {task.recurrence}
                      </span>
                    )}
                    {sessCount > 0 && <span>📅 {sessCount} session(s)</span>}
                    {sessCount === 0 && !done && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void planTask(task)
                        }}
                        className="rounded bg-accent/20 px-1.5 text-accent hover:bg-accent/30"
                      >
                        📅 Plan it
                      </button>
                    )}
                    {(task.subtasks.length > 0 || task.description) && (
                      <button
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setExpanded((e) => ({ ...e, [task.id]: !e[task.id] }))
                        }}
                        className="hover:text-text"
                      >
                        {isOpen ? '▾' : '▸'}{' '}
                        {task.subtasks.length > 0
                          ? `${task.subtasks.length} steps`
                          : '📝 note'}
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <div className="mt-2 flex flex-col gap-1">
                      {task.subtasks.map((s, idx) => {
                        const subKey = s.id || `${s.title}-${idx}`
                        return (
                          <label
                            key={subKey}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-2 text-sm text-text/80"
                          >
                            <input
                              type="checkbox"
                              checked={s.done}
                              onChange={() => toggleSub(task, subKey)}
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
                      {task.description && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 whitespace-pre-wrap rounded-lg border border-border bg-surface p-2 text-xs text-text/80"
                        >
                          {task.description}
                        </div>
                      )}
                    </div>
                  )}

                  <TypeActions task={task} />
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div
                    className="h-1.5 w-10 overflow-hidden rounded-full bg-border"
                    title={`priority ${task.priority}`}
                  >
                    <div
                      className={`h-full ${priorityColor(task.priority)}`}
                      style={{ width: `${task.priority}%` }}
                    />
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setEditing(task)
                      }}
                      title="Edit task & steps"
                      className="text-xs text-muted hover:text-accent"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void removeTask(task)
                      }}
                      title="Delete task and its calendar blocks"
                      className="text-xs text-muted hover:text-bad"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {showAdd && (
        <AddTaskForm
          uid={uid}
          tasks={tasks}
          sessions={sessions}
          busy={busy}
          prefs={prefs}
          onClose={() => setShowAdd(false)}
        />
      )}

      {editing && (
        <EditTaskForm
          uid={uid}
          task={editing}
          sessions={sessions}
          busy={busy}
          prefs={prefs}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  )
}
