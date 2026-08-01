import { titleCase } from '@/utils/formatters'

export const LEAD_STAGES = [
  { value: 'new_lead', label: 'New Lead', tone: 'blue' },
  { value: 'rnr', label: 'RNR', tone: 'red' },
  { value: 'pre_screening', label: 'Follow up call', tone: 'amber' },
  { value: 'financial_approval', label: 'Financial Approval', tone: 'violet' },
  { value: 'batch_confirmation', label: 'Batch Confirmation', tone: 'emerald' },
  { value: 'lost', label: 'Lost', tone: 'slate' },
]

export const LEAD_STAGE_BY_VALUE = Object.fromEntries(LEAD_STAGES.map((stage) => [stage.value, stage]))

export const LEAD_SOURCE_OPTIONS = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone_inquiry', label: 'Phone Inquiry' },
  { value: 'advertisement', label: 'Advertisement' },
  { value: 'other', label: 'Other' },
]

// The stored source value is still "foundation_form" (renaming it would mean
// migrating every existing lead's data) - this only overrides how it reads
// on screen, matching the Form Collection rename everywhere else in the UI.
const SOURCE_LABEL_OVERRIDES = { foundation_form: 'Form Collection' }

export function formatLeadSource(source) {
  return SOURCE_LABEL_OVERRIDES[source] ?? titleCase(source)
}

export const FORM_SECTION_OPTIONS = [
  { value: 'a', label: 'A Section' },
  { value: 'b', label: 'B Section' },
  { value: 'c', label: 'C Section' },
]

export const FORM_SECTION_BY_VALUE = Object.fromEntries(FORM_SECTION_OPTIONS.map((section) => [section.value, section]))
