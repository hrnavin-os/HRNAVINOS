import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'

// Declarative form renderer shared by every module's "create" modal.
// fields: [{ name, label, type: 'text'|'number'|'date'|'select'|'textarea', required, options }]
export function ResourceForm({ fields, defaultValues = {}, onSubmit, onCancel, submitLabel = 'Save', submitError }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues })

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <ErrorMessage message={submitError} />
      {fields.map((field) => {
        const validation = { required: field.required ? `${field.label} is required` : false, ...field.validation }

        if (field.type === 'select') {
          return (
            <Select key={field.name} label={field.label} error={errors[field.name]?.message} {...register(field.name, validation)}>
              <option value="">Select {field.label}</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          )
        }

        return (
          <Input
            key={field.name}
            type={field.type ?? 'text'}
            step={field.type === 'number' ? 'any' : undefined}
            label={field.label}
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
