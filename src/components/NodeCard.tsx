import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, CalendarDays, Cpu, Globe, HardDrive, MemoryStick } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/Meter"
import { api, type Node } from "@/lib/api"
import { bytes, CYCLES, daysUntil, FOREVER, money, osName, pair, percent, rate, trip, uptime } from "@/lib/format"
import { flagPath, osIconPath } from "@/lib/icons"
import { parseTags } from "@/lib/tags"
import { cn } from "@/lib/utils"

/** Which direction the plan meters, matching the node's traffic_mode. */
function monthUsage(node: Node): number {
  const { month_rx: rx, month_tx: tx } = node
  switch (node.traffic_mode) {
    case "up":
      return tx
    case "down":
      return rx
    case "max":
      return Math.max(rx, tx)
    default:
      return rx + tx
  }
}

// A node that has reported once has told the hub its shape -- cores, memory,
// disk -- and the hub retains its traffic totals whether connected or not. A node
// that never connected is the only case with nothing to show.
function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

/**
 * The dot plus how long the machine has been up, or once it is gone, how long it
 * has been absent -- the first question asked of an offline node. Both are
 * durations, so the badge keeps its shape either way.
 */
export function Status({ node }: { node: Node }) {
  const down = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const label = node.online
    ? `在线 ${node.metrics ? uptime(node.metrics.uptime) : ""}`
    : deployed(node)
      ? `离线 ${down >= 60 ? uptime(down) : ""}`
      : "未接入"
  return (
    // Muted once it stops reporting: the figures on the page are genuine, merely
    // no longer current.
    <Badge
      variant="outline"
      className={cn("tnum shrink-0 gap-1.5 font-normal", !node.online && "text-muted-foreground")}
    >
      <span className={cn("size-1.5 rounded-full", node.online ? "bg-ping-good" : "bg-muted-foreground/40")} />
      {label.trim()}
    </Badge>
  )
}

/** Where the machine is, ahead of the name: a flag when the pack knows the
 * code, the code itself when it does not. */
export function Country({ node }: { node: Node }) {
  const [failed, setFailed] = useState(false)
  if (!node.country) return null
  if (!failed) {
    return (
      <img
        src={flagPath(node.country)}
        alt={node.country}
        title={node.country}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-4 w-6 shrink-0 rounded-[3px] object-cover ring-1 ring-black/10"
      />
    )
  }
  return (
    <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground">
      {node.country}
    </Badge>
  )
}

// Traffic uses the plan's own counting rule, so the bar matches the quota the
// node is billed against.
function trafficFoot(node: Node) {
  return node.traffic_limit > 0
    ? pair(monthUsage(node), node.traffic_limit)
    : `${bytes(monthUsage(node))} / ${FOREVER}`
}

// No date means nothing expires: a permanent host, or one with no renewal set. A
// blank corner asserts neither.
function Expiry({ node }: { node: Node }) {
  const days = daysUntil(node.expires_at)
  if (days === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="永不到期">
        <CalendarDays className="size-3" />
        {FOREVER}
      </span>
    )
  }
  const tone = days < 0 ? "text-destructive" : days <= 7 ? "text-warn" : "text-muted-foreground"
  return (
    <span className={cn("tnum inline-flex items-center gap-1 text-xs", tone)}>
      <CalendarDays className="size-3" />
      {days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`}
    </span>
  )
}

/** One probe round, already thinned by the hub: the bucket's median trip and
 * the share of it that timed out. */
type PingBucket = { task_id: number; ts: number; latency: number | null; loss?: number }
type PingHistory = { ping: PingBucket[]; loss?: Record<string, number> }

// Twenty samples is a shallow window: at a one-minute interval it covers
// twenty minutes, and a storm half an hour ago is already gone. The detail
// endpoint answers the same buckets it draws from, so each card asks once for
// its node's recent history and shares the answer across re-renders.
const HISTORY_TTL = 90_000
// A refused answer is remembered only briefly: the hub recovers, and the next
// mount should ask again rather than serve the shallow live window for over a
// minute.
const RETRY_TTL = 8_000
const pingHistoryCache = new Map<number, { at: number; data: PingHistory | null }>()
const pingHistoryInflight = new Map<number, Promise<PingHistory | null>>()

// The hub builds at most four history windows at a time and refuses the rest
// with a 503, since each holds the connection its agents report through. A
// page of cards mounts together, so its requests are paced here rather than
// allowed to stampede that gate.
let historyActive = 0
const historyQueue: (() => void)[] = []
async function historySlot<T>(run: () => Promise<T>): Promise<T> {
  if (historyActive >= 2) await new Promise<void>((release) => historyQueue.push(release))
  historyActive++
  try {
    return await run()
  } finally {
    historyActive--
    historyQueue.shift()?.()
  }
}

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms))

/** The node's two hours of probe buckets, or null when the hub would not
 * answer. A refusal is retried before it is believed: the gate's 503 marks a
 * busy moment, not a missing history. */
function loadPingHistory(nodeId: number): Promise<PingHistory | null> {
  const cached = pingHistoryCache.get(nodeId)
  if (cached && Date.now() - cached.at < (cached.data ? HISTORY_TTL : RETRY_TTL)) {
    return Promise.resolve(cached.data)
  }
  const running = pingHistoryInflight.get(nodeId)
  if (running) return running
  const request = (async () => {
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          const data = await historySlot(() =>
            api<PingHistory>(`/nodes/${nodeId}/metrics?hours=2&points=60&series=ping`),
          )
          pingHistoryCache.set(nodeId, { at: Date.now(), data })
          return data
        } catch {
          if (attempt >= 3) {
            pingHistoryCache.set(nodeId, { at: Date.now(), data: null })
            return null
          }
          await wait(1_500 * (attempt + 1))
        }
      }
    } finally {
      pingHistoryInflight.delete(nodeId)
    }
  })()
  pingHistoryInflight.set(nodeId, request)
  return request
}

function usePingHistory(nodeId: number) {
  const [hist, setHist] = useState<PingHistory | null>(() => {
    const cached = pingHistoryCache.get(nodeId)
    return cached?.data && Date.now() - cached.at < HISTORY_TTL ? cached.data : null
  })
  useEffect(() => {
    let active = true
    loadPingHistory(nodeId).then((d) => {
      // A refusal keeps whatever the card already shows, live samples
      // included; replacing a genuine answer with nothing would be worse.
      if (active && d) setHist(d)
    })
    return () => {
      active = false
    }
  }, [nodeId])
  return hist
}

/** One bar in a probe strip: height against the row's own peak, so a fast
 * link still shows its jitter instead of a dotted line along the baseline.
 * Colour stays absolute, reading the same on every card. The bucket's lost
 * share is a red segment beneath. */
function PingBar({ latency, loss, peak, title }: { latency: number | null; loss: number; peak: number; title: string }) {
  if (latency === null) {
    return <span className="h-[22%] min-w-[2px] flex-1 rounded-[2px] bg-ping-bad" title={title} />
  }
  const level = latency >= 200 ? "bad" : latency >= 100 ? "warn" : "good"
  return (
    <span className="flex h-full min-w-[2px] flex-1 flex-col justify-end" title={title}>
      <span
        className={cn("rounded-[2px]", { good: "bg-ping-good", warn: "bg-ping-warn", bad: "bg-ping-bad" }[level])}
        style={{ height: `${45 + 55 * (latency / peak)}%` }}
      />
      {loss > 0 && <span className="rounded-b-[2px] bg-ping-bad" style={{ height: `${Math.min(100, loss)}%` }} />}
    </span>
  )
}

const clock = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })

function Latency({ node, onOpenLatency }: { node: Node; onOpenLatency: () => void }) {
  const pings = node.pings ?? []
  const hist = usePingHistory(node.id)
  if (!pings.length) return null
  const text = (latency: number | null) => {
    if (latency === null) return "text-muted-foreground"
    return latency < 0 || latency >= 200 ? "text-ping-bad" : latency >= 100 ? "text-ping-warn" : "text-ping-good"
  }
  return (
    // Its own target within the card: here opens the node's latency chart,
    // anywhere else opens the node's resources. The stopPropagation pair
    // keeps the two apart, keyboard included.
    <div
      role="button"
      tabIndex={0}
      title="查看网络延迟"
      onClick={(e) => {
        e.stopPropagation()
        onOpenLatency()
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return
        e.preventDefault()
        e.stopPropagation()
        onOpenLatency()
      }}
      className="-mx-2 mt-4 cursor-pointer rounded-b-lg border-t px-2 pt-3 text-xs transition-colors hover:bg-muted/60"
    >
      <div className="space-y-2">
        {pings.map((ping) => {
          const buckets = hist?.ping.filter((b) => b.task_id === ping.id) ?? null
          const fromHistory = !!buckets?.length
          // Live samples are the fallback while history loads, and for a hub
          // too old to answer the endpoint at all.
          const samples = ping.samples?.length ? ping.samples.slice(-20) : ping.latency === null ? [] : [ping.latency]
          const ok = (fromHistory ? buckets.map((b) => b.latency) : samples).filter((v): v is number => v !== null && v >= 0)
          const avg = ok.length > 1 ? Math.round(ok.reduce((sum, v) => sum + v, 0) / ok.length) : null
          // Heights are relative to the row's own peak: against an absolute
          // ceiling a sub-millisecond link flattens into a dotted line that
          // reads as missing data. The 1 guards an all-zero row.
          const peak = Math.max(1, ...ok)
          // The rate needs the window it is taken over. History's figure comes
          // from the raw samples inside the window; the live one from the hub's
          // own 20-sample window, never from the single-sample fallback.
          const lost = (ping.samples ?? []).filter((s) => s < 0).length
          const lossPct = fromHistory
            ? (hist?.loss?.[ping.id] ?? 0)
            : lost > 0 ? (100 * lost) / (ping.samples?.length || 1) : 0
          const bars = fromHistory
            ? buckets.map((b, i) => (
                <PingBar
                  key={i}
                  latency={b.latency}
                  loss={b.loss ?? 0}
                  peak={peak}
                  title={`${clock(b.ts)} · ${b.latency === null ? "全部丢失" : trip(b.latency)}${(b.loss ?? 0) > 0 && b.latency !== null ? ` · 丢 ${b.loss}%` : ""}`}
                />
              ))
            : samples.map((s, i) => (
                <PingBar key={i} latency={s < 0 ? null : s} loss={s < 0 ? 100 : 0} peak={peak} title={s < 0 ? "丢包" : trip(s)} />
              ))
          return (
            <div key={ping.id} className="min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-muted-foreground" title={ping.name}>{ping.name}</span>
                <span className="tnum shrink-0 font-medium">
                  <span className={text(ping.latency)}>
                    {ping.latency === null ? "等待" : ping.latency < 0 ? "超时" : trip(ping.latency)}
                  </span>
                  {avg !== null && (
                    <span className="font-normal text-muted-foreground">{` · 均 ${trip(avg)}`}</span>
                  )}
                  {lossPct > 0 && (
                    <span className="font-normal text-ping-bad">
                      {` · 丢 ${lossPct < 1 ? "<1" : Math.round(lossPct)}%`}
                    </span>
                  )}
                </span>
              </div>
              <div aria-label={fromHistory ? "最近 2 小时探测" : `最近 ${samples.length} 次探测`} className="mt-1 flex h-3.5 items-end gap-px">
                {bars}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Tags({ node }: { node: Node }) {
  const tags = parseTags(node.tags)
  const price = node.price > 0 ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}` : null
  if (!tags.length && !price) return null
  return (
    <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
      {price && (
        <Badge variant="outline" className="tnum font-normal text-ping-good">
          {price}
        </Badge>
      )}
      {tags.map((tag, index) => (
        <Badge key={`${tag.text}-${index}`} variant="outline" className="node-tag font-normal" data-color={tag.color}>
          {tag.text}
        </Badge>
      ))}
    </div>
  )
}

export function NodeCard({ node, onOpen, onOpenLatency }: { node: Node; onOpen: () => void; onOpenLatency: () => void }) {
  const m = node.metrics

  return (
    <Card
      onClick={onOpen}
      // min-w-0: a grid item sizes to its content unless told otherwise, and the
      // OS line below does not wrap, so on a phone the card would grow past its
      // column and scroll the page sideways. The truncate inside only takes effect
      // once the card is allowed to be narrower.
      className="min-w-0 cursor-pointer gap-0 p-4 transition-colors hover:border-ring"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Country node={node} />
          <h3 className="truncate font-medium">{node.name}</h3>
        </div>
        {/* The OS is an icon in the corner; the words behind it answer to a
            hover. Never-connected nodes simply show no icon. */}
        {node.os && osIconPath(node.os) && (
          <img
            src={osIconPath(node.os)!}
            alt={osName(node.os)}
            title={[osName(node.os), node.virt && node.virt !== "none" ? node.virt : "", node.arch]
              .filter(Boolean)
              .join(" · ")}
            loading="lazy"
            className="size-5 shrink-0"
          />
        )}
      </div>

      {/* One layout for both states: a disconnected node still knows its
          cores, memory, disk size and traffic totals, and showing those with
          the live figures blank beats a stretched card with one line in it. */}
      {deployed(node) ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            {/* The core count belongs beside the word CPU: it is what the
                percentage and the load averages are both measured against. */}
            <Meter
              label={`CPU ${node.cpu_cores} 核`}
              pct={m ? m.cpu : null}
              foot={m ? m.load.map((n) => n.toFixed(2)).join(" ") : "—"}
              tone="var(--color-metric-cpu)"
              icon={<Cpu className="size-3.5 shrink-0" />}
            />
            <Meter
              label="内存"
              pct={m ? percent(m.mem_used, m.mem_total) : null}
              foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
              tone="var(--color-metric-ram)"
              icon={<MemoryStick className="size-3.5 shrink-0" />}
            />
            <Meter
              label="硬盘"
              pct={m ? percent(m.disk_used, m.disk_total) : null}
              foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
              tone="var(--color-metric-disk)"
              icon={<HardDrive className="size-3.5 shrink-0" />}
            />
            <Meter
              label="流量"
              pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
              empty={FOREVER}
              foot={trafficFoot(node)}
              tone="var(--color-metric-traffic)"
              icon={<Globe className="size-3.5 shrink-0" />}
            />
          </div>

          {/* Throughput gets the colour: green out, orange in, totals muted. */}
          <div className="mt-4 space-y-1.5 border-t pt-3.5 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <ArrowUp className="size-3.5 shrink-0 text-ping-good" />
                上行
                <span className="tnum truncate text-sm font-semibold text-ping-good">
                  {m ? rate(m.net_tx) : "—"}
                </span>
              </span>
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <ArrowDown className="size-3.5 shrink-0 text-metric-disk" />
                下行
                <span className="tnum truncate text-sm font-semibold text-metric-disk">
                  {m ? rate(m.net_rx) : "—"}
                </span>
              </span>
            </div>
            <div className="tnum flex items-center justify-between gap-4 text-muted-foreground">
              <span>出站 {bytes(node.total_tx)}</span>
              <span>入站 {bytes(node.total_rx)}</span>
            </div>
          </div>
        </>
      ) : (
        /* Never connected: nothing to plot, so the card stays short rather than
           padding out to match its neighbours. */
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          还没有接入。在后台生成安装命令并执行一次。
        </p>
      )}
      <Latency node={node} onOpenLatency={onOpenLatency} />
      {/* Live state left, renewal date right; the plan's price sits with the tags. */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Status node={node} />
        <Expiry node={node} />
      </div>
      <Tags node={node} />
    </Card>
  )
}
