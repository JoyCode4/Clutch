import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import {
  type Task,
  type Session,
  type BusyEvent,
  type AgentRun,
  type AgentStep,
  type RecoveryProposal,
  type Preferences,
  type ChatMessage,
  DEFAULT_PREFS,
} from './types'

// ---- path helpers ----
const tasksCol = (uid: string) => collection(db, 'users', uid, 'tasks')
const sessionsCol = (uid: string) => collection(db, 'users', uid, 'sessions')
const busyCol = (uid: string) => collection(db, 'users', uid, 'busy')
const runsCol = (uid: string) => collection(db, 'users', uid, 'agentRuns')
const stepsCol = (uid: string, runId: string) =>
  collection(db, 'users', uid, 'agentRuns', runId, 'steps')
const recoveryCol = (uid: string) => collection(db, 'users', uid, 'recovery')
const prefsDoc = (uid: string) => doc(db, 'users', uid, 'meta', 'preferences')
const chatCol = (uid: string) => collection(db, 'users', uid, 'chat')

export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Make a title unique against existing titles by appending " (2)", " (3)", … */
export function uniqueTitle(desired: string, existing: string[]): string {
  const taken = new Set(existing)
  if (!taken.has(desired)) return desired
  let n = 2
  while (taken.has(`${desired} (${n})`)) n++
  return `${desired} (${n})`
}

// Firestore rejects `undefined`. Strip undefined keys before writing.
function clean<T>(obj: T): T {
  const out = { ...(obj as Record<string, unknown>) }
  Object.keys(out).forEach((k) => out[k] === undefined && delete out[k])
  return out as T
}

// ==========================================
// ====== LOCAL STORAGE MOCK SYSTEM ======
// ==========================================

const listenersMap = new Map<string, Set<() => void>>()

function subscribe(key: string, callback: () => void): Unsubscribe {
  if (!listenersMap.has(key)) {
    listenersMap.set(key, new Set())
  }
  listenersMap.get(key)!.add(callback)
  
  // Trigger initial callback
  callback()
  
  return () => {
    listenersMap.get(key)?.delete(callback)
  }
}

function publish(key: string) {
  const callbacks = listenersMap.get(key)
  if (callbacks) {
    callbacks.forEach((cb) => cb())
  }
}

// Seeding implementation for offline / demo mode:
function getSeededData(uid: string, collectionName: string): any[] {
  const now = new Date()
  if (collectionName === 'tasks') {
    return [
      {
        id: 'task_1',
        uid,
        title: 'Complete Hackathon Pitch Deck',
        durationMin: 120,
        urgency: 'high',
        status: 'in_progress',
        subtasks: [
          { title: 'Problem definition', done: true },
          { title: 'Market slide', done: true },
          { title: 'Clutch Architecture Diagram', done: false },
          { title: 'Financial projection / ROI slide', done: false }
        ],
        createdAt: new Date(Date.now() - 86400000).toISOString()
      },
      {
        id: 'task_2',
        uid,
        title: 'Integrate Gemini Reasoning API',
        durationMin: 90,
        urgency: 'medium',
        status: 'done',
        subtasks: [
          { title: 'Configure system prompt templates', done: true },
          { title: 'Define output tool schemata', done: true }
        ],
        createdAt: new Date(Date.now() - 172800000).toISOString()
      },
      {
        id: 'task_3',
        uid,
        title: 'Write automated test suites for scheduler',
        durationMin: 60,
        urgency: 'high',
        status: 'in_progress',
        subtasks: [
          { title: 'Test overlaps and conflicts resolution', done: false },
          { title: 'Verify task completion propagation to sessions', done: false }
        ],
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
      },
      {
        id: 'task_4',
        uid,
        title: 'Gym Session',
        durationMin: 45,
        urgency: 'low',
        status: 'scheduled',
        subtasks: [],
        createdAt: new Date().toISOString()
      },
      {
        id: 'task_5',
        uid,
        title: 'Review pitch script and flow',
        durationMin: 30,
        urgency: 'high',
        status: 'scheduled',
        subtasks: [],
        createdAt: new Date().toISOString()
      }
    ];
  }
  
  if (collectionName === 'busy') {
    const event1Start = new Date(now)
    event1Start.setHours(10, 0, 0, 0)
    const event1End = new Date(now)
    event1End.setHours(11, 30, 0, 0)

    const event2Start = new Date(now)
    event2Start.setHours(14, 0, 0, 0)
    const event2End = new Date(now)
    event2End.setHours(15, 0, 0, 0)

    return [
      {
        id: 'busy_1',
        uid,
        title: '🔥 Clutch Mentorship Call',
        start: event1Start.toISOString(),
        end: event1End.toISOString(),
        isGoogle: false
      },
      {
        id: 'busy_2',
        uid,
        title: '💼 Standup Sync & Live QA',
        start: event2Start.toISOString(),
        end: event2End.toISOString(),
        isGoogle: false
      }
    ];
  }

  if (collectionName === 'sessions') {
    const s1Start = new Date(now)
    s1Start.setHours(11, 30, 0, 0)
    const s1End = new Date(now)
    s1End.setHours(13, 30, 0, 0)

    const s2Start = new Date(now)
    s2Start.setHours(15, 30, 0, 0)
    const s2End = new Date(now)
    s2End.setHours(17, 0, 0, 0)

    return [
      {
        id: 'sess_1',
        uid,
        taskId: 'task_1',
        taskTitle: 'Complete Hackathon Pitch Deck',
        subtaskTitles: ['Clutch Architecture Diagram'],
        start: s1Start.toISOString(),
        end: s1End.toISOString(),
        status: 'scheduled'
      },
      {
        id: 'sess_2',
        uid,
        taskId: 'task_3',
        taskTitle: 'Write automated test suites for scheduler',
        subtaskTitles: ['Test overlaps and conflicts resolution'],
        start: s2Start.toISOString(),
        end: s2End.toISOString(),
        status: 'scheduled'
      }
    ];
  }

  if (collectionName === 'chat') {
    return [
      {
        id: 'chat_1',
        uid,
        sender: 'assistant',
        text: 'Hey! I am Clutch, your intelligent calendar copilot. ⚡\n\nI noticed you have a mentoring session at 10:00 AM and a Standup Sync at 2:00 PM today. I have scheduled "Complete Hackathon Pitch Deck" right after your mentorship session. How does that look?',
        createdAt: new Date(Date.now() - 60000 * 5).toISOString()
      },
      {
        id: 'chat_2',
        uid,
        sender: 'user',
        text: 'That looks perfect, thank you! Can we also write some scheduler test suites today?',
        createdAt: new Date(Date.now() - 60000 * 4).toISOString()
      },
      {
        id: 'chat_3',
        uid,
        sender: 'assistant',
        text: 'Absolutely. I slotted "Write automated test suites for scheduler" for 3:30 PM today, right after your Standup Sync. This is set to take 60 minutes. You got this!',
        createdAt: new Date(Date.now() - 60000 * 3).toISOString()
      }
    ];
  }

  return []
}

function getLocalData(uid: string, collectionName: string): any[] {
  const key = `clutch:${uid}:${collectionName}`
  const raw = localStorage.getItem(key)
  if (raw) {
    try {
      return JSON.parse(raw)
    } catch {
      // Fall through
    }
  }

  if (uid.startsWith('demo-')) {
    const seeded = getSeededData(uid, collectionName)
    if (seeded.length > 0) {
      localStorage.setItem(key, JSON.stringify(seeded))
      return seeded
    }
  }

  return []
}

function setLocalData(uid: string, collectionName: string, data: any[]) {
  const key = `clutch:${uid}:${collectionName}`
  localStorage.setItem(key, JSON.stringify(data))
  publish(`${uid}:${collectionName}`)
}

function getLocalDoc(uid: string, collectionName: string, id: string): any {
  const items = getLocalData(uid, collectionName)
  return items.find((item) => item.id === id) || null
}

function saveLocalDoc(uid: string, collectionName: string, docData: any) {
  const items = getLocalData(uid, collectionName)
  const idx = items.findIndex((item) => item.id === docData.id)
  if (idx > -1) {
    items[idx] = docData
  } else {
    items.push(docData)
  }
  setLocalData(uid, collectionName, items)
}

function updateLocalDoc(uid: string, collectionName: string, id: string, patch: any) {
  const items = getLocalData(uid, collectionName)
  const idx = items.findIndex((item) => item.id === id)
  if (idx > -1) {
    items[idx] = { ...items[idx], ...patch }
    setLocalData(uid, collectionName, items)
  }
}

function deleteLocalDoc(uid: string, collectionName: string, id: string) {
  const items = getLocalData(uid, collectionName)
  const filtered = items.filter((item) => item.id !== id)
  setLocalData(uid, collectionName, filtered)
}

function getLocalPreferences(uid: string): Preferences {
  const key = `clutch:${uid}:preferences`
  const raw = localStorage.getItem(key)
  if (!raw) return DEFAULT_PREFS
  try {
    return JSON.parse(raw)
  } catch {
    return DEFAULT_PREFS
  }
}

function saveLocalPreferences(uid: string, prefs: Preferences) {
  const key = `clutch:${uid}:preferences`
  localStorage.setItem(key, JSON.stringify(prefs))
  publish(`${uid}:preferences`)
}


// ==========================================
// ====== DATABASE API METHODS ==============
// ==========================================

// ---- Tasks ----
export function subscribeTasks(uid: string, cb: (t: Task[]) => void): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:tasks`, () => {
      cb(getLocalData(uid, 'tasks'))
    })
  }
  return onSnapshot(tasksCol(uid), (snap) => {
    cb(snap.docs.map((d) => d.data() as Task))
  })
}

export async function saveTask(task: Task) {
  if (task.uid?.startsWith('demo-')) {
    saveLocalDoc(task.uid, 'tasks', clean(task))
    return
  }
  await setDoc(doc(tasksCol(task.uid), task.id), clean(task))
}

export async function updateTask(uid: string, id: string, patch: Partial<Task>) {
  if (uid.startsWith('demo-')) {
    updateLocalDoc(uid, 'tasks', id, patch)
    return
  }
  await updateDoc(doc(tasksCol(uid), id), patch)
}

export async function deleteTask(uid: string, id: string) {
  if (uid.startsWith('demo-')) {
    deleteLocalDoc(uid, 'tasks', id)
    return
  }
  await deleteDoc(doc(tasksCol(uid), id))
}

// ---- Sessions (scheduled work blocks) ----
export function subscribeSessions(
  uid: string,
  cb: (s: Session[]) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:sessions`, () => {
      cb(getLocalData(uid, 'sessions'))
    })
  }
  return onSnapshot(sessionsCol(uid), (snap) => {
    cb(snap.docs.map((d) => d.data() as Session))
  })
}

export async function saveSession(s: Session) {
  if (s.uid?.startsWith('demo-')) {
    saveLocalDoc(s.uid, 'sessions', clean(s))
    return
  }
  await setDoc(doc(sessionsCol(s.uid), s.id), clean(s))
}

export async function updateSession(
  uid: string,
  id: string,
  patch: Partial<Session>,
) {
  if (uid.startsWith('demo-')) {
    updateLocalDoc(uid, 'sessions', id, patch)
    return
  }
  await updateDoc(doc(sessionsCol(uid), id), patch)
}

export async function deleteSession(uid: string, id: string) {
  if (uid.startsWith('demo-')) {
    deleteLocalDoc(uid, 'sessions', id)
    return
  }
  await deleteDoc(doc(sessionsCol(uid), id))
}

// ---- Busy events (fixed commitments to schedule around) ----
export function subscribeBusy(
  uid: string,
  cb: (b: BusyEvent[]) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:busy`, () => {
      cb(getLocalData(uid, 'busy'))
    })
  }
  return onSnapshot(busyCol(uid), (snap) => {
    cb(snap.docs.map((d) => d.data() as BusyEvent))
  })
}

export async function saveBusy(b: BusyEvent) {
  if (b.uid?.startsWith('demo-')) {
    saveLocalDoc(b.uid, 'busy', clean(b))
    return
  }
  await setDoc(doc(busyCol(b.uid), b.id), b)
}

export async function updateBusy(uid: string, id: string, patch: Partial<BusyEvent>) {
  if (uid.startsWith('demo-')) {
    updateLocalDoc(uid, 'busy', id, patch)
    return
  }
  await updateDoc(doc(busyCol(uid), id), patch)
}

export async function deleteBusy(uid: string, id: string) {
  if (uid.startsWith('demo-')) {
    deleteLocalDoc(uid, 'busy', id)
    return
  }
  await deleteDoc(doc(busyCol(uid), id))
}

// ---- Agent runs + steps (the live activity feed) ----
export async function createRun(run: AgentRun) {
  if (run.uid?.startsWith('demo-')) {
    saveLocalDoc(run.uid, 'agentRuns', clean(run))
    return
  }
  await setDoc(doc(runsCol(run.uid), run.id), run)
}

export async function updateRun(
  uid: string,
  id: string,
  patch: Partial<AgentRun>,
) {
  if (uid.startsWith('demo-')) {
    updateLocalDoc(uid, 'agentRuns', id, patch)
    return
  }
  await updateDoc(doc(runsCol(uid), id), patch)
}

export function subscribeRun(
  uid: string,
  runId: string,
  cb: (r: AgentRun | null) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:agentRuns`, () => {
      cb(getLocalDoc(uid, 'agentRuns', runId) as AgentRun | null)
    })
  }
  return onSnapshot(doc(runsCol(uid), runId), (snap) => {
    cb(snap.exists() ? (snap.data() as AgentRun) : null)
  })
}

export async function addStep(uid: string, runId: string, step: AgentStep) {
  if (uid.startsWith('demo-')) {
    saveLocalDoc(uid, `steps:${runId}`, clean(step))
    return
  }
  await setDoc(doc(stepsCol(uid, runId), step.id), clean(step))
}

export function subscribeSteps(
  uid: string,
  runId: string,
  cb: (s: AgentStep[]) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:steps:${runId}`, () => {
      const steps = getLocalData(uid, `steps:${runId}`)
      steps.sort((a, b) => (a.order || 0) - (b.order || 0))
      cb(steps)
    })
  }
  return onSnapshot(query(stepsCol(uid, runId), orderBy('order')), (snap) => {
    cb(snap.docs.map((d) => d.data() as AgentStep))
  })
}

// ---- Recovery proposals ----
export function subscribeRecovery(
  uid: string,
  cb: (r: RecoveryProposal[]) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:recovery`, () => {
      cb(getLocalData(uid, 'recovery'))
    })
  }
  return onSnapshot(recoveryCol(uid), (snap) => {
    cb(snap.docs.map((d) => d.data() as RecoveryProposal))
  })
}

export async function saveRecovery(r: RecoveryProposal) {
  if (r.uid?.startsWith('demo-')) {
    saveLocalDoc(r.uid, 'recovery', clean(r))
    return
  }
  await setDoc(doc(recoveryCol(r.uid), r.id), r)
}

export async function deleteRecovery(uid: string, id: string) {
  if (uid.startsWith('demo-')) {
    deleteLocalDoc(uid, 'recovery', id)
    return
  }
  await deleteDoc(doc(recoveryCol(uid), id))
}

// ---- Chat ----
export function subscribeChat(
  uid: string,
  cb: (m: ChatMessage[]) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:chat`, () => {
      cb(getLocalData(uid, 'chat'))
    })
  }
  return onSnapshot(query(chatCol(uid), orderBy('createdAt')), (snap) => {
    cb(snap.docs.map((d) => d.data() as ChatMessage))
  })
}

export async function addChatMessage(uid: string, m: ChatMessage) {
  if (uid.startsWith('demo-')) {
    saveLocalDoc(uid, 'chat', clean(m))
    return
  }
  await setDoc(doc(chatCol(uid), m.id), clean(m))
}

export async function updateChatMessage(
  uid: string,
  id: string,
  patch: Partial<ChatMessage>,
) {
  if (uid.startsWith('demo-')) {
    updateLocalDoc(uid, 'chat', id, patch)
    return
  }
  await updateDoc(doc(chatCol(uid), id), patch)
}

// ---- Preferences ----
export function subscribePreferences(
  uid: string,
  cb: (p: Preferences) => void,
): Unsubscribe {
  if (uid.startsWith('demo-')) {
    return subscribe(`${uid}:preferences`, () => {
      cb(getLocalPreferences(uid))
    })
  }
  return onSnapshot(prefsDoc(uid), (snap) => {
    cb(snap.exists() ? (snap.data() as Preferences) : DEFAULT_PREFS)
  })
}

export async function savePreferences(uid: string, p: Preferences) {
  if (uid.startsWith('demo-')) {
    saveLocalPreferences(uid, p)
    return
  }
  await setDoc(prefsDoc(uid), p)
}

export async function getPreferences(uid: string): Promise<Preferences> {
  if (uid.startsWith('demo-')) {
    return getLocalPreferences(uid)
  }
  const snap = await getDoc(prefsDoc(uid))
  return snap.exists() ? (snap.data() as Preferences) : DEFAULT_PREFS
}
