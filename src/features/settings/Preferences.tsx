import { useState } from 'react'
import { savePreferences } from '../../lib/db'
import type { Preferences, WorkingStyle } from '../../lib/types'

export default function PreferencesModal({
  uid,
  prefs,
  onClose,
}: {
  uid: string
  prefs: Preferences
  onClose: () => void
}) {
  const [local, setLocal] = useState<Preferences>(prefs)

  const save = async () => {
    await savePreferences(uid, local)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">Settings</h2>

        <label className="mb-1 block text-sm text-muted">
          Remind me before a session
        </label>
        <div className="mb-4 flex gap-2">
          {[2, 5, 10, 15].map((m) => (
            <button
              key={m}
              onClick={() => setLocal({ ...local, reminderLeadMin: m })}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                local.reminderLeadMin === m
                  ? 'border-accent bg-accent/20'
                  : 'border-border hover:bg-surface-2'
              }`}
            >
              {m} min
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm text-muted">Working style</label>
        <div className="mb-4 flex gap-2">
          {(
            [
              ['deep', 'Deep sessions'],
              ['chunks', 'Short chunks'],
            ] as [WorkingStyle, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setLocal({ ...local, workingStyle: v })}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-sm ${
                local.workingStyle === v
                  ? 'border-accent bg-accent/20'
                  : 'border-border hover:bg-surface-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="mb-1 block text-sm text-muted">
          Awake / available hours ({local.workdayStartHour}:00 –{' '}
          {local.workdayEndHour}:00)
          <span className="mt-0.5 block text-xs text-muted/70">
            Work is never scheduled outside this — protects your sleep & rest.
          </span>
        </label>
        <div className="mb-6 flex items-center gap-3">
          <input
            type="range"
            min={5}
            max={12}
            value={local.workdayStartHour}
            onChange={(e) =>
              setLocal({ ...local, workdayStartHour: Number(e.target.value) })
            }
            className="flex-1 accent-accent"
          />
          <input
            type="range"
            min={15}
            max={24}
            value={local.workdayEndHour}
            onChange={(e) =>
              setLocal({ ...local, workdayEndHour: Number(e.target.value) })
            }
            className="flex-1 accent-accent"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-white hover:brightness-110"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
