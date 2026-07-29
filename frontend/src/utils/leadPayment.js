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
