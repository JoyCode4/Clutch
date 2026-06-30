import {
  addDays,
  startOfDay,
  isBefore,
  isAfter,
  max as maxDate,
  min as minDate,
} from 'date-fns'
import type { Task, Session, BusyEvent, Preferences } from '../lib/types'
import { newId } from '../lib/db'

const MIN_BLOCK_MIN = 25
// Rest gap left after each work session so the agent never stacks blocks back-to-back.
const BREAK_MIN = 10

interface Interval {
  start: Date
  end: Date
}

/** Occupied intervals (busy commitments + already-scheduled work) within a window. */
function occupiedIn(
  window: Interval,
  busy: BusyEvent[],
  sessions: Session[],
): Interval[] {
  const all: Interval[] = [
    ...busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) })),
    // pad work sessions with a short break so back-to-back blocks get breathing room
    ...sessions.map((s) => ({
      start: new Date(s.start),
      end: new Date(new Date(s.end).getTime() + BREAK_MIN * 60000),
    })),
  ]
  return all
    .filter((iv) => isBefore(iv.start, window.end) && isAfter(iv.end, window.start))
    .map((iv) => ({
      start: maxDate([iv.start, window.start]),
      end: minDate([iv.end, window.end]),
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Free intervals between `from` and `to`, within each day's working window. */
export function getFreeIntervals(
  from: Date,
  to: Date,
  busy: BusyEvent[],
  sessions: Session[],
  prefs: Preferences,
): Interval[] {
  const free: Interval[] = []
  let day = startOfDay(from)
  const lastDay = startOfDay(to)

  while (!isAfter(day, lastDay)) {
    const winStart = new Date(day)
    winStart.setHours(prefs.workdayStartHour, 0, 0, 0)
    const winEnd = new Date(day)
    winEnd.setHours(prefs.workdayEndHour, 0, 0, 0)

    // don't schedule in the past
    const effStart = maxDate([winStart, from])
    const effEnd = minDate([winEnd, to])

    if (isBefore(effStart, effEnd)) {
      const window = { start: effStart, end: effEnd }
      const occ = occupiedIn(window, busy, sessions)
      let cursor = window.start
      for (const o of occ) {
        if (isBefore(cursor, o.start)) {
          free.push({ start: cursor, end: o.start })
        }
        cursor = maxDate([cursor, o.end])
      }
      if (isBefore(cursor, window.end)) {
        free.push({ start: cursor, end: window.end })
      }
    }
    day = addDays(day, 1)
  }

  return free.filter(
    (iv) => (iv.end.getTime() - iv.start.getTime()) / 60000 >= MIN_BLOCK_MIN,
  )
}

function maxChunkFor(prefs: Preferences): number {
  return prefs.workingStyle === 'deep' ? 120 : 50
}

/** Find the earliest free slot (within working hours) that fits `durationMin`. */
export function findNextSlot(
  durationMin: number,
  busy: BusyEvent[],
  sessions: Session[],
  prefs: Preferences,
  from: Date = new Date(),
  to?: Date,
): { start: Date; end: Date } | null {
  const horizon = to ?? addDays(from, 14)
  const free = getFreeIntervals(from, horizon, busy, sessions, prefs)
  const slot = free.find(
    (iv) => (iv.end.getTime() - iv.start.getTime()) / 60000 >= durationMin,
  )
  if (!slot) return null
  const start = new Date(slot.start)
  return { start, end: new Date(start.getTime() + durationMin * 60000) }
}

/** Split a task's total effort into coherent session chunks (not fragments). */
function chunkTask(task: Task, prefs: Preferences): { min: number; titles: string[] }[] {
  const maxChunk = maxChunkFor(prefs)
  const subs =
    task.subtasks.length > 0
      ? task.subtasks.map((s) => ({ title: s.title, min: Math.max(5, s.estimateMin) }))
      : [{ title: task.title, min: Math.max(MIN_BLOCK_MIN, task.estimateMin || 30) }]

  const chunks: { min: number; titles: string[] }[] = []
  let cur = { min: 0, titles: [] as string[] }
  for (const s of subs) {
    let remaining = s.min
    let firstPiece = true
    while (remaining > 0) {
      const space = maxChunk - cur.min
      const take = Math.min(remaining, space)
      cur.min += take
      remaining -= take
      if (firstPiece || !cur.titles.includes(s.title)) {
        cur.titles.push(s.title)
        firstPiece = false
      }
      if (cur.min >= maxChunk) {
        chunks.push(cur)
        cur = { min: 0, titles: [] }
      }
    }
  }
  if (cur.min > 0) chunks.push(cur)

  // Merge a tiny trailing chunk into the previous one
  if (chunks.length > 1) {
    const last = chunks[chunks.length - 1]
    if (last.min < MIN_BLOCK_MIN) {
      const prev = chunks[chunks.length - 2]
      prev.min += last.min
      prev.titles.push(...last.titles.filter((t) => !prev.titles.includes(t)))
      chunks.pop()
    }
  }
  return chunks
}

export interface ScheduleResult {
  sessions: Session[]
  unplaced: { taskTitle: string; minutes: number }[]
}

/**
 * Place tasks' work into free time before their deadlines, scheduling AROUND
 * busy commitments and existing sessions. Front-loads (earliest free first).
 */
export function scheduleTasks(
  uid: string,
  tasks: Task[],
  existingSessions: Session[],
  busy: BusyEvent[],
  prefs: Preferences,
  now: Date = new Date(),
): ScheduleResult {
  // round "now" up to the next 5 minutes so blocks look clean
  const start = new Date(now)
  start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0)

  const placed: Session[] = [...existingSessions]
  const created: Session[] = []
  const unplaced: { taskTitle: string; minutes: number }[] = []

  const ordered = [...tasks].sort((a, b) => {
    const da = a.deadline ? new Date(a.deadline).getTime() : Infinity
    const db = b.deadline ? new Date(b.deadline).getTime() : Infinity
    if (da !== db) return da - db
    return b.priority - a.priority
  })

  for (const task of ordered) {
    const deadline = task.deadline
      ? new Date(task.deadline)
      : addDays(start, 7)
    const chunks = chunkTask(task, prefs)

    for (const chunk of chunks) {
      let free = getFreeIntervals(start, deadline, busy, placed, prefs)
      const slot = free.find(
        (iv) => (iv.end.getTime() - iv.start.getTime()) / 60000 >= chunk.min,
      )
      if (!slot) {
        unplaced.push({ taskTitle: task.title, minutes: chunk.min })
        continue
      }
      const sessStart = new Date(slot.start)
      const sessEnd = new Date(sessStart.getTime() + chunk.min * 60000)
      const session: Session = {
        id: newId(),
        uid,
        taskId: task.id,
        taskTitle: task.title,
        subtaskTitles: chunk.titles,
        start: sessStart.toISOString(),
        end: sessEnd.toISOString(),
        status: 'scheduled',
      }
      placed.push(session)
      created.push(session)
    }
  }

  return { sessions: created, unplaced }
}
