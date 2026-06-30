// ---- Domain model for Clutch (the Panic -> Plan agent) ----

export type TaskType =
  | 'general'
  | 'meeting'
  | 'bill'
  | 'interview'
  | 'call'
  | 'email'

export type TaskStatus = 'todo' | 'in_progress' | 'done'

export interface Subtask {
  id: string
  title: string
  estimateMin: number
  order: number
  done: boolean
}

export interface Task {
  id: string
  uid: string
  title: string
  notes?: string
  description?: string // free notes / agent-drafted email body the user can refer to
  type: TaskType
  deadline: string | null // ISO string
  status: TaskStatus
  priority: number // 0..100, higher = more urgent/important
  estimateMin: number // total effort
  subtasks: Subtask[]
  source: 'braindump' | 'manual'
  createdAt: number
  // Habit / recurring (Goal & habit tracking)
  recurrence?: 'daily' | 'weekdays' | 'weekends' | null
  recurTime?: string // "HH:mm" preferred time for the daily block
  recurDurationMin?: number
  // Type-specific helper data (Phase 2A)
  meta?: {
    amount?: string
    payLink?: string
    phone?: string
    emailTo?: string
    subject?: string
    agenda?: string
    faqs?: string[]
  }
}

export type SessionStatus = 'scheduled' | 'in_progress' | 'done' | 'missed'

// A scheduled work block on the in-app calendar (coarse: a "session", not a fragment)
export interface Session {
  id: string
  uid: string
  taskId: string
  taskTitle: string
  subtaskTitles: string[] // checklist shown inside the block
  start: string // ISO
  end: string // ISO
  status: SessionStatus
  notified?: boolean
  gcalEventId?: string // id of the mirrored Google Calendar event (if synced)
}

// A fixed existing commitment the agent must schedule AROUND (class, work, gym...)
export interface BusyEvent {
  id: string
  uid: string
  title: string
  start: string // ISO
  end: string // ISO
}

export type StepType =
  | 'thought'
  | 'tool_call'
  | 'tool_result'
  | 'question'
  | 'message'

export interface AgentStep {
  id: string
  order: number
  type: StepType
  text: string
  tool?: string
  createdAt: number
}

export type RunStatus = 'running' | 'awaiting_input' | 'done' | 'error'

export interface AgentRun {
  id: string
  uid: string
  input: string
  status: RunStatus
  question?: string // clarification shown to user
  questionOptions?: string[]
  summary?: string
  createdAt: number
}

export interface RecoveryOption {
  label: string
  start: string // ISO
  end: string // ISO
  note: string
  recommended?: boolean
}

export interface RecoveryProposal {
  id: string
  uid: string
  sessionId: string
  taskTitle: string
  options: RecoveryOption[]
  createdAt: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  actions?: string[] // labels of operations the agent performed this turn
  pending?: boolean // assistant is still thinking
  createdAt: number
}

export type WorkingStyle = 'deep' | 'chunks'

export interface Preferences {
  reminderLeadMin: number // 2 | 5 | 10 | 15
  workingStyle: WorkingStyle
  workdayStartHour: number // e.g. 9
  workdayEndHour: number // e.g. 22
}

export const DEFAULT_PREFS: Preferences = {
  reminderLeadMin: 10,
  workingStyle: 'deep',
  workdayStartHour: 9,
  workdayEndHour: 22,
}
