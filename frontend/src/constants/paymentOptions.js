// Accent per payment plan, reusing the shape the retired manual "payment
// option" tag used - single shot reads calm, EMI reads as the one carrying
// ongoing collection risk. Keyed by PaymentPlanOption; labels themselves
// live in PAYMENT_PLAN_LABELS so every surface names a plan identically.
export const PAYMENT_PLAN_TONES = {
  single_shot: 'emerald',
  two_shot: 'violet',
  emi_6_weeks: 'red',
}

// Sales call disposition, set by whoever is following up with the lead.
// "QUIT" overlaps with the Lost stage, so the two can disagree - it's kept
// because callers need to log the outcome at call time, before anyone moves
// the lead's stage. Treat Stage as the authority if they ever conflict.
export const CALL_REMARK_OPTIONS = [
  { value: 'confirmed_to_pay', label: 'Confirmed to pay', tone: 'emerald' },
  { value: 'will_pay_pending', label: 'Will Pay-Pending', tone: 'violet' },
  { value: 'dnp', label: 'DNP', tone: 'amber' },
  { value: 'call_back', label: 'Call Back', tone: 'blue' },
  { value: 'need_to_discuss', label: 'Need to discuss', tone: 'slate' },
  { value: 'quit', label: 'Quit', tone: 'red' },
  { value: 'onboarded', label: 'Onboarded', tone: 'green' },
]

export const CALL_REMARK_BY_VALUE = Object.fromEntries(CALL_REMARK_OPTIONS.map((option) => [option.value, option]))
