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

const SECTION_HEADING = 'text-xs font-semibold uppercase tracking-wide text-slate-400'

function StatTile({ label, value }) {
  return (
    <div className="rounded-lg border border-brand-100 bg-brand-50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700/70">{label}</p>
      <p className="mt-0.5 text-base font-semibold text-brand-700">{value}</p>
    </div>
  )
}

// One payment plan. The brand left-edge is what separates plans at a glance -
// three same-coloured boxes in a column read as one block otherwise.
function PlanCard({ plan }) {
  const amounts = plan.amounts ?? []
  const total = amounts.reduce((sum, amount) => sum + Number(amount ?? 0), 0)

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 border-l-4 border-l-brand-600 bg-white">
      <div className="flex items-baseline justify-between gap-3 px-3.5 pt-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900">{plan.label}</h4>
          <p className="mt-0.5 text-xs text-slate-500">{plan.summary}</p>
        </div>
        <span className="shrink-0 text-base font-semibold text-brand-700">{formatCurrency(total)}</span>
      </div>

      {amounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pt-2.5">
          {amounts.map((amount, index) => (
            <div
              key={`${plan.value}-${index}`}
              className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-center"
            >
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                {installmentLabel(plan.value, index)}
              </p>
              <p className="text-xs font-semibold text-slate-800">{formatCurrency(amount)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-3.5 py-2">
        <span className="text-xs text-slate-500">After placement</span>
        <span className="text-xs font-semibold text-slate-700">{plan.after_placement}</span>
      </div>
    </div>
  )
}

// Purpose-built body for the eye icon, in place of the default label/value
// list: the pricing is the point of this popup, so it gets the room and the
// visual weight rather than sitting as one more row.
function ProgramDetail({ program, category }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-brand-100 bg-brand-50 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700/70">Pricing Category</p>
            <p className="mt-0.5 text-sm font-semibold text-brand-700">{category?.label ?? program.category}</p>
          </div>
          {statusBadge(program)}
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-brand-100 pt-2.5">
          <code className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600">{program.value}</code>
          <span className="text-[11px] text-brand-700/60">Display order {program.order}</span>
        </div>
      </div>

      {program.description && <p className="text-sm leading-relaxed text-slate-600">{program.description}</p>}

      {!category ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          This program&rsquo;s pricing category no longer exists, so the form can&rsquo;t offer it a payment plan.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Training Fee" value={category.training_fee} />
            <StatTile label="After Placement" value={category.after_placement_fee} />
          </div>

          <div>
            <h3 className={`${SECTION_HEADING} mb-2`}>Payment Plans</h3>
            <div className="space-y-2.5">
              {(category.plans ?? []).map((plan) => (
                <PlanCard key={plan.value} plan={plan} />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <span>Created {formatDate(program.created_at)}</span>
        <span>Updated {formatDate(program.updated_at)}</span>
      </div>
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
          maxWidth: 'max-w-xl',
          renderBody: (row) => <ProgramDetail program={row} category={categoryFor(row.category)} />,
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
