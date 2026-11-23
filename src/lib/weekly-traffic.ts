import { normalizeCountry } from "./countries"

export type Bucket = {
  rx: number | null
  tx: number | null
  observed_nodes: number
  expected_nodes: number
}

export type WeeklyTrafficData = {
  days: string[]
  all: Bucket[]
  regions: Record<string, Bucket[]>
}

const count = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0

function validWeek(buckets: unknown): buckets is Bucket[] {
  return Array.isArray(buckets) && buckets.length === 7 && buckets.every(b =>
    b && count(b.observed_nodes) && count(b.expected_nodes) && b.observed_nodes <= b.expected_nodes
      && (b.observed_nodes > 0 ? count(b.rx) && count(b.tx) : b.rx === null && b.tx === null))
}

export function readWeek(body: unknown): WeeklyTrafficData {
  const data = body as Partial<WeeklyTrafficData> | null
  if (!data || !Array.isArray(data.days) || data.days.length !== 7 ||
    !data.days.every((day, i, days) => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && (!i || day > days[i-1])) ||
    !validWeek(data.all) || !data.regions || typeof data.regions !== "object" || Array.isArray(data.regions)) {
    throw new Error("无法读取每日流量")
  }
  const regions: Record<string, Bucket[]> = Object.create(null)
  for (const [raw, buckets] of Object.entries(data.regions)) {
    if (!validWeek(buckets)) throw new Error("无法读取地区流量")
    // Older node records may use aliases for the same country. The map merges those too.
    const code = normalizeCountry(raw)
    if (!code) continue
    const existing = regions[code]
    regions[code] = existing ? existing.map((a, i) => {
      const b = buckets[i]
      const observed = a.observed_nodes + b.observed_nodes
      return {
        rx: observed ? (a.rx ?? 0) + (b.rx ?? 0) : null,
        tx: observed ? (a.tx ?? 0) + (b.tx ?? 0) : null,
        observed_nodes: observed,
        expected_nodes: a.expected_nodes + b.expected_nodes,
      }
    }) : buckets
  }
  return {days: data.days, all: data.all, regions}
}
