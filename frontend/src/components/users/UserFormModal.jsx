import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Briefcase, FileText, Landmark, MapPin, Paperclip, Plus, Upload, User, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Select } from '@/components/ui/Select'
import { TabStrip } from '@/components/ui/TabStrip'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { userService } from '@/services/userService'
import { roleService } from '@/services/roleService'
import { departmentService } from '@/services/departmentService'
import { getApiErrorMessage } from '@/services/apiClient'
import { MEDIA_BASE_URL } from '@/constants/config'
import {
  ADDRESS_FIELDS,
  BANK_FIELDS,
  DOCUMENT_LABELS,
  EMPLOYMENT_FIELDS,
  IDENTITY_FIELDS,
  MOBILE_PATTERN,
  PERSONAL_FIELDS,
} from '@/components/users/staffProfile'

const TABS = [
  { key: 'personal', label: 'Personal', icon: User },
  { key: 'employment', label: 'Employment', icon: Briefcase },
  { key: 'identity', label: 'ID & Docs', icon: FileText },
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'bank', label: 'Bank', icon: Landmark },
]

// Which tab a top-level field sits on, so a failed save can open the tab that
// is holding the error rather than leaving it hidden behind another one. The
// profile sections are keyed by their own names already.
const FIELD_TAB = {
  first_name: 'personal',
  last_name: 'personal',
  phone: 'personal',
  role_id: 'employment',
  department_id: 'employment',
  is_active: 'employment',
  email: 'employment',
  password: 'employment',
}

const SECTION_FIELDS = {
  personal: PERSONAL_FIELDS,
  employment: EMPLOYMENT_FIELDS,
  identity: IDENTITY_FIELDS,
  bank: BANK_FIELDS,
}

const blankAddress = () => Object.fromEntries(ADDRESS_FIELDS.map((field) => [field.name, '']))

// Form state is all strings - that is what inputs hold - so nulls from the
// API become '' on the way in and back to null on the way out.
function sectionValues(fields, source) {
  return Object.fromEntries(fields.map((field) => [field.name, source?.[field.name] ?? '']))
}

function toFormValues(user) {
  return {
    first_name: user?.first_name ?? '',
    last_name: user?.last_name ?? '',
    phone: user?.phone ?? '',
    role_id: user?.role?.id ?? '',
    department_id: user?.department?.id ?? '',
    is_active: String(user?.is_active ?? true),
    email: '',
    password: '',
    personal: sectionValues(PERSONAL_FIELDS, user?.personal),
    employment: sectionValues(EMPLOYMENT_FIELDS, user?.employment),
    identity: sectionValues(IDENTITY_FIELDS, user?.identity),
    bank: sectionValues(BANK_FIELDS, user?.bank),
    address: {
      current: { ...blankAddress(), ...sectionValues(ADDRESS_FIELDS, user?.address?.current) },
      permanent: { ...blankAddress(), ...sectionValues(ADDRESS_FIELDS, user?.address?.permanent) },
      permanent_same_as_current: Boolean(user?.address?.permanent_same_as_current),
    },
  }
}

function cleanSection(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]),
  )
}

function toPayload(values, { documents, isEdit, givesLogin }) {
  const employment = cleanSection(values.employment)
  const payload = {
    first_name: values.first_name.trim(),
    last_name: values.last_name.trim(),
    phone: values.phone.trim(),
    role_id: values.role_id,
    department_id: values.department_id,
    is_active: values.is_active !== 'false',
    personal: cleanSection(values.personal),
    employment: {
      ...employment,
      monthly_salary: employment.monthly_salary === null ? null : Number(employment.monthly_salary),
    },
    identity: { ...cleanSection(values.identity), documents },
    address: {
      current: cleanSection(values.address.current),
      permanent_same_as_current: values.address.permanent_same_as_current,
      permanent: cleanSection(values.address.permanent),
    },
    bank: cleanSection(values.bank),
  }
  // The login goes with a new user, or to an existing one who has none yet -
  // the API refuses to change a login that already exists.
  if ((!isEdit || givesLogin) && values.email.trim()) {
    payload.email = values.email.trim()
    payload.password = values.password
  }
  return payload
}

function Grid({ children }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
}

function SubHeading({ children, hint }) {
  return (
    <div className="border-b border-slate-100 pb-1.5 pt-1 sm:col-span-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

// One field from a staffProfile.js description, registered under `prefix`.
function ProfileField({ field, prefix, register, errors, disabled }) {
  const name = `${prefix}.${field.name}`
  const error = name.split('.').reduce((node, key) => node?.[key], errors)?.message
  const rules = field.pattern ? { pattern: field.pattern } : {}
  const wide = field.wide ? 'sm:col-span-2' : ''

  if (field.type === 'select') {
    return (
      <div className={wide}>
        <Select label={field.label} error={error} disabled={disabled} {...register(name, rules)}>
          <option value="">Select</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>
    )
  }
  return (
    <div className={wide}>
      <Input
        type={field.type ?? 'text'}
        step={field.type === 'number' ? 'any' : undefined}
        min={field.type === 'number' ? 0 : undefined}
        label={field.label}
        error={error}
        disabled={disabled}
        {...register(name, rules)}
      />
    </div>
  )
}

function DocumentsEditor({ documents, onChange }) {
  const [label, setLabel] = useState('')
  const [file, setFile] = useState(null)
  const [inputKey, setInputKey] = useState(0)

  const upload = useMutation({
    mutationFn: () => userService.uploadDocument(file),
    onSuccess: (saved) => {
      onChange([...documents, { label: label.trim() || file.name, url: saved.url, file_name: saved.file_name }])
      setLabel('')
      setFile(null)
      // A file input can't be cleared by value; remounting it is the way.
      setInputKey((key) => key + 1)
    },
  })

  return (
    <div className="space-y-3 sm:col-span-2">
      {documents.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {documents.map((document, index) => (
            <li key={`${document.url}-${index}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Paperclip className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-800">{document.label}</p>
                {document.file_name && <p className="truncate text-xs text-slate-500">{document.file_name}</p>}
              </div>
              <a
                href={`${MEDIA_BASE_URL}${document.url}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Open
              </a>
              <button
                type="button"
                onClick={() => onChange(documents.filter((_, position) => position !== index))}
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${document.label}`}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-md border border-dashed border-slate-300 p-3">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Input
              list="staff-document-labels"
              label="Document"
              placeholder="Select or type…"
              autoComplete="off"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
            <datalist id="staff-document-labels">
              {DOCUMENT_LABELS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">File (PDF or image)</span>
            <input
              key={inputKey}
              type="file"
              accept="application/pdf,image/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block h-9 w-full text-sm text-slate-600 file:mr-3 file:h-9 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </label>
          <Button type="button" variant="secondary" disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
            <Upload className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
        {upload.error && <p className="mt-2 text-xs text-red-600">{getApiErrorMessage(upload.error)}</p>}
      </div>
    </div>
  )
}

function UserForm({ user, roles, departments, onClose, onSaved }) {
  const isEdit = Boolean(user)
  // Only somebody recorded without a login can be given one from here.
  const givesLogin = isEdit && !user.can_sign_in
  const [tab, setTab] = useState('personal')
  const [documents, setDocuments] = useState(() => user?.identity?.documents ?? [])

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    formState: { errors },
  } = useForm({ defaultValues: toFormValues(user) })

  const sameAddress = watch('address.permanent_same_as_current')

  const save = useMutation({
    mutationFn: (values) => {
      const payload = toPayload(values, { documents, isEdit, givesLogin })
      return isEdit ? userService.update(user.id, payload) : userService.create(payload)
    },
    onSuccess: () => {
      onSaved?.()
      onClose()
    },
  })

  const tabsWithErrors = new Set(Object.keys(errors).map((key) => FIELD_TAB[key] ?? key))
  const tabs = TABS.map((item) => ({
    ...item,
    label: tabsWithErrors.has(item.key) ? `${item.label} •` : item.label,
  }))

  // Send the user to the first tab, in order, that is holding an error.
  function onInvalid(invalid) {
    const failing = new Set(Object.keys(invalid).map((key) => FIELD_TAB[key] ?? key))
    const first = TABS.find((item) => failing.has(item.key))
    if (first) setTab(first.key)
  }

  const section = (key) => (tab === key ? 'block' : 'hidden')
  const profileFields = (key) =>
    SECTION_FIELDS[key].map((field) => (
      <ProfileField key={field.name} field={field} prefix={key} register={register} errors={errors} />
    ))

  // The password is asked for only alongside an email, and the other way
  // round: either one alone is a login nobody can use.
  const loginRules = {
    email: {
      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
      validate: (value) => !getValues('password') || Boolean(value.trim()) || 'Give an email to go with the password',
    },
    password: {
      validate: (value) => {
        const email = getValues('email').trim()
        if (!email && !value) return true
        if (!value) return 'Set a password for this login'
        if (value.length < 8) return 'At least 8 characters'
        if (!/[A-Z]/.test(value) || !/\d/.test(value)) return 'Needs an uppercase letter and a digit'
        return true
      },
    },
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit((values) => save.mutate(values), onInvalid)} noValidate>
      <ErrorMessage message={save.error ? getApiErrorMessage(save.error) : null} />

      <TabStrip tabs={tabs} value={tab} onChange={setTab} equal />
      <p className="text-xs text-slate-500">
        Only <span className="font-medium text-slate-700">name, mobile, role and department</span> are required.
        Everything else can be filled in later.
      </p>

      {/* Every tab stays mounted and is only hidden, so its fields keep their
          values and validation while another tab is on screen. */}
      <div className={section('personal')}>
        <Grid>
          <Input
            label="First Name"
            required
            error={errors.first_name?.message}
            {...register('first_name', { validate: (value) => Boolean(value.trim()) || 'Name is required' })}
          />
          <Input label="Last Name" {...register('last_name')} />
          <Input
            type="tel"
            label="Mobile Number"
            required
            error={errors.phone?.message}
            {...register('phone', { required: 'Mobile number is required', pattern: MOBILE_PATTERN })}
          />
          {profileFields('personal')}
        </Grid>
      </div>

      <div className={section('employment')}>
        <Grid>
          <Select
            label="Role"
            required
            error={errors.role_id?.message}
            {...register('role_id', { required: 'Role is required' })}
          >
            <option value="">Select role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
          <div>
            <Select
              label="Department"
              required
              error={errors.department_id?.message}
              {...register('department_id', { required: 'Department is required' })}
            >
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                  {department.is_active ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
            {!departments.length && (
              <p className="mt-1 text-xs text-amber-700">No departments yet - add one under Employee › Departments.</p>
            )}
          </div>
          {profileFields('employment')}
          <Select label="Status" {...register('is_active')}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>

          <SubHeading
            hint={
              isEdit && !givesLogin
                ? 'This user signs in with the email below. They change their own password from their profile.'
                : 'Optional. Leave both blank for staff who do not sign in to the ERP.'
            }
          >
            Sign-in
          </SubHeading>
          {isEdit && !givesLogin ? (
            <Input label="Login Email" value={user.email ?? ''} disabled readOnly />
          ) : (
            <>
              <Input
                type="email"
                label="Login Email"
                autoComplete="off"
                error={errors.email?.message}
                {...register('email', loginRules.email)}
              />
              <PasswordInput
                label="Temporary Password"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password', loginRules.password)}
              />
            </>
          )}
        </Grid>
      </div>

      <div className={section('identity')}>
        <Grid>
          {profileFields('identity')}
          <SubHeading hint="ID copies, certificates, a photo - PDF or image, up to 10MB each.">Documents</SubHeading>
          <DocumentsEditor documents={documents} onChange={setDocuments} />
        </Grid>
      </div>

      <div className={section('address')}>
        <Grid>
          <SubHeading>Current Address</SubHeading>
          {ADDRESS_FIELDS.map((field) => (
            <ProfileField key={field.name} field={field} prefix="address.current" register={register} errors={errors} />
          ))}
          <SubHeading>Permanent Address</SubHeading>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input type="checkbox" {...register('address.permanent_same_as_current')} />
            Same as current address
          </label>
          {!sameAddress &&
            ADDRESS_FIELDS.map((field) => (
              <ProfileField
                key={field.name}
                field={field}
                prefix="address.permanent"
                register={register}
                errors={errors}
              />
            ))}
        </Grid>
      </div>

      <div className={section('bank')}>
        <Grid>{profileFields('bank')}</Grid>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <div className="flex gap-2">
          {TABS.findIndex((item) => item.key === tab) < TABS.length - 1 && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setTab(TABS[TABS.findIndex((item) => item.key === tab) + 1].key)}
            >
              Next
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </Button>
        </div>
      </div>
    </form>
  )
}

// Create and edit share one modal. Pass a `user` (a list row is enough - the
// full record is fetched here) to edit it; omit it to add a new one.
export function UserFormModal({ user, onClose, onSaved }) {
  const isEdit = Boolean(user)
  const detail = useQuery({
    queryKey: ['users', 'detail', user?.id],
    queryFn: () => userService.get(user.id),
    enabled: isEdit,
    // Always the latest: the form is about to overwrite whatever it loads.
    staleTime: 0,
  })
  const roles = useQuery({ queryKey: ['roles-options'], queryFn: () => roleService.list({ page_size: 100 }) })
  const departments = useQuery({
    queryKey: ['departments-options'],
    queryFn: () => departmentService.list({ page_size: 100, sort_by: 'name', sort_order: 'asc' }),
  })

  const record = isEdit ? detail.data : null
  const isLoading = (isEdit && detail.isLoading) || roles.isLoading || departments.isLoading
  const loadError = detail.error ?? roles.error ?? departments.error

  // New staff go into active departments only; somebody already in a retired
  // one keeps it on their own record until they are moved.
  const departmentOptions = (departments.data?.items ?? []).filter(
    (department) => department.is_active || department.id === record?.department?.id,
  )

  return (
    <Modal
      title={isEdit ? `Edit ${[user.first_name, user.last_name].filter(Boolean).join(' ')}` : 'New User'}
      isOpen
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {isLoading ? (
        <LoadingSpinner />
      ) : loadError ? (
        <ErrorMessage message={getApiErrorMessage(loadError)} />
      ) : (
        <UserForm
          user={record}
          roles={roles.data?.items ?? []}
          departments={departmentOptions}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </Modal>
  )
}

export function AddUserAction({ onCreated }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        New User
      </Button>
      {isOpen && <UserFormModal onClose={() => setIsOpen(false)} onSaved={onCreated} />}
    </>
  )
}
