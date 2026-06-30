import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { updateSession } from '../../lib/db'
import { runRecoveryScan } from '../../agent/rePlan'
import type { Session, Task, BusyEvent, Preferences } from '../../lib/types'

interface Props {
  uid: string
  sessions: Session[]
  tasks: Task[]
  busy: BusyEvent[]
  prefs: Preferences
}

export default function ReminderHost({ uid, sessions, tasks, busy, prefs }: Props) {
  const [, tick] = useState(0)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const latest = useRef({ sessions, tasks, busy, prefs })
  latest.current = { sessions, tasks, busy, prefs }

  // request permission once
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  // periodic scan: fire reminders + detect misses
  useEffect(() => {
    const run = () => {
      const now = Date.now()
      const { sessions, prefs } = latest.current
      const leadMs = prefs.reminderLeadMin * 60000

      for (const s of sessions) {
        if (s.status !== 'scheduled' || s.notified) continue
        const start = new Date(s.start).getTime()
        if (start - now <= leadMs && start - now > -60000) {
          void updateSession(uid, s.id, { notified: true })
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`⚡ Starting soon: ${s.taskTitle}`, {
              body: `${format(new Date(s.start), 'HH:mm')} — ${s.subtaskTitles.join(', ')}`,
            })
          }
        }
      }

      void runRecoveryScan(
        uid,
        latest.current.sessions,
        latest.current.tasks,
        latest.current.busy,
        latest.current.prefs,
      )
      tick((n) => n + 1)
    }
    run()
    const id = setInterval(run, 30000)
    return () => clearInterval(id)
  }, [uid])

  // Show a reminder ONLY in the lead window before start (until ~5 min after),
  // for scheduled blocks the user hasn't dismissed. Snooze/done/“I’m on it”
  // all remove it; it reappears at the lead time of the new start after snooze.
  const now = Date.now()
  const leadMs = prefs.reminderLeadMin * 60000
  const imminent = sessions
    .filter((s) => s.status === 'scheduled' && !dismissed.has(s.id))
    .filter((s) => {
      const start = new Date(s.start).getTime()
      return start - now <= leadMs && now - start < 5 * 60000
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())[0]

  if (!imminent) return null

  const snooze = () => {
    const start = new Date(new Date(imminent.start).getTime() + 10 * 60000)
    const end = new Date(new Date(imminent.end).getTime() + 10 * 60000)
    void updateSession(uid, imminent.id, {
      start: start.toISOString(),
      end: end.toISOString(),
      notified: false,
    })
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 animate-in rounded-2xl border border-accent/50 bg-surface p-4 shadow-2xl">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-accent">
          🔔 Starting soon · {format(new Date(imminent.start), 'HH:mm')}
        </span>
        <button
          onClick={() => setDismissed((d) => new Set(d).add(imminent.id))}
          className="text-muted hover:text-text"
          title="Dismiss"
        >
          ✕
        </button>
      </div>
      <div className="mb-2 font-medium">{imminent.taskTitle}</div>
      <div className="mb-3 text-xs text-muted">
        {imminent.subtaskTitles.join(' · ')}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          onClick={() =>
            void updateSession(uid, imminent.id, { status: 'in_progress' })
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-white hover:brightness-110"
        >
          I’m on it
        </button>
        <button
          onClick={snooze}
          className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-2"
        >
          Snooze 10m
        </button>
        <button
          onClick={() =>
            void updateSession(uid, imminent.id, { status: 'done' })
          }
          className="rounded-lg border border-good/50 px-3 py-1.5 text-good hover:bg-good/10"
        >
          Done
        </button>
      </div>
    </div>
  )
}
