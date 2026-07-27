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
