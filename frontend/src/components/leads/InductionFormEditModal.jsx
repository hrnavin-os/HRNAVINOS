import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { inductionFormConfigService } from '@/services/inductionFormConfigService'
import { getApiErrorMessage } from '@/services/apiClient'

// Stored on every entry and non-nullable, so the form can't stop asking for
// them. The server enforces this too - this only stops you trying.
const ALWAYS_REQUIRED = new Set(['name', 'phone', 'registration_date'])

function FieldRow({ field, index, total, onChange, onMove }) {
  const locked = ALWAYS_REQUIRED.has(field.key)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-slate-300" strokeWidth={2} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Input
            label="Label"
            value={field.label}
            onChange={(event) => onChange({ ...field, label: event.target.value })}
          />
          {/* The key is what the submit endpoint parses, so it's shown for
              orientation but never editable - renaming it would break the form. */}
          <p className="mt-1 text-[11px] text-slate-400">
            Field key: <code className="rounded bg-slate-100 px-1 py-0.5">{field.key}</code>
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index === 0}
            aria-label="Move up"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
          >
            <ChevronUp className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index === total - 1}
            aria-label="Move down"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
          >
            <ChevronDown className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>

      <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={field.required}
          disabled={locked}
          onChange={(event) => onChange({ ...field, required: event.target.checked })}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
        />
        Required
        {locked && <span className="text-xs text-slate-400">— always required</span>}
      </label>

      {/* Only the dropdown fields carry options; the plain text and date ones
          have none and don't grow a box for them. */}
      {field.options.length > 0 || field.hasOptions ? (
        <div className="mt-2">
          <Textarea
            label="Dropdown options (one per line)"
            rows={Math.min(Math.max(field.options.length, 3), 10)}
            value={field.options.join('\n')}
            onChange={(event) => onChange({ ...field, options: event.target.value.split('\n') })}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Suggestions only — the form still accepts a typed value that isn&rsquo;t listed.
          </p>
        </div>
      ) : null}
    </div>
  )
}

export function InductionFormEditModal({ onClose }) {
  const queryClient = useQueryClient()
  const [fields, setFields] = useState(null)

  const { isLoading, error } = useQuery({
    queryKey: ['induction-form-config'],
    queryFn: async () => {
      const config = await inductionFormConfigService.get()
      // Seeded into local state once, so edits don't fight the cache on every
      // keystroke; `hasOptions` remembers which fields own a dropdown even
      // after someone empties the list.
      setFields(config.fields.map((field) => ({ ...field, hasOptions: field.options.length > 0 })))
      return config
    },
  })

  const mutation = useMutation({
    mutationFn: () =>
      inductionFormConfigService.update({
        fields: fields.map(({ hasOptions: _ignored, ...field }, index) => ({ ...field, order: index })),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['induction-form-config'], updated)
      queryClient.invalidateQueries({ queryKey: ['induction-form-public-config'] })
      onClose()
    },
  })

  function updateField(index, next) {
    setFields((current) => current.map((field, i) => (i === index ? next : field)))
  }

  function moveField(index, delta) {
    setFields((current) => {
      const target = index + delta
      if (target < 0 || target >= current.length) return current
      const copy = [...current]
      ;[copy[index], copy[target]] = [copy[target], copy[index]]
      return copy
    })
  }

  return (
    <Modal title="Edit Induction Call Form" isOpen onClose={onClose} maxWidth="max-w-2xl">
      {isLoading || !fields ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-3">
          <ErrorMessage
            message={
              error
                ? getApiErrorMessage(error)
                : mutation.error
                  ? getApiErrorMessage(mutation.error)
                  : null
            }
          />
          <p className="text-sm text-slate-500">
            Rename questions, reorder them, and maintain the dropdown lists. Fields can&rsquo;t be added or removed
            here — the form has to keep matching what an entry stores.
          </p>

          {fields.map((field, index) => (
            <FieldRow
              key={field.key}
              field={field}
              index={index}
              total={fields.length}
              onChange={(next) => updateField(index, next)}
              onMove={moveField}
            />
          ))}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
