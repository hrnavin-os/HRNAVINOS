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
