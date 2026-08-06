// Leads either carry a Foundation Form-style payment_plan (installments array,
// each pre-populated with its share of the total course fee) or, for older/
// manually-created leads, the single generic paid_amount/payment_mode fields.
// This normalizes both into one shape so payment UIs don't need to branch.
export function getLeadPaymentSummary(lead) {
  if (lead.payment_plan && lead.installments?.length) {
    const installments = lead.installments
    const totalAmount = installments.reduce((sum, installment) => sum + Number(installment.amount ?? 0), 0)
    const paidInstallments = installments.filter((installment) => installment.paid)
    const paidAmount = paidInstallments.reduce((sum, installment) => sum + Number(installment.amount ?? 0), 0)
    const latest = paidInstallments[paidInstallments.length - 1] ?? null

    return {
      hasPlan: true,
      paidAmount,
      dueAmount: totalAmount - paidAmount,
      mode: latest?.mode ?? null,
      transactionId: latest?.transaction_id ?? null,
      upiId: latest?.upi_id ?? null,
      proofUrl: latest?.proof_url ?? null,
    }
  }

  return {
    hasPlan: false,
    paidAmount: lead.paid_amount ?? null,
    dueAmount: null,
    mode: lead.payment_mode ?? null,
    transactionId: null,
    upiId: null,
    proofUrl: lead.payment_image_url ?? null,
  }
}

// What the student still owes once they're placed, which is priced per
// payment plan rather than per lead.
//
// The backend already resolves it (the plan's `after_placement`) and bakes it
// into Lead.payment_expected -- see build_payment_expected_summary in
// app/services/foundation_form_pricing.py, which formats it as
// "<plan> - <summary> (After Placement: <fee>)", sometimes with a
// " | Pays on: ..." suffix appended. Reading it back out of that string keeps
// this to zero extra requests; the alternative is fetching the pricing config
// and the programs collection just to re-derive a value the lead already
// carries, and Finance users may not hold permission for either.
const AFTER_PLACEMENT_PATTERN = /\(After Placement:\s*([^)]*)\)/

export function getAfterPlacementFee(lead) {
  const match = lead.payment_expected?.match(AFTER_PLACEMENT_PATTERN)
  const fee = match?.[1]?.trim()
  return fee || null
}

// Mirrors LeadService._require_first_payment on the backend: has any money
// actually landed for this lead? Handles both representations - a structured
// installment plan, or the older single paid_amount on manual leads.
export function hasFirstPayment(lead) {
  if (lead.installments?.length) return Boolean(lead.installments[0].paid)
  return Number(lead.paid_amount ?? 0) > 0
}

// Reads a multi-installment plan's due dates against today to flag missed
// EMI/two-shot payments: an installment counts as missed once its whole due
// date has passed with no payment recorded (same-day grace - due today is
// still "pending", not missed). Lost eligibility kicks in once 2 unpaid
// installments in a row are overdue.
export function getEmiPaymentHealth(lead) {
  const installments = lead.installments ?? []
  if (installments.length < 2) return { status: 'ok', missedCount: 0 }

  const todayStr = new Date().toISOString().slice(0, 10)
  let missedCount = 0
  for (const installment of installments) {
    if (installment.paid) continue
    if (!installment.scheduled_at) break
    if (installment.scheduled_at < todayStr) {
      missedCount += 1
    } else {
      break
    }
  }

  if (missedCount >= 2) return { status: 'lost_eligible', missedCount }
  if (missedCount === 1) return { status: 'missed_once', missedCount }

  const nextDue = installments.find((installment) => !installment.paid && installment.scheduled_at === todayStr)
  if (nextDue) return { status: 'pending', missedCount: 0 }

  return { status: 'ok', missedCount: 0 }
}
