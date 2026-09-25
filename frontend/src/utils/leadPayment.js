// Leads either carry a Foundation Form-style payment_plan (installments array,
// each pre-populated with its share of the total course fee) or, for older/
// manually-created leads, the single generic paid_amount/payment_mode fields.
// This normalizes both into one shape so payment UIs don't need to branch.
// Money actually received against one installment. `amount` is the fee the
// program prices it at; `received_amount` is what was keyed in, which can fall
// short of it (part now, the balance on a promised date). Mirrors
// PaymentInstallment.collected on the backend. Installments saved before
// part-payments existed have no received_amount and were paid in full.
export function getInstallmentCollected(installment) {
  if (installment.paid) return Number(installment.received_amount ?? installment.amount ?? 0)
  const hasProof = Boolean(installment.proof_urls?.length || installment.proof_url)
  if (installment.received_amount && installment.mode && hasProof) return Number(installment.received_amount)
  return 0
}

export function getLeadPaymentSummary(lead) {
  if (lead.payment_plan && lead.installments?.length) {
    const installments = lead.installments
    const totalAmount = installments.reduce((sum, installment) => sum + Number(installment.amount ?? 0), 0)
    const paidInstallments = installments.filter((installment) => getInstallmentCollected(installment) > 0)
    const paidAmount = installments.reduce((sum, installment) => sum + getInstallmentCollected(installment), 0)
    const latest = paidInstallments[paidInstallments.length - 1] ?? null
    // When the next money is expected: the earliest date on anything still
    // owed - a part-paid installment's balance, or a scheduled one.
    const balanceDueAt =
      installments
        .filter((installment) => !installment.paid && installment.scheduled_at)
        .map((installment) => installment.scheduled_at)
        .sort()[0] ?? null

    return {
      hasPlan: true,
      paidAmount,
      dueAmount: totalAmount - paidAmount,
      balanceDueAt,
      mode: latest?.mode ?? null,
      // The account the latest payment went into; the lead's own field for
      // payments recorded before it was asked with the payment.
      qrCode: latest?.qr_code ?? lead.qr_code ?? null,
      transactionId: latest?.transaction_id ?? null,
      upiId: latest?.upi_id ?? null,
      proofUrl: latest?.proof_url ?? null,
      // Every proof of that payment - an installment can hold several.
      proofUrls: latest?.proof_urls?.length ? latest.proof_urls : latest?.proof_url ? [latest.proof_url] : [],
      remarks: latest?.remarks ?? null,
    }
  }

  return {
    hasPlan: false,
    paidAmount: lead.paid_amount ?? null,
    dueAmount: null,
    balanceDueAt: null,
    mode: lead.payment_mode ?? null,
    qrCode: lead.qr_code ?? null,
    transactionId: null,
    upiId: null,
    proofUrl: lead.payment_image_url ?? null,
    proofUrls: lead.payment_image_url ? [lead.payment_image_url] : [],
    remarks: null,
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
  // A part-payment counts - money has landed, the balance is still due.
  if (lead.installments?.length) return getInstallmentCollected(lead.installments[0]) > 0
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
