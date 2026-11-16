export type ExchangeRates = {
  date: string
  /** CNY paid for one unit of each currency. */
  rates: Record<string, number>
  fetchedAt: number
}

const DAY = 86_400_000
export const EXCHANGE_CACHE_TTL = 6 * 60 * 60 * 1000
const CACHE_KEY = "cmonitor.cny-rates.v1"
const SOURCES = [
  "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.min.json",
  "https://latest.currency-api.pages.dev/v1/currencies/cny.min.json",
]

/** The feed quotes foreign units per CNY; invert once before valuing nodes. */
export function parseExchangeRates(payload: unknown, now = Date.now()): ExchangeRates {
  const data = payload as { date?: unknown; cny?: Record<string, unknown> } | null
  if (!data || typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error("Invalid exchange date")
  const date = new Date(`${data.date}T00:00:00Z`).getTime()
  if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== data.date || date > now + DAY || now - date > 7 * DAY) throw new Error("Exchange rates are out of date")
  if (!data.cny || data.cny.cny !== 1 || typeof data.cny.usd !== "number" || data.cny.usd <= 0 || !Number.isFinite(data.cny.usd)) throw new Error("Invalid exchange rates")
  const rates: Record<string, number> = { CNY: 1 }
  for (const [currency, units] of Object.entries(data.cny)) {
    if (/^[a-z]{3}$/.test(currency) && typeof units === "number" && units > 0 && Number.isFinite(units) && Number.isFinite(1 / units)) rates[currency.toUpperCase()] = 1 / units
  }
  return { date: data.date, rates, fetchedAt: now }
}

export function cachedExchangeRates(now = Date.now()): ExchangeRates | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null")
    if (!saved || !Number.isFinite(saved.fetchedAt) || saved.fetchedAt > now || now - saved.fetchedAt > 7 * DAY) return null
    return { ...parseExchangeRates(saved.payload, now), fetchedAt: saved.fetchedAt }
  } catch { return null }
}

export async function fetchExchangeRates(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<ExchangeRates> {
  for (const source of SOURCES) {
    try {
      const response = await fetcher(source, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        credentials: "omit",
        referrerPolicy: "no-referrer",
      })
      if (!response.ok) throw new Error("Exchange request failed")
      const payload: unknown = await response.json()
      const result = parseExchangeRates(payload)
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, fetchedAt: result.fetchedAt })) } catch { /* Storage can be disabled. */ }
      return result
    } catch {
      if (signal.aborted) throw new DOMException("Exchange request cancelled", "AbortError")
    }
  }
  throw new Error("Unable to load exchange rates")
}
