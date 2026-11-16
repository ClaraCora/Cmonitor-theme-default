import type { Node } from "./api"

type Plan = Pick<Node, "price" | "currency" | "billing_cycle" | "expires_at" | "permanent">

// Match the hub's calendar-month renewal periods, including leap years and
// short months. The last complete period before expiry supplies the daily cost.
const MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
}

/** Unused prepaid service, estimated at the current plan's price. */
export function remainingValue(node: Plan, now = Date.now()): number | null {
  const months = MONTHS[node.billing_cycle]
  if (!months || node.permanent || !Number.isFinite(node.price) || node.price <= 0 || !Number.isFinite(now)) return null
  if (!node.expires_at || !/^\d{4}-\d{2}-\d{2}$/.test(node.expires_at)) return null

  // The expiry boundary matches the countdown on NodeCard: local midnight.
  // Validate the components too: Date silently turns February 30 into March.
  const end = new Date(`${node.expires_at}T00:00:00`)
  const [year, month, day] = node.expires_at.split("-").map(Number)
  if (end.getFullYear() !== year || end.getMonth() + 1 !== month || end.getDate() !== day) return null
  if (end.getTime() <= now) return 0

  const start = new Date(end)
  start.setMonth(start.getMonth() - months, 1)
  const last = new Date(start)
  last.setMonth(last.getMonth() + 1, 0)
  start.setDate(Math.min(day, last.getDate()))

  const value = node.price * ((end.getTime() - now) / (end.getTime() - start.getTime()))
  return Number.isFinite(value) ? value : null
}

/** Keep currencies separate: a dollar and a yuan must never become two yuan. */
export function summarizeValue(nodes: Plan[], now = Date.now()) {
  const totals = new Map<string, number>()
  let counted = 0
  for (const node of nodes) {
    const currency = node.currency?.trim().toUpperCase()
    const value = remainingValue(node, now)
    if (value === null || !currency || !/^[A-Z]{3}$/.test(currency)) continue
    const total = (totals.get(currency) ?? 0) + value
    if (!Number.isFinite(total)) continue
    totals.set(currency, total)
    counted++
  }
  return {
    totals: [...totals].sort(([a], [b]) => a.localeCompare(b)),
    counted,
    omitted: nodes.length - counted,
  }
}

/** Return no total until every nonzero currency has a usable conversion. */
export function valueInCny(totals: [string, number][], rates: Record<string, number> = {}) {
  let total = 0
  const missing: string[] = []
  for (const [currency, amount] of totals) {
    if (amount === 0) continue
    const rate = currency === "CNY" ? 1 : rates[currency]
    if (!Number.isFinite(rate) || rate <= 0) { missing.push(currency); continue }
    total += amount * rate
  }
  return { total: missing.length > 0 || !Number.isFinite(total) ? null : total, missing }
}
