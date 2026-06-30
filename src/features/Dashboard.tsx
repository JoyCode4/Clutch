import { useEffect, useState } from 'react'
import { startOfDay, format } from 'date-fns'
import { useAuth } from '../lib/auth'
import {
  subscribeTasks,
  subscribeSessions,
  subscribeBusy,
  subscribePreferences,
  subscribeRecovery,
  subscribeChat,
  updateTask,
  updateSession,
  deleteSession,
  saveSession,
} from '../lib/db'
import {
  syncSessionsToGoogle,
  pullGoogleChanges,
  isCalendarConnected,
} from '../lib/calendar'
import {
  type Task,
  type Session,
  type BusyEvent,
  type Preferences,
  type RecoveryProposal,
  type ChatMessage,
  DEFAULT_PREFS,
} from '../lib/types'
import { sendChat } from '../agent/chatAgent'
import ChatPanel from './chat/ChatPanel'
import TaskBoard from './tasks/TaskBoard'
import PlanCalendar from './calendar/PlanCalendar'
import RecoveryBanner from './recovery/RecoveryBanner'
import ConflictBanner from './conflicts/ConflictBanner'
import OverloadBanner from './overload/OverloadBanner'
import ReminderHost from './reminders/ReminderHost'
import Preferences_ from './settings/Preferences'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const uid = user!.uid

  const [tasks, setTasks] = useState<Task[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [busy, setBusy] = useState<BusyEvent[]>([])
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS)
  const [recovery, setRecovery] = useState<RecoveryProposal[]>([])
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [showPrefs, setShowPrefs] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)

  useEffect(() => {
    const subs = [
      subscribeTasks(uid, setTasks),
      subscribeSessions(uid, setSessions),
      subscribeBusy(uid, setBusy),
      subscribePreferences(uid, setPrefs),
      subscribeRecovery(uid, setRecovery),
      subscribeChat(uid, setChat),
    ]
    return () => subs.forEach((u) => u())
  }, [uid])

  // Reconcile task status FROM its calendar blocks (complete from calendar →
  // task shows done, and vice-versa). Guarded so it only writes on a real change.
  useEffect(() => {
    for (const task of tasks) {
      const ts = sessions.filter((s) => s.taskId === task.id)
      if (ts.length === 0) continue
      const allDone = ts.every((s) => s.status === 'done')
      if (allDone && task.status !== 'done') {
        void updateTask(uid, task.id, { status: 'done' })
      } else if (!allDone && task.status === 'done') {
        void updateTask(uid, task.id, { status: 'in_progress' })
      }
    }
  }, [uid, sessions, tasks])

  // Instantiate today's block for each recurring habit (idempotent via a
  // deterministic id), so habits show up daily and can be checked off.
  useEffect(() => {
    const today = startOfDay(new Date())
    const dow = today.getDay()
    for (const t of tasks) {
      if (!t.recurrence) continue
      const matches =
        t.recurrence === 'daily' ||
        (t.recurrence === 'weekdays' && dow >= 1 && dow <= 5) ||
        (t.recurrence === 'weekends' && (dow === 0 || dow === 6))
      if (!matches) continue
      const id = `hab_${t.id}_${format(today, 'yyyyMMdd')}`
      if (sessions.some((s) => s.id === id)) continue
      const [h, m] = (t.recurTime ?? '18:00').split(':').map(Number)
      const start = new Date(today)
      start.setHours(h || 18, m || 0, 0, 0)
      const end = new Date(start.getTime() + (t.recurDurationMin ?? 30) * 60000)
      void saveSession({
        id,
        uid,
        taskId: t.id,
        taskTitle: t.title,
        subtaskTitles: [],
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'scheduled',
      })
    }
  }, [uid, tasks, sessions])

  // Auto-push to Google Calendar whenever blocks/tasks change (debounced).
  // No button — if connected, it just keeps Google in sync (incl. todo progress
  // in the event description). No-ops when not connected.
  useEffect(() => {
    if (!isCalendarConnected()) return
    const t = setTimeout(async () => {
      const { idUpdates } = await syncSessionsToGoogle(sessions, tasks)
      for (const [sid, eid] of Object.entries(idUpdates)) {
        void updateSession(uid, sid, { gcalEventId: eid })
      }
    }, 1000)
    return () => clearTimeout(t)
  }, [uid, sessions, tasks])

  // Pull changes made in Google Calendar back into Clutch — moved events update
  // the block's time; deleted events delete the block (two-way). Runs every 30s
  // and immediately whenever you switch back to the tab.
  useEffect(() => {
    if (!isCalendarConnected()) return
    const pull = async () => {
      const { updates, deletes } = await pullGoogleChanges(sessions)
      for (const u of updates) {
        void updateSession(uid, u.id, { start: u.start, end: u.end })
      }
      for (const id of deletes) {
        void deleteSession(uid, id)
      }
    }
    const id = setInterval(pull, 30000)
    window.addEventListener('focus', pull)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', pull)
    }
  }, [uid, sessions])

  const askAgent = (instruction: string) =>
    sendChat({ uid, text: instruction, prefs, busy, sessions, tasks, history: chat })

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col px-4 py-5">
      {/* Header */}
      <header className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚡</span>
          <span className="text-xl font-bold tracking-tight">Clutch</span>
          <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
            panic → plan
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {isCalendarConnected() && (
            <span className="rounded-full bg-good/15 px-2 py-0.5 text-xs text-good">
              📅 Google Calendar synced
            </span>
          )}
          <button
            onClick={() => setShowPrefs(true)}
            className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-text"
          >
            Settings
          </button>
          <img
            src={user!.photoURL ?? ''}
            alt=""
            className="h-8 w-8 rounded-full"
            referrerPolicy="no-referrer"
          />
          <button
            onClick={() => void signOut()}
            className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-text"
          >
            Sign out
          </button>
        </div>
      </header>

      <RecoveryBanner uid={uid} proposals={recovery} />
      <ConflictBanner
        uid={uid}
        sessions={sessions}
        busy={busy}
        prefs={prefs}
        onAskAgent={askAgent}
      />
      <OverloadBanner
        uid={uid}
        tasks={tasks}
        sessions={sessions}
        busy={busy}
        prefs={prefs}
        onAskAgent={askAgent}
      />

      <p className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-muted">
        💡 <span className="text-text">Tasks</span> are <em>what</em> to do (with
        steps &amp; a deadline). <span className="text-text">Calendar blocks</span>{' '}
        are <em>when</em> you’ll work on them — one task can have several. Click a
        task or a block to highlight the link; drag a block to reschedule it.
      </p>

      <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: chat + tasks */}
        <div className="flex flex-col gap-5 lg:col-span-1">
          <ChatPanel
            uid={uid}
            prefs={prefs}
            busy={busy}
            sessions={sessions}
            tasks={tasks}
            messages={chat}
          />
          <TaskBoard
            uid={uid}
            tasks={tasks}
            sessions={sessions}
            busy={busy}
            prefs={prefs}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>

        {/* Main: big calendar */}
        <div className="lg:col-span-2">
          <PlanCalendar
            uid={uid}
            tasks={tasks}
            sessions={sessions}
            busy={busy}
            prefs={prefs}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>
      </div>

      <ReminderHost
        uid={uid}
        sessions={sessions}
        tasks={tasks}
        busy={busy}
        prefs={prefs}
      />

      {showPrefs && (
        <Preferences_ uid={uid} prefs={prefs} onClose={() => setShowPrefs(false)} />
      )}
    </div>
  )
}
