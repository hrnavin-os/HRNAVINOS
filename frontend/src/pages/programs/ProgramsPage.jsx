import { useQuery } from '@tanstack/react-query'
import { ResourceListPage } from '@/components/resource/ResourceListPage'
import { programService } from '@/services/programService'
import { foundationFormConfigService } from '@/services/foundationFormConfigService'
import { Badge } from '@/components/ui/Badge'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { PERMISSIONS } from '@/constants/permissions'
import { formatCurrency, formatDate } from '@/utils/formatters'

// Mirrors INSTALLMENT_LABELS in backend/app/services/foundation_form_pricing.py.
// Structural (tied to how many installments a plan type has) rather than
// content, which is why the backend keeps it out of the admin-editable config
// too. Falls back to numbered payments for any plan added later.
const INSTALLMENT_LABELS = {
  single_shot: ['Payment'],
  two_shot: ['Payment 1', 'Payment 2'],
  emi_6_weeks: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
}

const installmentLabel = (planValue, index) =>
  INSTALLMENT_LABELS[planValue]?.[index] ?? `Payment ${index + 1}`

const statusBadge = (row) => (
  <Badge tone={row.is_active ? 'green' : 'slate'}>{row.is_active ? 'Active' : 'Inactive'}</Badge>
)

const STATUS_OPTIONS = [
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
]

// The payment side of a program: every plan its pricing category offers, with
// the installment schedule spelled out rather than left as a bare total.
function PricingBreakdown({ category }) {
  if (!category) {
    return <p className="text-sm text-amber-600">This program's pricing category no longer exists.</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4 rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-500">
          Training fee: <span className="font-medium text-slate-900">{category.training_fee}</span>
        </span>
        <span className="text-slate-500">
          After placement: <span className="font-medium text-slate-900">{category.after_placement_fee}</span>
        </span>
      </div>

      {(category.plans ?? []).map((plan) => {
        const amounts = plan.amounts ?? []
        const total = amounts.reduce((sum, amount) => sum + Number(amount ?? 0), 0)
        return (
          <div key={plan.value} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="text-sm font-semibold text-slate-900">{plan.label}</h4>
              <span className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{plan.summary}</p>

            {amounts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {amounts.map((amount, index) => (
                  <span
                    key={`${plan.value}-${index}`}
                    className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  >
                    {installmentLabel(plan.value, index)}: {formatCurrency(amount)}
                  </span>
                ))}
              </div>
            )}

            <p className="mt-2 text-xs text-slate-500">
              After placement: <span className="font-medium text-slate-700">{plan.after_placement}</span>
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ProgramCard({ row, category, actions }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{row.name}</h3>
        {statusBadge(row)}
      </div>

      <p className="text-xs leading-relaxed text-slate-500">{category?.label ?? row.category}</p>

      {row.description && <p className="mt-2 text-xs leading-relaxed text-slate-600">{row.description}</p>}

      {/* mt-auto pins the footer to the bottom so cards of differing text
          length still line their action rows up across the grid. */}
      <div className="mt-auto pt-3">
        {category && (
          <p className="mb-2 text-xs text-slate-500">
            Training fee <span className="font-medium text-slate-900">{category.training_fee}</span>
          </p>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-2">
          <code className="truncate rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{row.value}</code>
          {actions}
        </div>
      </div>
    </div>
  )
}

export function ProgramsPage() {
  // Pricing categories still live on the Foundation Form config singleton, and
  // a program has to name one - it's what decides the payment plans and
  // installment amounts page 2 of the form offers for that program.
  const { data: config, isLoading } = useQuery({
    queryKey: ['foundation-form-config'],
    queryFn: () => foundationFormConfigService.get(),
  })

  if (isLoading) return <LoadingSpinner />

  const categories = config?.categories ?? []
  const categoryOptions = categories.map((category) => ({ value: category.code, label: category.label }))
  const categoryFor = (code) => categories.find((category) => category.code === code)

  const fields = [
    { name: 'name', label: 'Program Name', required: true },
    { name: 'category', label: 'Pricing Category', type: 'select', required: true, options: categoryOptions },
    { name: 'description', label: 'Description' },
    { name: 'order', label: 'Display Order', type: 'number' },
    { name: 'is_active', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
  ]

  // <select> and <input type=number> both hand back strings; the API wants a
  // real bool and int.
  const normalise = (values) => ({
    ...values,
    order: Number(values.order || 0),
    is_active: values.is_active !== 'false',
  })

  return (
    <ResourceListPage
      title="Programs"
      description='Options for the form’s "Program you are planning to join?" dropdown.'
      queryKey="programs"
      service={programService}
      columns={[]}
      renderCard={({ row, actions }) => (
        <ProgramCard row={row} category={categoryFor(row.category)} actions={actions} />
      )}
      createFields={fields}
      createPermission={PERMISSIONS.PROGRAMS_CREATE}
      transformCreatePayload={normalise}
      rowActions={{
        view: {
          title: (row) => row.name,
          maxWidth: 'max-w-2xl',
          fields: [
            { label: 'Program', value: (row) => row.name },
            { label: 'Description', value: (row) => row.description },
            { label: 'Pricing Category', value: (row) => categoryFor(row.category)?.label ?? row.category },
            { label: 'Form Value', value: (row) => row.value },
            { label: 'Display Order', value: (row) => String(row.order) },
            { label: 'Status', value: statusBadge },
            {
              label: 'Payment Plans',
              fullWidth: true,
              value: (row) => <PricingBreakdown category={categoryFor(row.category)} />,
            },
            { label: 'Created', value: (row) => formatDate(row.created_at) },
            { label: 'Updated', value: (row) => formatDate(row.updated_at) },
          ],
        },
        edit: {
          title: (row) => `Edit ${row.name}`,
          permission: PERMISSIONS.PROGRAMS_UPDATE,
          // `value` is deliberately not editable: existing leads store it, so
          // renaming a program changes its display name, not its identity.
          fields,
          defaults: (row) => ({
            name: row.name,
            category: row.category,
            description: row.description ?? '',
            order: String(row.order ?? 0),
            is_active: String(row.is_active),
          }),
          transform: normalise,
        },
        remove: {
          permission: PERMISSIONS.PROGRAMS_DELETE,
          describe: (row) => `the "${row.name}" program`,
        },
      }}
    />
  )
}
