import assert from "node:assert/strict"

import { remainingValue, summarizeValue } from "./value.ts"

// Fix the valuation clock and timezone: calendar-period tests must not depend
// on the machine running CI or the wall clock on the day a release is built.
process.env.TZ = "UTC"
const at = (date: string) => new Date(`${date}T00:00:00`).getTime()
const plan = { price: 31, currency: "USD", billing_cycle: "monthly", expires_at: "2026-11-16", permanent: false }

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

console.log("remaining value: calendar cycles, exclusions and separate currency totals passed")
