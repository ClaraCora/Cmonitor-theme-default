import type { Node } from "./api"
import { hasTag } from "./tags.ts"

type Plan = Pick<Node, "price" | "currency" | "billing_cycle" | "expires_at" | "permanent" | "expires_at_epoch" | "billing_period_start_epoch" | "valuation_at">

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

/** Convert a recurring plan price to its monthly equivalent. */
export function monthlyCost(node: Pick<Node, "price" | "billing_cycle" | "permanent">): number | null {
  const months = MONTHS[node.billing_cycle]
  if (!months || node.permanent || !Number.isFinite(node.price) || node.price <= 0) return null
  const monthly = node.price / months
  return Number.isFinite(monthly) && monthly > 0 ? monthly : null
}

export type MonthlyPlan = { id: number; name: string; monthly: number; currency: string }

type PricedNode = Pick<Node, "id" | "name" | "price" | "currency" | "billing_cycle" | "permanent">

export function collectMonthlyPlans(nodes: PricedNode[]): MonthlyPlan[] {
  const plans: MonthlyPlan[] = []
  for (const node of nodes) {
    const monthly = monthlyCost(node)
    const currency = node.currency?.trim().toUpperCase()
    if (monthly !== null && currency && /^[A-Z]{3}$/.test(currency)) {
      plans.push({ id: node.id, name: node.name?.trim() || `节点 #${node.id}`, monthly, currency })
    }
  }
  return plans
}

// Match the displayed CNY amount, including decimal half cents such as
// 1.005, for which rounding the result of a binary multiply can lose a cent.
const decimalCny = new Intl.NumberFormat("en-US", {
  useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2,
})
const displayedCents = (value: number) => Number(decimalCny.format(value).replace(".", ""))

export function monthlyRanking(
  nodes: Pick<Node, "id" | "public" | "tags">[], plans: MonthlyPlan[], tag: string | null,
  rates?: Record<string, number>,
) {
  const members = new Set(nodes.filter(node => node.public && (tag === null || hasTag(node.tags, tag))).map(node => node.id))
  const nodeCount = members.size
  const rows: { id: number; name: string; cny: number }[] = []
  let needsExchange = false
  let cents = 0
  for (const { id, name, currency, monthly } of plans) {
    if (!members.delete(id)) continue
    needsExchange ||= currency !== "CNY"
    const cny = valueInCny([[currency, monthly]], rates).total
    if (cny === null || cny <= 0) continue
    const rowCents = displayedCents(cny)
    if (!Number.isSafeInteger(rowCents)) continue
    rows.push({ id, name, cny })
    cents += rowCents
  }
  rows.sort((a, b) => b.cny - a.cny)
  let total: number | null = null
  if ((rows.length || !nodeCount) && Number.isSafeInteger(cents) && displayedCents(cents / 100) === cents) {
    total = cents / 100
  }
  return { rows, total, omitted: nodeCount - rows.length, nodeCount, needsExchange }
}

/** Unused prepaid service, estimated at the current plan's price. */
export function remainingValue(node: Plan, now = Date.now()): number | null {
  const months = MONTHS[node.billing_cycle]
  if (!months || node.permanent || !Number.isFinite(node.price) || node.price <= 0 || !Number.isFinite(now)) return null
  if (!node.expires_at || !/^\d{4}-\d{2}-\d{2}$/.test(node.expires_at)) return null

  const [year, month, day] = node.expires_at.split("-").map(Number)
  const date = new Date(`${node.expires_at}T00:00:00Z`)
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  const end = node.expires_at_epoch != null ? node.expires_at_epoch * 1000 : date.getTime()
  const effectiveNow = node.valuation_at !== undefined ? node.valuation_at * 1000 : now
  if (end <= effectiveNow) return 0
  const start = new Date(date)
  start.setUTCMonth(start.getUTCMonth() - months, 1)
  const last = new Date(start)
  last.setUTCMonth(last.getUTCMonth() + 1, 0)
  start.setUTCDate(Math.min(day, last.getUTCDate()))
  const periodStart = node.billing_period_start_epoch != null ? node.billing_period_start_epoch * 1000 : start.getTime()
  if (periodStart >= end) return null

  const value = node.price * ((end - effectiveNow) / (end - periodStart))
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
