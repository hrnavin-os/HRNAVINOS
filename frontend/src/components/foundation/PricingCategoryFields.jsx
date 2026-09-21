import { Input } from '@/components/ui/Input'

/**
 * The editable form of one pricing category: its label, the two headline fees,
 * and every payment plan under it down to the individual installments.
 *
 * Extracted from the Form Collection modal when the Programs page needed the
 * same thing. A program's card and its detail popup both lead with the
 * training fee, so "edit the program" plainly means editing that too - but the
 * fee lives on the category, and a second editor for it would be a second set
 * of field names to keep in step with the payload the API validates.
 *
 * `path` is where this category sits in the enclosing form, so the same
 * component serves a list of three (`categories.0`) and a single one lifted
 * out of that list (`pricing`). The shape underneath the path is identical
 * either way, which is what lets both callers post it back unchanged.
 *
 * The plan list is not editable here and that is deliberate: the API requires
 * exactly single_shot/two_shot/emi_6_weeks with a fixed number of installments
 * each, so there is nothing to add or remove - only amounts to set.
 */
export function PricingCategoryFields({ category, path, register, disabled = false }) {
  // Validation stays on whether or not the fields are disabled: a disabled
  // input keeps the value it was seeded with, so `required` is satisfied by
  // the config as it already stands and the form posts it back unchanged.
  const field = (name, options) => register(`${path}.${name}`, options)

  return (
    <div className="rounded-md border border-slate-200 p-4">
      <input type="hidden" {...register(`${path}.code`)} />
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Input label="Category Label" disabled={disabled} {...field('label', { required: true })} />
        <Input label="Training Fee" disabled={disabled} {...field('training_fee', { required: true })} />
        <Input
          label="After Placement Fee"
          disabled={disabled}
          {...field('after_placement_fee', { required: true })}
        />
      </div>
      <div className="space-y-3">
        {(category.plans ?? []).map((plan, planIndex) => (
          <div key={plan.value} className="rounded-md bg-slate-50 p-3">
            <input type="hidden" {...register(`${path}.plans.${planIndex}.value`)} />
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {plan.value.replace(/_/g, ' ')}
            </p>
            <div className="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label="Plan Label"
                disabled={disabled}
                {...field(`plans.${planIndex}.label`, { required: true })}
              />
              <Input
                label="Summary"
                disabled={disabled}
                {...field(`plans.${planIndex}.summary`, { required: true })}
              />
            </div>
            <div className="mb-2">
              <Input
                label="After Placement"
                disabled={disabled}
                {...field(`plans.${planIndex}.after_placement`, { required: true })}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(plan.amounts ?? []).map((_, amountIndex) => (
                <div key={amountIndex} className="w-28">
                  <Input
                    label={`Amount ${amountIndex + 1}`}
                    type="number"
                    disabled={disabled}
                    {...field(`plans.${planIndex}.amounts.${amountIndex}`, {
                      required: true,
                      valueAsNumber: true,
                    })}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
