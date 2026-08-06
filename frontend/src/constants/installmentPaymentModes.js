export const INSTALLMENT_MODE_OPTIONS = [
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
  { value: 'netbanking', label: 'Netbanking' },
]

export const PAYMENT_PLAN_LABELS = {
  single_shot: 'Single shot',
  two_shot: 'Two shot payment',
  emi_6_weeks: 'EMI - 6 Weeks',
}

// Accent per payment mode, so a column of them is scannable rather than a
// stack of identical chips.
//
// These must not overlap PAYMENT_PLAN_TONES (paymentOptions.js), which holds
// emerald / violet / red: Payment Details and Mode sit next to each other in
// the Cashbook table, and reusing a hue there would read as the same encoding
// said twice. Values must also be tones Badge actually defines - an unknown
// one renders with no background at all.
export const INSTALLMENT_MODE_TONES = {
  card: 'blue',
  upi: 'teal',
  netbanking: 'pink',
}

export const INSTALLMENT_MODE_LABELS = {
  card: 'Card',
  upi: 'UPI',
  netbanking: 'Netbanking',
}
