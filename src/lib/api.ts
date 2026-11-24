import { useEffect, useState } from "react"
import { decodeFrame, nextSnapshot, type Snapshot } from "./live.ts"

export type Metrics = {
  uptime: number
  cpu: number
  load: [number, number, number]
  mem_total: number
  mem_used: number
  swap_total: number
  swap_used: number
  disk_total: number
  disk_used: number
  net_rx: number
  net_tx: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  tcp: number
  udp: number
  procs: number
}

export type LivePing = {
  id: number
  name: string
  /** Negative means timeout; null means this Hub session has not received a result yet. */
  latency: number | null
  status?: "pending" | "ok" | "failed" | "stale"
  interval_sec?: number
  last_latency?: number | null
  reason?: "dns_timeout" | "dns_error" | "tcp_timeout" | null
  updated_at: number | null
  /** Up to 20 recent readings; a negative value is a lost probe. */
  samples?: number[]
}

export type Node = {
  id: number
  name: string
  sort: number
  public: boolean
  online: boolean
  /** ISO 3166-1 alpha-2, or empty when the hub could not locate the address. */
  country: string
  last_seen: number
  metrics: Metrics | null
  os: string
  kernel: string
  arch: string
  virt: string
  cpu_name: string
  cpu_cores: number
  mem_total: number
  swap_total: number
  disk_total: number
  agent_version: string
  price: number
  currency: string
  billing_cycle: string
  expires_at: string | null
  expires_at_epoch?: number | null
  billing_period_start_epoch?: number | null
  valuation_at?: number
  billing_timezone?: string
  permanent?: boolean
  traffic_incomplete?: boolean
  muted_until?: number
  traffic_limit: number
  traffic_mode: string
  traffic_reset_day: number
  total_rx: number
  total_tx: number
  month_rx: number
  month_tx: number
  month_start: string
  day_rx: number
  day_tx: number
  /** Public labels, separated by semicolons. */
  tags?: string
  /** Current assigned probes and their latest result. */
  pings?: LivePing[]
  /** Panel only. */
  hostname?: string
  ip?: string
  remark?: string
  /** Provider website. Only returned to signed-in callers. */
  website?: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Writes are never replayed automatically: callers can query their result. */
export async function api<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort(init.signal?.reason)
  if (init.signal?.aborted) cancel()
  else init.signal?.addEventListener("abort", cancel, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const headers = new Headers(init.headers)
  if (typeof init.body === "string" && !headers.has("content-type")) headers.set("content-type", "application/json")
  try {
    const res = await fetch(`/api${path}`, { ...init, headers, signal: controller.signal })
    if (!res.ok) throw new ApiError(res.status, (await res.text()) || res.statusText || `HTTP ${res.status}`)
    return res.status === 204 ? undefined as T : await res.json()
  } catch (error) {
    if (timedOut) throw new Error("请求超时，请重试；写入操作请先刷新确认结果")
    throw error
  } finally {
    clearTimeout(timer)
    init.signal?.removeEventListener("abort", cancel)
  }
}

/**
 * Fleet throughput, one sample per push. Held beside the stream that feeds it
 * rather than in the tile that draws it: the summary unmounts while a node page is
 * open, so a buffer held there would restart empty on every return. Two minutes at
 * the hub's push interval.
 */
const KEEP = 60
export const speedHistory: { rx: number; tx: number }[] = []

function sample(nodes: Node[]) {
  const live = nodes.filter((n) => n.online && n.metrics)
  speedHistory.push({
    rx: live.reduce((s, n) => s + n.metrics!.net_rx, 0),
    tx: live.reduce((s, n) => s + n.metrics!.net_tx, 0),
  })
  if (speedHistory.length > KEEP) speedHistory.shift()
}

/** A malformed report must not remove every other node from the page. */
export function safeNodes(nodes: Node[]): Node[] {
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0
  const fields = ["uptime", "cpu", "mem_total", "mem_used", "swap_total", "swap_used", "disk_total", "disk_used",
    "net_rx", "net_tx", "total_rx", "total_tx", "month_rx", "month_tx", "tcp", "udp", "procs"] as const
  return nodes.map((node) => {
    const m = node.metrics
    return !m || (fields.every((key) => number(m[key])) && Array.isArray(m.load) && m.load.length === 3 && m.load.every(number))
      ? node : { ...node, metrics: null }
  })
}

/**
 * Live node list. Uses the WebSocket the hub pushes every two seconds, falling
 * back to polling if it cannot be established.
 */
export function useNodes() {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [connection, setConnection] = useState("connecting")
  const stale = lastUpdatedAt !== null && now - lastUpdatedAt >= 15_000
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const [nodes, setNodes] = useState<Node[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when the hub answers 401: the status page has been closed to anonymous
  // callers since this tab loaded. The hub also ends the stream, so this surfaces
  // on the fallback fetch the reconnect starts; a close allows a client to
  // re-query its state but cannot compel it.
  const [closed, setClosed] = useState(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let request: AbortController | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    let lastFrame = 0
    let lastPoll = 0
    let streaming = false
    let running = false
    const receive = (list: Node[]) => {
      const safe = safeNodes(list)
      sample(safe)
      setNodes(safe)
      setLastUpdatedAt(Date.now())
      setError(null)
      setClosed(false)
    }
    const poll = () => {
      if (!running || streaming || request) return
      lastPoll = Date.now()
      const current = new AbortController()
      request = current
      api<{ nodes: Node[] }>("/nodes", { signal: current.signal })
        .then((d) => {
          if (request !== current || !Array.isArray(d.nodes)) return
          setConnection("polling")
          receive(d.nodes)
        })
        .catch((e: Error) => {
          if (request !== current) return
          setError(e.message || "无法获取最新状态")
          if (e instanceof ApiError && e.status === 401) {
            setClosed(true)
            setNodes(null)
          }
        })
        .finally(() => { if (request === current) request = null })
    }
    const abortPoll = () => {
      request?.abort()
      request = null
    }
    const disconnect = () => {
      const old = socket
      socket = null
      streaming = false
      old?.close()
    }
    const recover = () => {
      disconnect()
      setConnection("reconnecting")
      poll()
      clearTimeout(retry)
      retry = setTimeout(connect, 5000)
    }
    function connect() {
      if (!running || socket) return
      const scheme = location.protocol === "https:" ? "wss" : "ws"
      const query = "format=delta-v1" + (typeof DecompressionStream === "function" ? "&gzip=1" : "")
      try { socket = new WebSocket(`${scheme}://${location.host}/api/ws?${query}`) } catch { recover(); return }
      const current = socket
      current.binaryType = "arraybuffer"
      lastFrame = Date.now()
      lastPoll = lastFrame
      let base: Snapshot | null = null
      let pending = Promise.resolve()
      current.onmessage = (event) => {
        // Binary frames decompress asynchronously. Keep wire order and discard
        // queued work from a socket that was hidden, timed out or superseded.
        pending = pending.then(async () => {
          if (socket !== current) return
          const frame = await decodeFrame(event.data)
          if (socket !== current) return
          base = nextSnapshot(base, frame)
          lastFrame = Date.now()
          streaming = true
          abortPoll()
          setConnection("live")
          receive(base.nodes)
        }).catch(() => { if (socket === current) recover() })
      }
      current.onclose = current.onerror = () => { if (socket === current) recover() }
    }
    const stop = () => {
      running = false
      clearTimeout(retry)
      clearInterval(timer)
      abortPoll()
      disconnect()
    }
    const start = () => {
      if (running || document.hidden) return
      running = true
      setConnection("connecting")
      connect()
      timer = setInterval(() => {
        if (socket && Date.now() - lastFrame >= 10_000) recover()
        else if (!streaming && Date.now() - lastPoll >= 5000) poll()
      }, 1000)
    }
    const visibility = () => { if (document.hidden) stop(); else start() }
    document.addEventListener("visibilitychange", visibility)
    start()
    return () => { document.removeEventListener("visibilitychange", visibility); stop() }
  }, [])

  return { nodes, error, closed, lastUpdatedAt, stale, connection }
}
