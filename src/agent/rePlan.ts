import { addDays, format } from 'date-fns'
import { getFreeIntervals } from './scheduler'
import {
  updateSession,
  saveRecovery,
  newId,
} from '../lib/db'
import type {
  Session,
  Task,
  BusyEvent,
  Preferences,
  RecoveryOption,
} from '../lib/types'

/**
 * Proactive re-plan scan (client-side, runs on app-open / interval).
 * Detects scheduled sessions whose time has passed without completion,
 * marks them missed, and writes a recovery PROPOSAL with ranked options.
 * It does NOT move anything automatically — the user approves in the banner.
 */
export async function runRecoveryScan(
  uid: string,
  sessions: Session[],
  tasks: Task[],
  busy: BusyEvent[],
  prefs: Preferences,
  now: Date = new Date(),
) {
  const missed = sessions.filter(
    (s) => s.status === 'scheduled' && new Date(s.end) < now,
  )

  for (const s of missed) {
    await updateSession(uid, s.id, { status: 'missed' })

    const task = tasks.find((t) => t.id === s.taskId)
    const deadline = task?.deadline ? new Date(task.deadline) : addDays(now, 7)
    const durationMin = (new Date(s.end).getTime() - new Date(s.start).getTime()) / 60000

    // Free slots between now and the deadline, scheduling around everything else
    const free = getFreeIntervals(
      now,
      deadline,
      busy,
      sessions.filter((x) => x.id !== s.id),
      prefs,
    ).filter(
      (iv) => (iv.end.getTime() - iv.start.getTime()) / 60000 >= durationMin,
    )

    const options: RecoveryOption[] = free.slice(0, 3).map((iv, i) => {
      const start = new Date(iv.start)
      const end = new Date(start.getTime() + durationMin * 60000)
      return {
        label: `${format(start, 'EEE HH:mm')}–${format(end, 'HH:mm')}`,
        start: start.toISOString(),
        end: end.toISOString(),
        note:
          i === 0
            ? 'earliest free slot — keeps you on track'
            : 'alternative slot',
        recommended: i === 0,
      }
    })

    await saveRecovery({
      id: newId(),
      uid,
      sessionId: s.id,
      taskTitle: s.taskTitle,
      options,
      createdAt: Date.now(),
    })
  }

  return missed.length
}
