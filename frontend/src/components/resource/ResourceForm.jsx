import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Declarative form renderer shared by every module's "create" modal.
// fields: [{ name, label, type, required, options }]
// type: 'text'|'number'|'date'|'select'|'textarea'|'combobox'
//
// 'combobox' is a select that still accepts a typed value - a native input
// backed by a <datalist>, so the browser offers the options while leaving the
// field free text. A plain <select> can't do that, and it's what the Induction
// Call Form's Sales Person / Lead Source / Payment Mode / Category need.
export function ResourceForm({ fields, defaultValues = {}, onSubmit, onCancel, submitLabel = 'Save', submitError }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues })

  // Untouched optional fields submit as "" from the DOM; treat that the same
  // as "not provided" instead of sending an empty string (which fails e.g.
  // EmailStr validation on the backend).
  function handleValidSubmit(values) {
    const cleaned = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ''),
    )
    return onSubmit(cleaned)
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(handleValidSubmit)}>
      <ErrorMessage message={submitError} />
      {fields.map((field) => {
        const validation = { required: field.required ? `${field.label} is required` : false, ...field.validation }

        if (field.type === 'select') {
          return (
            <Select
              key={field.name}
              label={field.label}
              required={Boolean(field.required)}
              error={errors[field.name]?.message}
              {...register(field.name, validation)}
            >
              <option value="">Select {field.label}</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )
        }

        if (field.type === 'combobox') {
          const listId = `${field.name}-options`
          return (
            <div key={field.name}>
              <Input
                list={listId}
                label={field.label}
                placeholder={field.placeholder ?? 'Select or type…'}
                required={Boolean(field.required)}
                error={errors[field.name]?.message}
                autoComplete="off"
                {...register(field.name, validation)}
              />
              <datalist id={listId}>
                {field.options.map((option) => (
                  <option key={option.value ?? option} value={option.value ?? option} />
                ))}
              </datalist>
            </div>
          )
        }

        if (field.type === 'textarea') {
          return (
            <Textarea
              key={field.name}
              label={field.label}
              placeholder={field.placeholder}
              required={Boolean(field.required)}
              error={errors[field.name]?.message}
              {...register(field.name, validation)}
            />
          )
        }

        return (
          <Input
            key={field.name}
            type={field.type ?? 'text'}
            step={field.type === 'number' ? 'any' : undefined}
            label={field.label}
            placeholder={field.placeholder}
            required={Boolean(field.required)}
            error={errors[field.name]?.message}
            {...register(field.name, validation)}
          />
        )
      })}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
