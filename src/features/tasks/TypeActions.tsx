import type { Task } from '../../lib/types'

/**
 * Type-aware quick actions (Phase 2A foundation). Deep-links only — no OAuth,
 * no credentials. Chips appear based on task type; the user taps or ignores.
 */
export default function TypeActions({ task }: { task: Task }) {
  const chips: { label: string; href?: string; onClick?: () => void }[] = []
  const m = task.meta ?? {}

  if (task.type === 'email') {
    const url = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      m.emailTo ?? '',
    )}&su=${encodeURIComponent(m.subject ?? task.title)}&body=${encodeURIComponent(
      task.description ?? '',
    )}`
    chips.push({
      label: task.description ? '✉️ Open drafted email' : '✉️ Compose email',
      href: url,
    })
  }
  if (task.type === 'call' && m.phone) {
    chips.push({ label: `📞 Call ${m.phone}`, href: `tel:${m.phone}` })
  }
  if (task.type === 'bill' && m.payLink) {
    chips.push({
      label: m.amount ? `💳 Pay ${m.amount}` : '💳 Pay',
      href: m.payLink,
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((c) => (
        <a
          key={c.label}
          href={c.href}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-text hover:bg-accent/20"
        >
          {c.label}
        </a>
      ))}
    </div>
  )
}
