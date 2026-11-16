import { useEffect, useState } from "react"

import { cachedExchangeRates, EXCHANGE_CACHE_TTL, fetchExchangeRates } from "./exchange"

export function useExchangeRates(enabled: boolean) {
  const [rates, setRates] = useState(cachedExchangeRates)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const refresh = async (force = false) => {
      const cached = cachedExchangeRates()
      setRates(cached)
      if (!force && cached && Date.now() - cached.fetchedAt < EXCHANGE_CACHE_TTL) {
        setLoading(false)
        setFailed(false)
        return
      }
      setLoading(true)
      setFailed(false)
      try {
        const latest = await fetchExchangeRates(controller.signal)
        if (!controller.signal.aborted) setRates(latest)
      } catch {
        if (!controller.signal.aborted) {
          setRates(cachedExchangeRates())
          setFailed(true)
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void refresh(attempt > 0)
    const timer = setInterval(() => void refresh(), 60 * 60 * 1000)
    return () => { controller.abort(); clearInterval(timer) }
  }, [enabled, attempt])

  return { rates, loading, failed, retry: () => setAttempt((n) => n + 1) }
}
