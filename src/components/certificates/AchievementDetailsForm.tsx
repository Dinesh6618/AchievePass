import { CheckCircle2 } from 'lucide-react'
import { SelectField, TextAreaField, TextField } from '@/components/ui'
import { todayISO } from '@/lib/dates'
import type { EventCategory } from '@/types'
import type { AchievementFormErrors, AchievementFormState } from './achievementForm'

interface Props {
  value: AchievementFormState
  errors: AchievementFormErrors
  categories: EventCategory[]
  /** fields currently holding a value read from the certificate (shown with a tick) */
  fromScan?: Set<keyof AchievementFormState>
  onChange: (patch: Partial<AchievementFormState>) => void
}

const ReadTick = () => (
  <span className="ml-1.5 inline-flex items-center gap-0.5 text-[11px] font-medium text-verified-700">
    <CheckCircle2 className="size-3" aria-hidden /> read from certificate
  </span>
)

export function AchievementDetailsForm({ value, errors, categories, fromScan, onChange }: Props) {
  const mark = (key: keyof AchievementFormState, label: string) => (fromScan?.has(key) ? <>{label}<ReadTick /></> : label)
  const today = todayISO()

  return (
    <div className="space-y-5">
      <TextField
        label={mark('eventName', 'Event name')}
        required
        value={value.eventName}
        onChange={(e) => onChange({ eventName: e.target.value })}
        error={errors.eventName}
        maxLength={200}
        placeholder="e.g. VMEDITHON V3.0"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={mark('categoryId', 'Event type')}
          required
          value={value.categoryId}
          onChange={(e) => onChange({ categoryId: e.target.value })}
          error={errors.categoryId}
        >
          <option value="">Select…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <TextField
          label={mark('organization', 'Organization')}
          value={value.organization}
          onChange={(e) => onChange({ organization: e.target.value })}
          error={errors.organization}
          hint="Who organised or issued it"
          maxLength={200}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label={mark('startDate', 'Start date')}
          type="date"
          required
          max={today}
          value={value.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
          error={errors.startDate}
        />
        <TextField
          label={mark('endDate', 'End date')}
          type="date"
          min={value.startDate || undefined}
          value={value.endDate}
          onChange={(e) => onChange({ endDate: e.target.value })}
          error={errors.endDate}
          hint="Only for multi-day events"
        />
      </div>

      <TextField
        label={mark('result', 'Achievement / result')}
        value={value.result}
        onChange={(e) => onChange({ result: e.target.value })}
        error={errors.result}
        hint="e.g. Finalist, First Prize, Participant"
        maxLength={200}
      />

      <TextAreaField
        label="Description"
        value={value.description}
        onChange={(e) => onChange({ description: e.target.value })}
        error={errors.description}
        rows={4}
        maxLength={2000}
        hint="Optional — what you built, learned or presented."
      />
    </div>
  )
}
