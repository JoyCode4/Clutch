import { useEffect, useRef, useState } from 'react'
import { sendChat } from '../../agent/chatAgent'
import { hasApiKey, llmLabel } from '../../agent/provider'
import type {
  Preferences,
  BusyEvent,
  Session,
  Task,
  ChatMessage,
} from '../../lib/types'

interface Props {
  uid: string
  prefs: Preferences
  busy: BusyEvent[]
  sessions: Session[]
  tasks: Task[]
  messages: ChatMessage[]
}

const SUGGESTIONS = [
  'Chem exam Friday, rent due the 30th, project demo Monday',
  'Draft an email to my professor asking for an extension',
  'Move my project block to Saturday morning',
  'What do I have due this week?',
]

export default function ChatPanel({
  uid,
  prefs,
  busy,
  sessions,
  tasks,
  messages,
}: Props) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const pending = messages.length > 0 && messages[messages.length - 1].pending

  const send = async (v: string) => {
    const msg = v.trim()
    if (!msg || pending) return
    setText('')
    await sendChat({ uid, text: msg, prefs, busy, sessions, tasks, history: messages })
  }

  const toggleVoice = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return alert('Voice input needs Chrome.')
    if (listening) return recogRef.current?.stop()
    const recog = new SR()
    recog.lang = 'en-US'
    recog.interimResults = true
    let final = text ? text + ' ' : ''
    recog.onresult = (e: { results: SpeechRecognitionResultList }) => {
      let interim = ''
      for (let i = e.results.length - 1; i >= 0; i--) {
        const r = e.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim = r[0].transcript
      }
      setText((final + interim).trim())
    }
    recog.onend = () => setListening(false)
    recog.onerror = () => setListening(false)
    recogRef.current = recog
    recog.start()
    setListening(true)
  }

  return (
    <section className="flex h-[640px] flex-col rounded-2xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h2 className="font-semibold">Chat with Clutch</h2>
        </div>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
          🧠 {llmLabel}
        </span>
      </div>

      {!hasApiKey && (
        <div className="m-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-sm text-bad">
          No LLM API key — set <code>VITE_LLM_PROVIDER</code> and{' '}
          <code>VITE_LLM_API_KEY</code> in <code>.env</code>, then restart.
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted">
              Tell me your deadlines, ask me to plan, draft an email, or move
              things around. I’ll handle your tasks and calendar.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-text"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === 'user'
                  ? 'bg-accent text-white'
                  : 'border border-border bg-surface-2 text-text'
              }`}
            >
              {m.actions && m.actions.length > 0 && (
                <div className="mb-1 flex flex-col gap-1">
                  {m.actions.map((a, i) => (
                    <span key={i} className="text-xs text-accent">
                      ⚡ {a}
                    </span>
                  ))}
                </div>
              )}
              {m.pending && !m.text ? (
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
                  thinking…
                </span>
              ) : (
                <span className="whitespace-pre-wrap">{m.text}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(text)
              }
            }}
            rows={1}
            placeholder="Message Clutch…  (Enter to send)"
            className="max-h-32 flex-1 resize-none rounded-xl border border-border bg-surface-2 p-2.5 text-sm focus:border-accent focus:outline-none"
          />
          <button
            onClick={toggleVoice}
            title="Voice"
            className={`rounded-lg p-2.5 ${
              listening ? 'animate-pulse bg-bad/20 text-bad' : 'text-muted hover:text-text'
            }`}
          >
            🎙️
          </button>
          <button
            onClick={() => void send(text)}
            disabled={pending || !text.trim()}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
          >
            {pending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </section>
  )
}
