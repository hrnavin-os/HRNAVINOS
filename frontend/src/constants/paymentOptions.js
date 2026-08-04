// Manually-tracked pricing tier a staffer records on a call - independent of
// the structured payment_plan/installments (Foundation Form) flow, which
// has its own real computed amounts.
export const PAYMENT_OPTIONS = [
  { value: 'single_10k', label: 'Single Payment 10K', tone: 'emerald' },
  { value: 'single_15k', label: 'Single Payment 15K', tone: 'emerald' },
  { value: 'single_17_5k', label: 'Single Payment 17.5K', tone: 'emerald' },
  { value: 'two_10k', label: 'Two Payment 10K (5K+5K)', tone: 'violet' },
  { value: 'two_15k', label: 'Two Payment 15K (7.5K+7.5K)', tone: 'violet' },
  { value: 'two_18_5k', label: 'Two Payment 18.5K (9.25K+9.25K)', tone: 'violet' },
  { value: 'emi_3300', label: 'EMI - ₹3300', tone: 'red' },
  { value: 'emi_2500', label: 'EMI - ₹2500', tone: 'red' },
  { value: 'emi_1500', label: 'EMI - ₹1500', tone: 'red' },
]

export const PAYMENT_OPTION_BY_VALUE = Object.fromEntries(PAYMENT_OPTIONS.map((option) => [option.value, option]))

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
  { value: 'quit', label: 'QUIT', tone: 'red' },
]

// Retired values stay renderable so leads tagged before this list changed
// still display their stored remark - they just can't be picked again. The
// backend enum keeps them too, so existing documents continue to deserialize.
const RETIRED_CALL_REMARKS = [{ value: 'onboarded', label: 'Onboarded', tone: 'green' }]

export const CALL_REMARK_BY_VALUE = Object.fromEntries(
  [...CALL_REMARK_OPTIONS, ...RETIRED_CALL_REMARKS].map((option) => [option.value, option]),
)
