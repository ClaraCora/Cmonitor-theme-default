import type { LivePing } from "./api"
export type ProbeStats = { avg_ms: number | null; p50_ms: number | null; p95_ms: number | null; jitter_ms: number | null; success_count: number; loss_count: number; error_count: number; loss_pct: number | null }
export function probeStatus(ping: LivePing, now = Date.now() / 1000) {
  if (ping.status) return ping.status
  // Older Hubs expose timestamps but not a status. Fail safely on age.
  if (ping.updated_at !== null && now - ping.updated_at > (ping.interval_sec ?? 60) * 2 + 30) return "stale"
  return ping.latency === null ? "pending" : ping.latency >= 0 ? "ok" : "failed"
}
export function probeLabel(ping: LivePing) {
  const state = probeStatus(ping)
  if (state === "stale") return "探测未更新"
  if (state === "pending") return "等待观测"
  if (ping.reason === "dns_timeout" || ping.latency === -2) return "DNS 超时"
  if (ping.reason === "dns_error" || ping.latency === -3) return "DNS 错误"
  return ping.latency !== null && ping.latency < 0 ? "连接失败" : null
}
