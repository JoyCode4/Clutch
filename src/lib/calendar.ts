import type { Session, Task } from './types'
import { deleteSession } from './db'

const TOKEN_KEY = 'clutch_gcal_token'
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

// localStorage so the token survives refreshes / new tabs (within its ~1h life).
let accessToken: string | null =
  typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null

export function isCalendarConnected(): boolean {
  return !!accessToken
}

export function setAccessToken(t: string | null) {
  accessToken = t
  if (typeof localStorage !== 'undefined') {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  }
}

function describeTodos(s: Session, task?: Task): string {
  if (task && task.subtasks.length > 0) {
    const done = task.subtasks.filter((x) => x.done).length
    const lines = task.subtasks
      .map((x) => `${x.done ? '✅' : '⬜'} ${x.title}`)
      .join('\n')
    return `To-dos: ${done}/${task.subtasks.length} done\n${lines}\n\n— scheduled by Clutch`
  }
  if (s.subtaskTitles.length > 0) {
    return s.subtaskTitles.map((t) => `⬜ ${t}`).join('\n') + '\n\n— scheduled by Clutch'
  }
  return 'Focus block — scheduled by Clutch'
}

function eventBody(s: Session, task?: Task) {
  return {
    summary: `${s.taskTitle} (Clutch)`,
    description: describeTodos(s, task),
    start: { dateTime: s.start },
    end: { dateTime: s.end },
    colorId: s.status === 'done' ? '2' : '5',
  }
}

class TokenExpiredError extends Error {}

async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) {
    setAccessToken(null)
    throw new TokenExpiredError('Calendar session expired')
  }
  if (!res.ok) throw new Error(`Calendar API ${res.status}`)
  return res.status === 204 ? null : res.json()
}

export async function deleteEvent(eventId: string) {
  try {
    await api(`/${eventId}`, 'DELETE')
  } catch {
    /* already gone / token issue — ignore */
  }
}

/** Delete a session everywhere: its Google event (if synced) + Firestore. */
export async function removeSession(uid: string, s: Session) {
  if (accessToken && s.gcalEventId) await deleteEvent(s.gcalEventId)
  await deleteSession(uid, s.id)
}

export interface SyncResult {
  created: number
  updated: number
  needsReconnect: boolean
}

/**
 * Push Clutch's active work blocks to Google Calendar (create new, update
 * existing). Returns gcalEventId updates for the caller to persist.
 */
export async function syncSessionsToGoogle(
  sessions: Session[],
  tasks: Task[],
): Promise<{ result: SyncResult; idUpdates: Record<string, string> }> {
  const idUpdates: Record<string, string> = {}
  const result: SyncResult = { created: 0, updated: 0, needsReconnect: false }
  if (!accessToken) return { result, idUpdates }

  const active = sessions.filter((s) => s.status !== 'missed')
  for (const s of active) {
    const task = tasks.find((t) => t.id === s.taskId)
    try {
      if (s.gcalEventId) {
        await api(`/${s.gcalEventId}`, 'PATCH', eventBody(s, task))
        result.updated++
      } else {
        const data = await api('', 'POST', eventBody(s, task))
        idUpdates[s.id] = data.id as string
        result.created++
      }
    } catch (e) {
      if (e instanceof TokenExpiredError) {
        result.needsReconnect = true
        break
      }
      // skip a single bad event, keep going
    }
  }
  return { result, idUpdates }
}

export interface PullResult {
  updates: { id: string; start: string; end: string }[]
  deletes: string[] // Clutch session ids whose Google event was deleted
}

/**
 * Pull changes made in Google Calendar back into Clutch:
 * - event moved in Google  -> update the session's time
 * - event deleted in Google -> delete the session in Clutch (two-way delete)
 */
export async function pullGoogleChanges(sessions: Session[]): Promise<PullResult> {
  const result: PullResult = { updates: [], deletes: [] }
  if (!accessToken) return result
  const synced = sessions.filter((s) => s.gcalEventId && s.status !== 'missed')
  for (const s of synced) {
    try {
      const res = await fetch(`${API}/${s.gcalEventId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (res.status === 401) {
        setAccessToken(null)
        break
      }
      if (res.status === 404) {
        result.deletes.push(s.id) // deleted in Google
        continue
      }
      if (!res.ok) continue
      const ev = await res.json()
      if (ev.status === 'cancelled') {
        result.deletes.push(s.id)
        continue
      }
      const gStart = ev?.start?.dateTime
      const gEnd = ev?.end?.dateTime
      if (gStart && gEnd) {
        if (Math.abs(new Date(gStart).getTime() - new Date(s.start).getTime()) > 60000) {
          result.updates.push({
            id: s.id,
            start: new Date(gStart).toISOString(),
            end: new Date(gEnd).toISOString(),
          })
        }
      }
    } catch {
      /* ignore per-event errors */
    }
  }
  return result
}
