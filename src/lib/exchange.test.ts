/// <reference types="node" />
import assert from "node:assert/strict"

import { cachedExchangeRates, fetchExchangeRates, parseExchangeRates } from "./exchange.ts"

const now = Date.parse("2026-11-16T12:00:00Z")
const payload = { date: "2026-11-16", cny: { cny: 1, usd: 0.125, eur: 0.1, jpy: 20, bad: -1, zero: 0 } }
const snapshot = parseExchangeRates(payload, now)
assert.deepEqual(snapshot, { date: payload.date, fetchedAt: now, rates: { CNY: 1, USD: 8, EUR: 10, JPY: 0.05 } }, "invert foreign units per CNY, filtering invalid entries")
for (const bad of [null, {}, { ...payload, date: "2026-02-30" }, { ...payload, date: "2026-11-01" }, { ...payload, date: "2026-12-01" }, { ...payload, cny: {} }, { ...payload, cny: { cny: 1, usd: NaN } }, { ...payload, cny: { cny: 2, usd: 0.1 } }]) {
  assert.throws(() => parseExchangeRates(bad, now), "reject corrupt, stale and future-dated feeds")
}

const originalNow = Date.now
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const stored = new Map<string, string>()
Date.now = () => now
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) } })
try {
  let calls = 0
  const fetcher: typeof fetch = async (url, options) => {
    calls++
    assert.equal(options?.credentials, "omit")
    assert.equal(options?.referrerPolicy, "no-referrer")
    assert(options?.signal, "each source has a timeout and cancellation signal")
    if (String(url).includes("cdn.jsdelivr.net")) return new Response("unavailable", { status: 503 })
    return Response.json(payload)
  }
  const loaded = await fetchExchangeRates(new AbortController().signal, fetcher)
  assert.equal(calls, 2, "retry the alternate host after the primary fails")
  assert.deepEqual(loaded, snapshot)
  assert.deepEqual(cachedExchangeRates(), snapshot, "successful rates survive a page reload")
  assert.equal(cachedExchangeRates(now + 8 * 86_400_000), null, "an expired cache is never usable")
  stored.set("cmonitor.cny-rates.v1", "not json")
  assert.equal(cachedExchangeRates(), null, "a corrupted cache does not break the dashboard")

  calls = 0
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(fetchExchangeRates(cancelled.signal, async () => { calls++; throw new Error("aborted") }), { name: "AbortError" })
  assert.equal(calls, 1, "cancellation does not start the fallback request")
  await assert.rejects(fetchExchangeRates(new AbortController().signal, async () => Response.json({})), /Unable to load/)

  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("storage disabled") } })
  assert.equal(cachedExchangeRates(), null)
  assert.deepEqual(await fetchExchangeRates(new AbortController().signal, async () => Response.json(payload)), snapshot, "conversion works when storage is disabled")
} finally {
  Date.now = originalNow
  if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage)
  else Reflect.deleteProperty(globalThis, "localStorage")
}
console.log("exchange rates: conversion direction, validation, fallback, cache and cancellation passed")
