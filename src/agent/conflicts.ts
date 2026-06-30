import type { Session, BusyEvent } from '../lib/types'

export interface Conflict {
  a: Session
  bSession?: Session
  bBusy?: BusyEvent
}

const overlaps = (s1: string, e1: string, s2: string, e2: string) =>
  new Date(s1) < new Date(e2) && new Date(s2) < new Date(e1)

const active = (s: Session) => s.status === 'scheduled' || s.status === 'in_progress'

/** Titles of active sessions / commitments that a proposed time would overlap. */
export function findOverlaps(
  startISO: string,
  endISO: string,
  sessions: Session[],
  busy: BusyEvent[],
  excludeId?: string,
): string[] {
  const titles: string[] = []
  for (const s of sessions) {
    if (s.id === excludeId || !active(s)) continue
    if (overlaps(startISO, endISO, s.start, s.end)) titles.push(s.taskTitle)
  }
  for (const b of busy) {
    if (overlaps(startISO, endISO, b.start, b.end)) titles.push(b.title)
  }
  return titles
}

/**
 * Detect overlapping work sessions (and sessions colliding with fixed
 * commitments). Returns one conflict per overlapping pair, de-duplicated.
 */
export function detectConflicts(
  sessions: Session[],
  busy: BusyEvent[],
): Conflict[] {
  const conflicts: Conflict[] = []
  const act = sessions.filter(active)
  const seen = new Set<string>()

  for (let i = 0; i < act.length; i++) {
    for (let j = i + 1; j < act.length; j++) {
      const a = act[i]
      const b = act[j]
      if (overlaps(a.start, a.end, b.start, b.end)) {
        const key = [a.id, b.id].sort().join('|')
        if (!seen.has(key)) {
          seen.add(key)
          conflicts.push({ a, bSession: b })
        }
      }
    }
    // session vs fixed commitment
    for (const ev of busy) {
      if (overlaps(act[i].start, act[i].end, ev.start, ev.end)) {
        const key = `${act[i].id}|busy:${ev.id}`
        if (!seen.has(key)) {
          seen.add(key)
          conflicts.push({ a: act[i], bBusy: ev })
        }
      }
    }
  }
  return conflicts
}
