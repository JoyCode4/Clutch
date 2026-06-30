import { useRef, useState } from 'react'
import { addDays, startOfDay, format, isSameDay } from 'date-fns'
import {
  type Task,
  type Session,
  type BusyEvent,
  type Preferences,
  type SessionStatus,
} from '../../lib/types'
import { updateSession } from '../../lib/db'
import { findOverlaps } from '../../agent/conflicts'
import { findNextSlot } from '../../agent/scheduler'
import SessionEditor from './SessionEditor'
import OverlapConfirm from './OverlapConfirm'

const HOUR_PX = 46
const DAYS = 7
const SNAP_MIN = 15

const STATUS_STYLE: Record<SessionStatus, string> = {
  scheduled: 'bg-accent/25 border-accent/60 text-text',
  in_progress: 'bg-warn/30 border-warn text-text ring-1 ring-warn/50',
  done: 'bg-good/20 border-good/60 text-text line-through',
  missed: 'bg-bad/20 border-bad/60 text-text',
}

export default function PlanCalendar({
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
  const [weekOffset, setWeekOffset] = useState(0)
  const [selected, setSelected] = useState<Session | null>(null)
  const [pendingMove, setPendingMove] = useState<{
    sessionId: string
    start: string
    end: string
    titles: string[]
  } | null>(null)
  const dragRef = useRef<{ id: string; grabOffsetY: number } | null>(null)

  const today = startOfDay(new Date())
  const startDay = addDays(today, weekOffset * DAYS)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(startDay, i))

  const { workdayStartHour: ws, workdayEndHour: we } = prefs
  const gridHeight = (we - ws) * HOUR_PX

  const blockStyle = (startISO: string, endISO: string) => {
    const s = new Date(startISO)
    const e = new Date(endISO)
    const top = (s.getHours() + s.getMinutes() / 60 - ws) * HOUR_PX
    const height = Math.max(16, ((e.getTime() - s.getTime()) / 3.6e6) * HOUR_PX)
    return { top: `${top}px`, height: `${height}px` }
  }

  const onDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault()
    const drag = dragRef.current
    if (!drag) return
    const sess = sessions.find((s) => s.id === drag.id)
    if (!sess) return
    const durationMin =
      (new Date(sess.end).getTime() - new Date(sess.start).getTime()) / 60000

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const y = e.clientY - rect.top - drag.grabOffsetY
    let minsFromWs = Math.round((y / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN
    const maxStart = (we - ws) * 60 - durationMin
    minsFromWs = Math.max(0, Math.min(minsFromWs, Math.max(0, maxStart)))

    const base = new Date(day)
    base.setHours(ws, 0, 0, 0)
    const start = new Date(base.getTime() + minsFromWs * 60000)
    const end = new Date(start.getTime() + durationMin * 60000)
    dragRef.current = null

    // Confirm before allowing an overlap (and offer a free-slot alternative).
    const titles = findOverlaps(
      start.toISOString(),
      end.toISOString(),
      sessions,
      busy,
      sess.id,
    )
    if (titles.length > 0) {
      setPendingMove({
        sessionId: sess.id,
        start: start.toISOString(),
        end: end.toISOString(),
        titles,
      })
      return
    }
    commitMove(sess.id, start.toISOString(), end.toISOString())
  }

  const commitMove = (sessionId: string, startISO: string, endISO: string) => {
    const s = sessions.find((x) => x.id === sessionId)
    void updateSession(uid, sessionId, {
      start: startISO,
      end: endISO,
      status: s?.status === 'missed' ? 'scheduled' : s?.status,
      notified: false,
    })
  }

  const moveToFree = () => {
    if (!pendingMove) return
    const s = sessions.find((x) => x.id === pendingMove.sessionId)
    if (!s) return setPendingMove(null)
    const dur =
      (new Date(pendingMove.end).getTime() -
        new Date(pendingMove.start).getTime()) /
      60000
    const slot = findNextSlot(
      dur,
      busy,
      sessions.filter((x) => x.id !== s.id),
      prefs,
      new Date(pendingMove.start),
    )
    if (slot) commitMove(s.id, slot.start.toISOString(), slot.end.toISOString())
    else alert('No free slot found within your working hours.')
    setPendingMove(null)
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your plan</h2>
        <div className="flex items-center gap-2 text-sm text-muted">
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="rounded px-2 text-accent hover:brightness-110"
            >
              today
            </button>
          )}
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="rounded px-2 hover:text-text"
          >
            ‹
          </button>
          <span>
            {format(days[0], 'MMM d')} – {format(days[DAYS - 1], 'MMM d')}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="rounded px-2 hover:text-text"
          >
            ›
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="flex min-w-[680px] gap-1">
          {/* time axis */}
          <div className="w-10 shrink-0">
            <div className="mb-1 h-10" />
            <div className="relative" style={{ height: gridHeight }}>
              {Array.from({ length: we - ws + 1 }, (_, i) => ws + i).map((h) => (
                <div
                  key={h}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-muted"
                  style={{ top: (h - ws) * HOUR_PX }}
                >
                  {h}:00
                </div>
              ))}
            </div>
          </div>

          {/* day columns */}
          <div className="grid flex-1 grid-cols-7 gap-1">
          {days.map((day) => {
            const isToday = isSameDay(day, today)
            const daySessions = sessions.filter((s) =>
              isSameDay(new Date(s.start), day),
            )
            const dayBusy = busy.filter((b) => isSameDay(new Date(b.start), day))
            return (
              <div key={day.toISOString()} className="flex flex-col">
                <div
                  className={`mb-1 text-center text-xs ${
                    isToday ? 'font-semibold text-accent' : 'text-muted'
                  }`}
                >
                  {format(day, 'EEE')}
                  <div className="text-sm">{format(day, 'd')}</div>
                </div>
                <div
                  className="relative rounded-lg border border-border bg-surface-2"
                  style={{ height: gridHeight }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDrop(e, day)}
                >
                  {/* hour lines */}
                  {Array.from({ length: we - ws }, (_, i) => (
                    <div
                      key={i}
                      className="absolute w-full border-t border-border/40"
                      style={{ top: i * HOUR_PX }}
                    />
                  ))}
                  {/* busy commitments */}
                  {dayBusy.map((b) => (
                    <div
                      key={b.id}
                      className="absolute left-0.5 right-0.5 overflow-hidden rounded border border-border bg-border/40 px-1 text-[10px] text-muted"
                      style={blockStyle(b.start, b.end)}
                      title={b.title}
                    >
                      {b.title}
                    </div>
                  ))}
                  {/* work sessions */}
                  {daySessions.map((s) => {
                    const dim = selectedTaskId && s.taskId !== selectedTaskId
                    const sel = selectedTaskId === s.taskId
                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={(e) => {
                          dragRef.current = {
                            id: s.id,
                            grabOffsetY: e.nativeEvent.offsetY,
                          }
                        }}
                        onClick={() => {
                          onSelectTask(s.taskId)
                          setSelected(s)
                        }}
                        className={`absolute left-0.5 right-0.5 cursor-grab overflow-hidden rounded border px-1 text-[10px] transition hover:brightness-125 active:cursor-grabbing ${
                          STATUS_STYLE[s.status]
                        } ${sel ? 'z-10 ring-2 ring-accent' : ''} ${
                          dim ? 'opacity-30' : ''
                        }`}
                        style={blockStyle(s.start, s.end)}
                        title={`${s.taskTitle}\n${s.subtaskTitles.join(
                          ', ',
                        )}\n(drag to move · click to edit)`}
                      >
                        <div className="font-medium">
                          {format(new Date(s.start), 'HH:mm')} {s.taskTitle}
                        </div>
                        {s.subtaskTitles.slice(0, 2).map((t) => (
                          <div key={t} className="truncate opacity-80">
                            • {t}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-accent/60" />scheduled</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-warn" />in progress</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-good/60" />done</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-bad/60" />missed</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded bg-border" />commitment</span>
        <span className="ml-auto italic">drag a block to move · click to edit</span>
      </div>

      {selected && (
        <SessionEditor
          uid={uid}
          session={selected}
          task={tasks.find((t) => t.id === selected.taskId) ?? null}
          allSessions={sessions}
          busy={busy}
          prefs={prefs}
          onClose={() => setSelected(null)}
        />
      )}

      {pendingMove && (
        <OverlapConfirm
          titles={pendingMove.titles}
          canMoveFree
          onMoveFree={moveToFree}
          onKeepAnyway={() => {
            commitMove(pendingMove.sessionId, pendingMove.start, pendingMove.end)
            setPendingMove(null)
          }}
          onCancel={() => setPendingMove(null)}
        />
      )}
    </section>
  )
}
