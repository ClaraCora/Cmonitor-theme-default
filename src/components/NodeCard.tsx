import { ArrowDown, ArrowUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/Meter"
import type { Node } from "@/lib/api"
import { bytes, daysUntil, FOREVER, osName, pair, percent, rate, uptime } from "@/lib/format"
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
      <span className={cn("size-1.5 rounded-full", node.online ? "bg-foreground" : "bg-muted-foreground/40")} />
      {label.trim()}
    </Badge>
  )
}

/** Where the machine is, in the same shape as the badge next to it. */
export function Country({ node }: { node: Node }) {
  if (!node.country) return null
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
  if (days === null) return <span className="text-xs text-muted-foreground" title="永不到期">{FOREVER}</span>
  const tone = days < 0 ? "text-destructive" : days <= 7 ? "text-warn" : "text-muted-foreground"
  return (
    <span className={cn("tnum text-xs", tone)}>
      {days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`}
    </span>
  )
}

function Latency({ node }: { node: Node }) {
  const pings = node.pings ?? []
  if (!pings.length) return null
  const answered = pings.filter((ping) => ping.latency !== null && ping.latency >= 0).length
  const tone = (latency: number | null, kind: "bg" | "text") => {
    if (latency === null) return kind === "bg" ? "bg-muted-foreground/25" : "text-muted-foreground"
    const level = latency < 0 || latency >= 200 ? "bad" : latency >= 100 ? "warn" : "good"
    const classes = {
      good: { bg: "bg-ping-good", text: "text-ping-good" },
      warn: { bg: "bg-ping-warn", text: "text-ping-warn" },
      bad: { bg: "bg-ping-bad", text: "text-ping-bad" },
    }
    return classes[level][kind]
  }
  return (
    <div className="mt-4 border-t pt-4 text-xs">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">TCPing</span>
        <span className="tnum text-muted-foreground">{answered} / {pings.length}</span>
      </div>
      <div className="space-y-1.5">
        {pings.map((ping) => {
          const samples = ping.samples?.length ? ping.samples.slice(-20) : ping.latency === null ? [] : [ping.latency]
          // A rate needs the window it is taken over; the single dot an older
          // hub falls back to is not one. The detail page's convention holds
          // here too: no figure means nothing was lost.
          const recent = ping.samples ?? []
          const lost = recent.filter((sample) => sample < 0).length
          return (
            <div key={ping.id} className="grid min-w-0 grid-cols-[minmax(0,5rem)_1fr_auto] items-center gap-x-2">
              <span className="truncate text-muted-foreground" title={ping.name}>{ping.name}</span>
              <span aria-label={`最近 ${samples.length} 次探测`} className="flex min-w-0 justify-end gap-0.5 overflow-hidden">
                {samples.map((sample, index) => (
                  <span
                    key={index}
                    aria-hidden
                    className={cn("size-1.5 shrink-0 rounded-full", tone(sample, "bg"))}
                    title={sample < 0 ? "丢包" : `${sample} ms`}
                  />
                ))}
              </span>
              <span className={cn(
                "tnum shrink-0 font-medium",
                tone(ping.latency, "text"),
              )}>
                {ping.latency === null ? "等待" : ping.latency < 0 ? "超时" : `${ping.latency} ms`}
                {lost > 0 && (
                  <span
                    className="font-normal text-muted-foreground"
                    title={`最近 ${recent.length} 次探测丢包 ${lost} 次`}
                  >
                    {` · 丢 ${Math.round((100 * lost) / recent.length)}%`}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Tags({ node }: { node: Node }) {
  const tags = parseTags(node.tags)
  if (!tags.length) return null
  return (
    <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
      {tags.map((tag, index) => (
        <Badge key={`${tag.text}-${index}`} variant="outline" className="node-tag font-normal" data-color={tag.color}>
          {tag.text}
        </Badge>
      ))}
    </div>
  )
}

export function NodeCard({ node, onOpen }: { node: Node; onOpen: () => void }) {
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
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate font-medium">{node.name}</h3>
            <Country node={node} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {node.os ? osName(node.os) : "等待首次上报"}
            {node.virt && node.virt !== "none" ? ` · ${node.virt}` : ""}
            {node.arch ? ` · ${node.arch}` : ""}
          </p>
        </div>
        {/* State right, identity left, one line each. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Status node={node} />
          <Expiry node={node} />
        </div>
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
            />
            <Meter
              label="内存"
              pct={m ? percent(m.mem_used, m.mem_total) : null}
              foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
            />
            <Meter
              label="硬盘"
              pct={m ? percent(m.disk_used, m.disk_total) : null}
              foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
            />
            <Meter
              label="流量"
              pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
              empty={FOREVER}
              foot={trafficFoot(node)}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-xs">
            <span className="tnum inline-flex items-center gap-1.5">
              <ArrowDown className="size-3 text-muted-foreground" />
              {m ? rate(m.net_rx) : "—"}
            </span>
            <span className="tnum inline-flex items-center gap-1.5">
              <ArrowUp className="size-3 text-muted-foreground" />
              {m ? rate(m.net_tx) : "—"}
            </span>
            <span className="tnum inline-flex items-center gap-1.5 text-muted-foreground">
              <ArrowDown className="size-3" />
              {bytes(node.total_rx)}
            </span>
            <span className="tnum inline-flex items-center gap-1.5 text-muted-foreground">
              <ArrowUp className="size-3" />
              {bytes(node.total_tx)}
            </span>
          </div>
        </>
      ) : (
        /* Never connected: nothing to plot, so the card stays short rather than
           padding out to match its neighbours. */
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          还没有接入。在后台生成安装命令并执行一次。
        </p>
      )}
      <Latency node={node} />
      <Tags node={node} />
    </Card>
  )
}
