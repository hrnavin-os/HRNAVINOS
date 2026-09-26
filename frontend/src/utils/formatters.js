export function formatCurrency(value) {
  const amount = Number(value ?? 0)
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    amount,
  )
}

export function formatDate(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export function titleCase(value) {
  if (!value) return ''
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

// A stay in a call, from seconds: "45 min".
export function formatMinutes(seconds) {
  return `${Math.round(Number(seconds ?? 0) / 60)} min`
}
