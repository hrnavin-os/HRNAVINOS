// The rejoin question's answers, shared by every form that asks it.

// Digits only, like the form's own Batch Number: 30, shown as "Rejoin-30".
export const OLD_BATCH_RULES = {
  required: 'Enter the old batch number',
  pattern: { value: /^[1-9]\d{0,5}$/, message: 'Enter the batch number only, e.g. 30' },
}

// What the API is sent. A number typed and then made moot by unticking the box
// is dropped here rather than sent along with the "no".
export function rejoinPayload(values) {
  const isRejoin = Boolean(values.is_rejoin)
  return { is_rejoin: isRejoin, rejoin_batch: isRejoin ? Number(values.rejoin_batch) : null }
}
