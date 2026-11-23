import { normalizeCountry } from "./countries"

type TrafficNode = { id: number; name: string; rx: number; tx: number }

export type Bucket = {
  rx: number | null
  tx: number | null
  observed_nodes: number
  expected_nodes: number
  top_nodes?: TrafficNode[]
}

export type WeeklyTrafficData = {
  days: string[]
  all: Bucket[]
  regions: Record<string, Bucket[]>
}

const count = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0

function topTen(nodes: TrafficNode[]) {
  return nodes.slice().sort((a, b) => (b.rx + b.tx) - (a.rx + a.tx) || a.id - b.id).slice(0, 10)
}

function readBuckets(buckets: unknown): Bucket[] {
  if (!Array.isArray(buckets) || buckets.length !== 7) throw new Error("无法读取每日流量")
  return buckets.map(b => {
    if (!b || !count(b.observed_nodes) || !count(b.expected_nodes) || b.observed_nodes > b.expected_nodes ||
        !(b.observed_nodes > 0 ? count(b.rx) && count(b.tx) : b.rx === null && b.tx === null)) {
      throw new Error("无法读取每日流量")
    }
    let top_nodes: TrafficNode[] | undefined
    if (Array.isArray(b.top_nodes) && b.top_nodes.every((n: TrafficNode) =>
      n && Number.isSafeInteger(n.id) && n.id > 0 && typeof n.name === "string" && count(n.rx) && count(n.tx))) {
      top_nodes = topTen(b.top_nodes)
    }
    return { rx: b.rx, tx: b.tx, observed_nodes: b.observed_nodes, expected_nodes: b.expected_nodes, top_nodes }
  })
}

export function readWeek(body: unknown): WeeklyTrafficData {
  const data = body as Partial<WeeklyTrafficData> | null
  if (!data || !Array.isArray(data.days) || data.days.length !== 7 ||
    !data.days.every((day, i, days) => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) && (!i || day > days[i-1])) ||
    !data.regions || typeof data.regions !== "object" || Array.isArray(data.regions)) {
    throw new Error("无法读取每日流量")
  }
  const regions: Record<string, Bucket[]> = Object.create(null)
  for (const [raw, rawBuckets] of Object.entries(data.regions)) {
    // Older node records may use aliases for the same country. The map merges those too.
    const code = normalizeCountry(raw)
    if (!code) continue
    const buckets = readBuckets(rawBuckets)
    const existing = regions[code]
    regions[code] = existing ? existing.map((a, i) => {
      const b = buckets[i]
      const observed = a.observed_nodes + b.observed_nodes
      return {
        rx: observed ? (a.rx ?? 0) + (b.rx ?? 0) : null,
        tx: observed ? (a.tx ?? 0) + (b.tx ?? 0) : null,
        observed_nodes: observed,
        expected_nodes: a.expected_nodes + b.expected_nodes,
        top_nodes: a.top_nodes && b.top_nodes ? topTen([...a.top_nodes, ...b.top_nodes]) : undefined,
      }
    }) : buckets
  }
  return {days: data.days, all: readBuckets(data.all), regions}
}
