import assert from "node:assert/strict"

import { collectMonthlyPlans, monthlyCost, monthlyRanking, remainingValue, summarizeValue, valueInCny } from "./value.ts"

// Fix the valuation clock and timezone: calendar-period tests must not depend
// on the machine running CI or the wall clock on the day a release is built.
process.env.TZ = "UTC"
const at = (date: string) => new Date(`${date}T00:00:00`).getTime()
const plan = { price: 31, currency: "USD", billing_cycle: "monthly", expires_at: "2026-11-16", permanent: false }

assert.equal(monthlyCost(plan), 31)
assert.equal(monthlyCost({ ...plan, price: 120, billing_cycle: "quarterly" }), 40)
assert.equal(monthlyCost({ ...plan, price: 120, billing_cycle: "yearly" }), 10)
assert.equal(monthlyCost({ ...plan, billing_cycle: "once" }), null)
assert.equal(monthlyCost({ ...plan, permanent: true }), null)
assert.equal(monthlyCost({ ...plan, price: 0 }), null)

assert.equal(remainingValue(plan, at("2026-11-01")), 15)
assert.equal(remainingValue(plan, at("2026-11-16")), 0)
assert.equal(remainingValue(plan, at("2026-11-17")), 0, "expired service cannot subtract from the total")
assert.equal(remainingValue(plan, at("2026-11-01") + 43_200_000), 14.5, "partial days retain their unused value")
assert.equal(remainingValue({ ...plan, expires_at: "2027-03-31" }, at("2027-03-01")), 30, "month-end subtraction clamps to February")
assert.equal(remainingValue({ ...plan, price: 366, billing_cycle: "yearly", expires_at: "2028-03-01" }, at("2027-09-01")), 182, "annual periods include leap day")

for (const [billing_cycle, start] of [
  ["monthly", "2026-12-01"],
  ["quarterly", "2026-10-01"],
  ["semiannual", "2026-07-01"],
  ["yearly", "2026-01-01"],
  ["biennial", "2025-01-01"],
  ["triennial", "2024-01-01"],
]) {
  assert.equal(remainingValue({ ...plan, price: 100, billing_cycle, expires_at: "2027-01-01" }, at(start)), 100, `${billing_cycle}: a full unused cycle retains its price`)
}

for (const patch of [
  { permanent: true }, { billing_cycle: "once" }, { billing_cycle: "unknown" },
  { price: 0 }, { price: -1 }, { price: NaN }, { price: Infinity },
  { expires_at: null }, { expires_at: "" }, { expires_at: "invalid" },
  { expires_at: "2026-02-30" }, { expires_at: "2026-13-01" },
]) {
  assert.equal(remainingValue({ ...plan, ...patch }, at("2026-01-01")), null, `unvalued plan: ${JSON.stringify(patch)}`)
}

const totals = summarizeValue([
  plan,
  { ...plan, currency: " usd " },
  { ...plan, currency: "CNY", price: 62 },
  { ...plan, currency: "JPY", price: 310 },
  { ...plan, currency: "", price: 100 },
  { ...plan, permanent: true },
  { ...plan, expires_at: "2020-01-01" },
], at("2026-11-01"))
assert.deepEqual(totals, { totals: [["CNY", 30], ["JPY", 150], ["USD", 30]], counted: 5, omitted: 2 }, "sum each currency separately, including expired zero values")
assert.deepEqual(summarizeValue([], at("2026-11-01")), { totals: [], counted: 0, omitted: 0 })

// Do not round each machine to cents before adding: thirty fractional-cent
// values still represent a whole cent in the fleet's remaining balance.
const fractions = summarizeValue(Array.from({ length: 31 }, () => ({ ...plan, price: 0.01 })), at("2026-11-15"))
assert(Math.abs(fractions.totals[0][1] - 0.01) < 1e-10)

assert.deepEqual(valueInCny([["USD", 10], ["CNY", 20], ["EUR", 5], ["JPY", 100]], { USD: 7, EUR: 8, JPY: 0.05 }), { total: 135, missing: [] }, "convert all currencies before summing")
assert.deepEqual(valueInCny([["CNY", 20]], { CNY: 99 }), { total: 20, missing: [] }, "CNY never needs a rate or changes value")
assert.deepEqual(valueInCny([["CNY", 20], ["USD", 10]]), { total: null, missing: ["USD"] }, "never show a partial sum as the total")
assert.deepEqual(valueInCny([["USD", 0]]), { total: 0, missing: [] }, "expired foreign plans do not require exchange rates")
for (const rate of [0, -1, NaN, Infinity]) {
  assert.equal(valueInCny([["USD", 10]], { USD: rate }).total, null, "invalid rates cannot create a monetary total")
}
assert.equal(valueInCny([["USD", Number.MAX_VALUE]], { USD: 10 }).total, null, "overflow cannot become a displayed total")
console.log("remaining value: calendar cycles, exclusions and CNY conversion passed")

const serverPlan = { ...plan, valuation_at: Date.parse("2026-11-01T00:00:00Z") / 1000, expires_at_epoch: at("2026-11-16") / 1000, billing_period_start_epoch: at("2026-10-16") / 1000 }
for (const zone of ["Asia/Shanghai", "UTC", "America/New_York"]) {
  process.env.TZ = zone
  assert.equal(remainingValue(serverPlan, 0), 15, `server valuation is independent of ${zone} and browser clock`)
}

const pricedNode = (id: number, tags: string, price: number, currency = "CNY", billing_cycle = "monthly") => ({
  id, name: "VPS " + id, tags, price, currency, billing_cycle, public: true,
})
const fleet = [
  pricedNode(1, "CC<blue>; 游走<green>", 120, "USD", "yearly"),
  pricedNode(2, "CC;CC", 2.675), pricedNode(3, "游走", 1.005),
  pricedNode(4, "CC备用", 8), pricedNode(5, "CC", 99, "CNY", "once"),
  { ...pricedNode(6, "游走", 300), public: false },
  pricedNode(7, "游走", 10.049, "USD", "quarterly"),
]
const plans = collectMonthlyPlans(fleet)
const rank = (tag: string | null, rates?: Record<string, number>) => monthlyRanking(fleet, plans, tag, rates)
const all = rank(null, { USD: 7 })
assert.deepEqual(all.rows.map(row => row.id), [1, 7, 4, 2, 3])
assert.equal(all.total, 105.14, "all public recurring prices by displayed cents, even when groups overlap")
assert.equal(all.omitted, 1)
const cc = rank("CC", { USD: 7 })
assert.equal(cc.total, 72.68)
assert.deepEqual([cc.nodeCount, cc.omitted, cc.needsExchange], [3, 1, true])
assert.equal(rank("游走", { USD: 7 }).total, 94.46, "normalize billing cycle and currency before rounding")
assert.equal(rank("CC备用").needsExchange, false)
assert.deepEqual(rank("未设置"), { rows: [], total: 0, omitted: 0, nodeCount: 0, needsExchange: false })
const partial = rank("CC")
assert.deepEqual([partial.total, partial.omitted], [2.68, 2], "partial known monthly spend excludes missing rates")
assert.equal(monthlyRanking([fleet[0]], plans, null).total, null, "unknown subtotal differs from an empty group")
const tiny = [pricedNode(1, "", 1.001), pricedNode(2, "", 1.002)]
const tinyRank = monthlyRanking(tiny, collectMonthlyPlans(tiny), null)
assert.deepEqual(tinyRank.rows.map(row => row.id), [2, 1], "underlying amounts break ties at displayed precision")
assert.equal(tinyRank.total, 2)
const tooLarge = [pricedNode(1, "", Number.MAX_VALUE)]
assert.equal(monthlyRanking(tooLarge, collectMonthlyPlans(tooLarge), null).omitted, 1)
const unsafeSum = [pricedNode(1, "", 5e13), pricedNode(2, "", 5e13)]
assert.equal(monthlyRanking(unsafeSum, collectMonthlyPlans(unsafeSum), null).total, null)
console.log("monthly cost ranking: public nodes, tag scopes, exchange and cent subtotals passed")
