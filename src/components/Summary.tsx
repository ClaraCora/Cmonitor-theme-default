import { Activity, ArrowDown, ArrowDownUp, ArrowUp, Gauge, Server, Wallet } from "lucide-react"

import { Card } from "@/components/ui/card"
import { speedHistory, type Node } from "@/lib/api"
import { bytes, rate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useExchangeRates } from "@/lib/useExchangeRates"
import { summarizeValue, valueInCny } from "@/lib/value"

function Tile({ icon: Icon, label, children, className }: {
  icon: typeof Server; label: string; children: React.ReactNode; className?: string
}) {
  return (
    <Card className={cn("@container min-w-0 gap-0 p-3", className)}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </Card>
  )
}

/**
 * In and out side by side, the form every traffic figure on this page takes.
 * Stack when the tile itself is narrow, including the five-column desktop
 * layout; viewport width alone no longer tells us whether both figures fit.
 */
function Flow({ down, up, className }: { down: string; up: string; className?: string }) {
  return (
    <div className={cn("tnum grid grid-cols-1 gap-x-2 @[12rem]:grid-cols-2", className)}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <ArrowDown className="size-3 shrink-0 text-muted-foreground" />
        {down}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1">
        <ArrowUp className="size-3 shrink-0 text-muted-foreground" />
        {up}
      </span>
    </div>
  )
}

/** One row of the speed podium: the name, then both directions beside it.
 * The name yields the space, since the rates are what the row exists for. */
function RateRow({ node }: { node: Node }) {
  const m = node.metrics!
  return (
    // Below sm the name takes its own line: two rates leave it only a sliver
    // of a half-width tile, and a name nobody can read is worse than a wrap.
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <span className="min-w-0 truncate max-sm:basis-full" title={node.name}>
        {node.name}
      </span>
      <span className="tnum inline-flex items-center gap-0.5 whitespace-nowrap font-semibold">
        <ArrowDown className="size-3 text-muted-foreground" />
        {rate(m.net_rx)}
      </span>
      <span className="tnum inline-flex items-center gap-0.5 whitespace-nowrap font-semibold">
        <ArrowUp className="size-3 text-muted-foreground" />
        {rate(m.net_tx)}
      </span>
    </div>
  )
}

/**
 * A bare polyline with no axes or tooltips: at this size only the shape is
 * legible, and recharts would bring a full chart's machinery for it. Series share
 * one scale so the two throughput lines remain comparable.
 */
function Spark({ series }: { series: { values: number[]; className: string }[] }) {
  const top = Math.max(...series.flatMap((s) => s.values), 1)
  const width = Math.max(...series.map((s) => s.values.length), 2) - 1
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      {series.map((s, i) => (
        <polyline
          key={i}
          className={s.className}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          points={s.values.map((v, x) => `${(x / width) * 100},${23 - (v / top) * 22}`).join(" ")}
        />
      ))}
    </svg>
  )
}

const valueFormat = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Summary({ nodes, stale = false }: { nodes: Node[]; stale?: boolean }) {
  const online = nodes.filter((n) => n.online)
  const sum = (pick: (n: Node) => number) => nodes.reduce((total, n) => total + pick(n), 0)

  // Rank by combined live traffic so the nodes carrying most of the fleet's
  // current work are visible even when that traffic is asymmetric.
  const podium = online
    .filter((n) => n.metrics)
    .sort((a, b) => b.metrics!.net_rx + b.metrics!.net_tx - (a.metrics!.net_rx + a.metrics!.net_tx))
    .slice(0, 3)
  // The same push produced `nodes` and this sample, so the figure above the line
  // is that line's last point.
  const now = speedHistory.at(-1) ?? { rx: 0, tx: 0 }
  const value = summarizeValue(nodes)
  const needsExchange = value.totals.some(([currency, amount]) => currency !== "CNY" && amount > 0)
  const exchange = useExchangeRates(needsExchange)
  const cny = valueInCny(value.totals, exchange.rates?.rates)
  const valueNote = `单期价格 × 剩余时长 ÷ 计费周期，再统一折算为 CNY。${value.counted} 台计入，${value.omitted} 台未计入。永久、一次性及缺少计费信息的节点未计入。${needsExchange && exchange.rates ? `汇率日期：${exchange.rates.date}；来源：Currency API。` : ""}`

  return (
    <section aria-label="节点统计" className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
      <Tile icon={Server} label="节点">
        <div className="tnum mt-1 text-xl font-semibold">
          {online.length} / {nodes.length}
        </div>
        <div className="mt-auto pt-1 text-xs text-muted-foreground">
          {stale ? "最近一次收到的在线状态" : nodes.length - online.length > 0 ? `${nodes.length - online.length} 个离线` : "全部在线"}
        </div>
      </Tile>

      <Tile icon={Activity} label="速率TOP3节点">
        <div className="mt-1.5 space-y-1">
          {podium.length > 0 ? (
            podium.map((n) => <RateRow key={n.id} node={n} />)
          ) : (
            <div className="text-xs text-muted-foreground">无在线节点</div>
          )}
        </div>
      </Tile>

      <Tile icon={ArrowDownUp} label="今日流量">
        <Flow
          down={bytes(sum((n) => n.day_rx))}
          up={bytes(sum((n) => n.day_tx))}
          className="mt-1 text-sm font-semibold"
        />
        <div className="mt-2 text-xs text-muted-foreground">总流量</div>
        <Flow down={bytes(sum((n) => n.total_rx))} up={bytes(sum((n) => n.total_tx))} className="mt-0.5 text-sm" />
      </Tile>

      <Tile icon={Gauge} label={stale ? "最近网速" : "实时网速"}>
        <Flow down={rate(now.rx)} up={rate(now.tx)} className="mt-1 text-sm font-semibold" />
        <div className="mt-auto pt-1">
          <Spark
            series={[
              { values: speedHistory.map((s) => s.rx), className: "text-foreground" },
              { values: speedHistory.map((s) => s.tx), className: "text-muted-foreground" },
            ]}
          />
        </div>
      </Tile>

      <Tile icon={Wallet} label="剩余价值" className="max-lg:col-span-2">
        {value.counted > 0 && cny.total !== null ? (
          <dl className="tnum mt-1" title={valueNote}>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <dt className="text-xs text-muted-foreground">CNY</dt>
              <dd className="min-w-0 break-all text-xl font-semibold">{valueFormat.format(cny.total)}</dd>
            </div>
          </dl>
        ) : <div className="mt-1 text-xl font-semibold">—</div>}
        <div className="mt-auto pt-1 text-xs text-muted-foreground" title={valueNote}>
          {value.counted === 0 ? "暂无可估算节点" : cny.total === null && cny.missing.length === 0 ? "金额超出计算范围" : needsExchange && exchange.failed ? (
            <button type="button" onClick={exchange.retry} disabled={exchange.loading} className="rounded-sm text-left underline decoration-dotted underline-offset-4 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60">
              {exchange.loading ? "正在获取汇率…" : cny.total === null ? "汇率获取失败，重试" : "使用缓存汇率，重试"}
            </button>
          ) : cny.total === null ? (
            exchange.loading || !exchange.rates ? "正在获取汇率…" : `暂不支持 ${cny.missing.join("、")} 汇率`
          ) : needsExchange && exchange.rates ? `汇率 ${exchange.rates.date}` : "按剩余时长估算"}
        </div>
      </Tile>
    </section>
  )
}
