import { useEffect, useMemo, useState } from "react"
import { median } from "d3-array"
import {
  Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Country, Status } from "@/components/NodeCard"
import { api, type Node } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  axisBytes, axisTop, bytes, clockFor, quarters, cpuName, CYCLES, FOREVER, money, osName, rate, timeTicks,
} from "@/lib/format"

type Point = {
  ts: number
  cpu: number
  mem_used: number
  disk_used: number
  net_rx: number
  net_tx: number
}
// `latency` is the bucket's median round trip, null when every probe in it timed
// out. `band` is the range its answers spanned, absent when they spanned nothing.
// `loss` is the percentage that timed out, absent when none did.
type PingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}
/** Probe names by id, sent alongside the samples they label. */
type Probes = Record<string, string>
/**
 * Proportion of the whole window each probe lost, by id, absent for probes that
 * lost nothing. Sent because it cannot be derived here: every bucket's `loss` is
 * already a percentage of that bucket, so the sample counts it was divided by are
 * unavailable. Averaging them would weight a bucket holding one sample equally
 * with one holding twelve, and the window's first and last buckets are partial
 * regardless of what the probe does.
 */
type Loss = Record<string, number>

const RANGES = [
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
]

// Latency stops at a day. A week-wide bucket would still carry the spread and the
// loss figure, but a week of probe history is outside this page's purpose, and
// these are the windows in which every ping remains on the chart.
const RANGES_FOR = { resources: RANGES, latency: RANGES.filter((r) => r.hours <= 24) }

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }

// No grow-in animation: it would spend 1.5 s drawing a line across the panel on
// every range change, on a page meant to be read at a glance, and on the latency
// chart across seven hundred points per probe.
const SERIES = { dot: false as const, strokeWidth: 1.5, isAnimationActive: false }

// One width for every stacked panel's value axis. Sized to their own labels --
// 40px under "100%", 68px under "172 MB" -- the four plot areas would be offset by
// 28px, placing a CPU spike and the network spike that caused it at different x.
const Y_WIDTH = 68

// One hue per probe, keyed by position so a line keeps its colour while other
// probes are hidden. The resource panels stay on the greyscale `--chart-*`.
const PALETTE = [
  { stroke: "var(--color-probe-1)" },
  { stroke: "var(--color-probe-2)" },
  { stroke: "var(--color-probe-3)" },
  { stroke: "var(--color-probe-4)" },
  { stroke: "var(--color-probe-5)" },
]

// The red the node cards already use for a lost probe, so loss reads the same
// on both pages.
const LOSS_RED = "var(--color-ping-bad)"

/** One tooltip look for every panel on the page. */
const TIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  boxShadow: "0 4px 12px rgb(0 0 0 / 0.15)",
} as const

/**
 * The dot for a bucket that answered some of its probes and lost the rest: a
 * ring in the loss red. The line itself only draws what answered, so without
 * the ring a bucket that dropped half its packets reads as a healthy point.
 */
function LossDot({ cx, cy, payload, index, lossKey, rawKey }: {
  cx?: number
  cy?: number
  payload?: Record<string, number | null>
  index?: number
  lossKey: string
  rawKey: string
}) {
  const partial = Number(payload?.[lossKey] ?? 0) > 0 && payload?.[rawKey] != null
  return partial && cx !== undefined && cy !== undefined ? (
    <circle key={index} cx={cx} cy={cy} r={3.5} fill="none" stroke={LOSS_RED} strokeWidth={1.5} />
  ) : (
    <g key={index} />
  )
}

type TipEntry = {
  dataKey?: string | number
  name?: unknown
  value?: unknown
  payload?: Record<string, number | null>
}

/**
 * The latency chart's tooltip. Rows are read off the hovered bucket rather
 * than off the tooltip payload, because the payload omits a series whose value
 * is null -- which is exactly the series that lost everything, the one row
 * that must say so. The figure is the line's own value -- despiked when that
 * is switched on -- while the loss beside it is always the bucket's raw
 * percentage: smoothing must not smooth an outage away.
 */
function PingTip({ active, payload, label, swatch, probes, smooth }: {
  active?: boolean
  payload?: TipEntry[]
  label?: unknown
  swatch: (id: number) => { stroke: string }
  probes: { id: number; name: string }[]
  smooth: boolean
}) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  const entries = probes
    .map((probe) => {
      const raw = row[`t${probe.id}`]
      const loss = Number(row[`l${probe.id}`] ?? 0)
      // No reading and no loss is a gap between a slower probe's buckets, not
      // an outage, and says nothing worth a row.
      if ((raw === null || raw === undefined) && loss === 0) return null
      return { ...probe, raw, value: smooth ? row[`s${probe.id}`] : raw, loss }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
  if (!active || !entries.length) return null
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 text-muted-foreground">{new Date(Number(label)).toLocaleString("zh-CN")}</div>
      <div className="space-y-0.5">
        {entries.map((e) => (
          <div key={e.id} className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-[3px]" style={{ background: swatch(e.id).stroke }} />
            <span className="max-w-36 truncate text-muted-foreground">{e.name}</span>
            {e.raw === null || e.raw === undefined ? (
              <span className="tnum ml-auto pl-4 font-medium text-ping-bad">全部丢失</span>
            ) : (
              <span className="tnum ml-auto pl-4">
                {Number(e.value ?? e.raw)} ms
                {e.loss > 0 && <span className="text-ping-bad">{` · 丢 ${e.loss}%`}</span>}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** The probes currently drawn, in their own colours, anchored beneath the chart. */
function Legend({ probes, swatch }: { probes: { id: number; name: string }[]; swatch: (id: number) => { stroke: string } }) {
  if (!probes.length) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {probes.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1.5">
          <span className="size-2 shrink-0 rounded-[3px]" style={{ background: swatch(p.id).stroke }} />
          {p.name}
        </span>
      ))}
    </div>
  )
}

const TABS = [
  { key: "resources", label: "资源" },
  { key: "latency", label: "网络延迟" },
] as const

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h4>
      <div className="h-40 w-full text-muted-foreground">{children}</div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Hampel filter (Hampel 1974; MATLAB ships it as `hampel`). A point more than
 * `sigmas` robust deviations from its window's median is replaced by that median,
 * while everything else passes through unchanged, which is what distinguishes it
 * from a rolling median or a moving average.
 *
 * 1.4826 rescales the median absolute deviation to a standard deviation for
 * normally distributed data; 3 sigma is the conventional cut.
 */
function despike(points: PingPoint[], window = 7, sigmas = 3): PingPoint[] {
  const half = window >> 1
  // ponytail: recomputes the window per point. A few thousand samples is
  // negligible; substitute a rolling structure if a chart ever needs 100k.
  return points.map((p, i) => {
    // A timeout is a gap rather than a high reading: neither smoothed, nor counted
    // towards what its neighbours are compared against.
    if (p.latency === null) return p
    const near = points
      .slice(Math.max(0, i - half), i + half + 1)
      .map((x) => x.latency)
      .filter((v) => v !== null)
    const mid = median(near) ?? p.latency
    const mad = median(near.map((v) => Math.abs(v - mid))) ?? 0
    const outlier = mad > 0 && Math.abs(p.latency - mid) > sigmas * 1.4826 * mad
    return outlier ? { ...p, latency: mid } : p
  })
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  )
}

export function NodeDetail({ node }: { node: Node }) {
  // A link into this page can name its tab: the TCPing block on a node card
  // opens the latency view directly rather than the default resources one.
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>(() =>
    new URLSearchParams(location.search).get("tab") === "latency" ? "latency" : "resources",
  )
  // Each tab keeps its own range: a 7-day trend and a 1-hour trace answer
  // different questions.
  const [ranges, setRanges] = useState({ resources: 6, latency: 6 })
  const hours = ranges[tab]
  const [smooth, setSmooth] = useState(false)
  // Probes switched off. Hiding a slow one is what makes the fast ones readable,
  // as the axis rescales to what remains.
  const [hiddenProbes, setHiddenProbes] = useState<number[]>([])
  const [data, setData] = useState<{ metrics: Point[]; ping: PingPoint[]; probes: Probes; loss?: Loss } | null>(null)
  // Retained rather than folded into an empty result: a refused request and an
  // empty window are different answers, and the hub has reason to refuse this one
  // -- it caps how many history windows it builds concurrently, since each holds
  // the connection the agents report through. Rendered as an empty window, a 503
  // would misdirect the reader.
  const [failed, setFailed] = useState("")
  // Where the brush has been dragged, so the axis reticks for the visible span
  // rather than retaining the whole window's ticks.
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  // Where the chart begins on screen, so its height can occupy the remainder.
  const [chartTop, setChartTop] = useState(0)

  useEffect(() => {
    let active = true
    // The charts must not continue drawing the old range while the new one is in
    // flight.
    // oxlint-disable-next-line react/set-state-in-effect
    setData(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setZoom(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setFailed("")
    // What this screen can resolve, in device pixels, which is the unit the line
    // is drawn in: a 1280-wide retina panel has 2560 of them for a day of minutes.
    // Read here rather than from a ref, since the hub only thins further, an
    // approximate figure suffices, and the viewport is known before layout. A
    // rotation keeps whatever it fetched with.
    //
    // The tab determines which half is requested; the other accounted for a third
    // to two thirds of every response and was never drawn.
    const points = Math.round(globalThis.innerWidth * (globalThis.devicePixelRatio || 1))
    const series = tab === "latency" ? "ping" : "metrics"
    api<{ metrics: Point[]; ping: PingPoint[]; probes: Probes; loss?: Loss }>(
      `/nodes/${node.id}/metrics?hours=${hours}&points=${points}&series=${series}`,
    )
      .then((next) => { if (active) setData(next) })
      .catch((e: Error) => {
        // `|| "..."` as in App.tsx: HTTP/2 dropped statusText, so a bodiless
        // failure from a proxy arrives as the empty string and renders as no
        // error.
        if (active) { setFailed(e.message || "网络错误"); setData({ metrics: [], ping: [], probes: {} }) }
      })
    return () => { active = false }
  }, [node.id, hours, tab])

  const m = node.metrics
  // One series per probe that reported, labelled from the names the samples
  // arrived with. Memoised, as are the two below: the node prop changes every few
  // seconds as live metrics arrive, and rebuilding the chart's data array on those
  // renders would reset the brush.
  const pingSeries = useMemo(
    () =>
      [...new Set((data?.ping ?? []).map((p) => p.task_id))]
        .map((id, index) => {
          // Timeouts are retained: dropping them would draw a probe losing half
          // its packets as an unbroken line, and one that never answered not at
          // all.
          const points = (data?.ping ?? []).filter((p) => p.task_id === id)
          // Card statistics from the buckets themselves: the mean of every
          // bucket that answered at all.
          const answered = points.map((p) => p.latency).filter((v): v is number => v !== null)
          const avg = answered.length ? Math.round(answered.reduce((sum, v) => sum + v, 0) / answered.length) : null
          // The mean step between one answered bucket and the next -- how
          // nervous the line is beneath wherever it happens to sit.
          const jitter =
            answered.length > 1
              ? answered.slice(1).reduce((sum, v, i) => sum + Math.abs(v - answered[i]), 0) / (answered.length - 1)
              : null
          // Taken from the hub rather than summed from the buckets above, each of
          // which is already a percentage of its own bucket, so averaging them
          // would report one lost round in thirteen as 50%. Left unrounded, since
          // `Math.round` would render 0.28% and 0.00% as the same badge, and the
          // absence of a badge denotes no loss.
          const loss = data?.loss?.[id] ?? 0
          // Height of this probe's full-loss dots on the hidden floor axis,
          // staggered so two probes' outages do not draw over each other.
          const floor = 0.05 + index * 0.12
          return { id, name: data?.probes?.[id] ?? `探测 ${id}`, points, loss, avg, jitter, floor }
        })
        .filter((s) => s.points.length > 0),
    [data],
  )

  // The hub answers in seconds; the time axis requires milliseconds.
  const metricRows = useMemo(
    () => (data?.metrics ?? []).map((m) => ({ ...m, ts: m.ts * 1_000 })),
    [data],
  )

  // Axis tops for the two panels with no capacity to measure against. CPU and a
  // transfer rate do not express fullness: against a fixed 0-100, a machine
  // sitting at 0.4% draws as a line along the panel's floor. Memory and disk keep
  // their totals as tops, where fullness is the entire question.
  const tops = useMemo(() => {
    const max = (pick: (m: Point) => number) =>
      metricRows.reduce((hi, m) => Math.max(hi, pick(m)), 0)
    return {
      // A floor of 4%, or a machine that never exceeds 0.4% would get an axis of
      // 0-0.4 and render every scheduler blip as a peak. Capped at 100.
      cpu: axisTop(max((m) => m.cpu), 4, 10, 100),
      // Base 1024, so the steps are round in the unit `axisBytes` prints.
      rate: axisTop(max((m) => Math.max(m.net_rx, m.net_tx)), 1024, 1024),
    }
  }, [metricRows])

  const shownProbes = useMemo(
    () => pingSeries.filter((s) => !hiddenProbes.includes(s.id)),
    [pingSeries, hiddenProbes],
  )
  // Keyed on the full list, so a line keeps its shade when others are hidden.
  const style = (id: number) => PALETTE[pingSeries.findIndex((p) => p.id === id) % PALETTE.length]

  // The hub stamps every sample with its bucket rather than the second the probe
  // finished, so probes reporting at the bucket's rate share rows instead of each
  // contributing its own: a day of four probes is 717 rows rather than 2,868. A
  // slower probe leaves gaps in its own column, which is what `connectNulls`
  // addresses.
  //
  // Every probe and both versions of every sample are held here whether or not
  // they are on screen: recharts resets the brush when the data array changes
  // identity, and re-reads a controlled selection only when the index props
  // change, which they do not. Hiding a probe or enabling despiking therefore
  // selects a `dataKey` rather than rebuilding the array.
  const pingRows = useMemo(() => {
    const rows = new Map<
      number,
      { ts: number } & Record<string, number | [number, number] | null>
    >()
    for (const s of pingSeries) {
      const smoothed = despike(s.points)
      s.points.forEach((p, i) => {
        const row = rows.get(p.ts) ?? { ts: p.ts * 1_000 }
        row[`t${s.id}`] = p.latency
        row[`s${s.id}`] = smoothed[i].latency
        row[`l${s.id}`] = p.loss ?? 0
        // The full-loss marker on the hidden floor axis: a height only where
        // nothing answered, null anywhere else so no dot is drawn.
        row[`x${s.id}`] = p.latency === null ? s.floor : null
        // Raw, never despiked: the band exists to show what the line omits, and
        // smoothing it would omit the same points.
        row[`b${s.id}`] = p.band ?? null
        rows.set(p.ts, row)
      })
    }
    return [...rows.values()].sort((a, b) => a.ts - b.ts)
  }, [pingSeries])

  // A real time axis rather than the category axis recharts defaults to: on a
  // category axis ticks are selected by index, so a period the agent was offline
  // for collapses to nothing.
  const timeAxis = (rows: { ts: number }[], from = 0, to = rows.length - 1) => ({
    dataKey: "ts",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as const,
    // Explicit, or recharts places them at 05:14 and 10:22. Any that still collide
    // are dropped by `minTickGap`.
    ticks: rows.length ? timeTicks(rows[from].ts, rows[to].ts) : undefined,
    tickFormatter: clockFor(hours),
    minTickGap: hours > 24 ? 72 : 40,
    ...AXIS,
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="truncate text-lg font-medium">{node.name}</h2>
        <Country node={node} />
        <Status node={node} />
        {node.agent_version && (
          <Badge variant="outline" className="font-normal">
            agent {node.agent_version}
          </Badge>
        )}
      </div>

      {/* One flat row of facts: what is left after the traffic figures moved
          out is one machine's spec sheet, and a box around a single topic is
          just a box. Three across at lg, two at md, one on a phone -- a kernel
          version or a CPU model needs about 270px to stay whole. */}
      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
        <Fact label="系统" value={[osName(node.os), node.kernel].filter(Boolean).join(" · ")} />
        <Fact
          label="CPU"
          value={node.cpu_name ? `${cpuName(node.cpu_name)} × ${node.cpu_cores}` : `${node.cpu_cores} 核`}
        />
        <Fact label="内存 / 硬盘" value={`${bytes(node.mem_total)} / ${bytes(node.disk_total)}`} />
        <Fact
          label="架构"
          value={[node.arch, node.virt !== "none" ? node.virt : "", m ? `${m.procs} 进程` : ""]
            .filter(Boolean)
            .join(" · ")}
        />
        <Fact label="今日流量" value={`↓ ${bytes(node.day_rx)} · ↑ ${bytes(node.day_tx)}`} />
        <Fact
          label="续费"
          value={[
            node.price > 0
              ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}`
              : "免费",
            node.expires_at ? `${node.expires_at} 到期` : FOREVER,
          ].join(" · ")}
        />
      </dl>

      {node.remark && (
        <p className="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{node.remark}</p>
      )}

      <div className="space-y-2 border-t pt-4">
        <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
          {TABS.map((t) => (
            <Tab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </Tab>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
            {RANGES_FOR[tab].map((r) => (
              <Tab
                key={r.hours}
                active={hours === r.hours}
                onClick={() => setRanges((all) => ({ ...all, [tab]: r.hours }))}
              >
                {r.label}
              </Tab>
            ))}
          </div>
          {tab === "latency" && (
            <div className="ml-auto flex items-center gap-3">
              <button
                onClick={() => setHiddenProbes([])}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                全选
              </button>
              <button
                onClick={() => setHiddenProbes(pingSeries.map((s) => s.id))}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                全不选
              </button>
            </div>
          )}
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : failed ? (
        <p className="py-8 text-center text-sm text-destructive" role="alert">读取历史数据失败：{failed}</p>
      ) : tab === "latency" ? (
        pingSeries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
        ) : (
          <>
            {/* One card per probe: its colour, name, and the window's three
                answers -- mean latency, loss rate, jitter. The loss figure is
                the hub's own, since bucket percentages cannot be averaged back
                into it. Clicking toggles the line, so a slow probe can be
                dropped to let the fast ones rescale the axis. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {pingSeries.map((s) => {
                const shown = !hiddenProbes.includes(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setHiddenProbes((h) => (shown ? [...h, s.id] : h.filter((id) => id !== s.id)))
                    }
                    title={shown ? "点击隐藏这条曲线" : "点击显示这条曲线"}
                    className={cn(
                      "min-w-0 rounded-lg bg-card px-3 py-2 text-left shadow-sm transition-opacity",
                      !shown && "opacity-40",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-1 shrink-0 rounded-full" style={{ background: style(s.id).stroke }} />
                      <span className="truncate text-sm font-medium">{s.name}</span>
                    </span>
                    <span
                      className="tnum mt-1 block truncate text-xs text-muted-foreground"
                      title="窗口平均延迟 · 丢包率 · 平均波动"
                    >
                      {s.avg === null ? "—" : `${s.avg} ms`}
                      {" · "}
                      <span className={s.loss > 0 ? "font-medium text-ping-bad" : undefined}>
                        {s.loss.toFixed(2)}%
                      </span>
                      {" · "}
                      {s.jitter === null ? "—" : s.jitter < 10 ? s.jitter.toFixed(2) : s.jitter < 100 ? s.jitter.toFixed(1) : Math.round(s.jitter)}
                    </span>
                  </button>
                )
              })}
            </div>
            {/* An explicit pixel height on the panel, so the chart can be
                `flex-1` within it and still end above the fold's bottom edge.
                `+ scrollY`, because getBoundingClientRect is measured from the
                viewport and this callback runs on every render; a live node
                re-renders every two seconds, so a scrolled page would re-derive
                the height from a top that has moved. */}
            <div
              ref={(el) => {
                if (el) setChartTop(el.getBoundingClientRect().top + scrollY)
              }}
              style={
                chartTop
                  ? { height: `calc(100svh - ${Math.round(chartTop)}px - 1rem)` }
                  : undefined
              }
              className="flex min-h-72 flex-col gap-2 rounded-xl bg-card p-3 shadow-sm sm:p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">延迟 (ms)</span>
                <button
                  role="switch"
                  aria-checked={smooth}
                  onClick={() => setSmooth((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  平滑峰值
                  <span
                    className={cn(
                      "relative inline-flex h-4 w-7 items-center rounded-full transition-colors",
                      smooth ? "bg-ping-good" : "bg-muted-foreground/30",
                    )}
                  >
                    <span
                      className={cn(
                        "absolute size-3 rounded-full bg-background transition-transform",
                        smooth ? "translate-x-3.5" : "translate-x-0.5",
                      )}
                    />
                  </span>
                </button>
              </div>
            {/* `min-h-0` is what makes `flex-1` a real number rather than the
                content's own height: ResponsiveContainer reads its parent, and
                a flex child not told it may shrink reports whatever the SVG
                last was. The column above has a height in pixels, so this
                resolves at layout instead of coming back 0. */}
            <div className="min-h-0 w-full flex-1 text-muted-foreground">
              {shownProbes.length === 0 ? (
                <p className="py-8 text-center text-sm">没有选中任何探测</p>
              ) : (
                <ResponsiveContainer>
                  <ComposedChart data={pingRows}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis
                      {...timeAxis(
                        pingRows,
                        Math.min(zoom?.[0] ?? 0, pingRows.length - 1),
                        Math.min(zoom?.[1] ?? pingRows.length - 1, pingRows.length - 1),
                      )}
                    />
                    {/* Not anchored at zero: these lines live in a narrow band
                        far from it, and zero flattens every wobble. */}
                    <YAxis width={44} domain={["auto", "auto"]} {...AXIS} />
                    {/* Readings that never came back are dotted along this floor
                        rather than left as gaps: `connectNulls` bridges an outage,
                        and a bridged outage reads as a healthy stretch without the
                        row of dots beneath it. Each probe has its own height here,
                        so two outages do not draw over each other. */}
                    <YAxis yAxisId="loss" hide domain={[0, 1]} />
                    <Tooltip content={<PingTip swatch={style} probes={shownProbes} smooth={smooth} />} />
                    {/* Behind the line, the range that bucket's answers
                        spanned -- Smokeping's "smoke". At the day window a
                        bucket moves 63 ms at the 90th percentile against the
                        25 ms the trend moves, so a line alone draws the smaller
                        of the two.

                        Only with one probe on screen: rendered for four, the
                        bands overlap into a fog and their extremes drag the
                        axis from 165-385 out to 140-420. */}
                    {shownProbes.length === 1 &&
                      shownProbes.map((s) => (
                        <Area
                          key={`band${s.id}`}
                          dataKey={`b${s.id}`}
                          stroke="none"
                          fill={style(s.id).stroke}
                          fillOpacity={0.16}
                          isAnimationActive={false}
                          tooltipType="none"
                          legendType="none"
                          connectNulls
                        />
                      ))}
                    {shownProbes.map((s) => (
                      <Line
                        key={`loss${s.id}`}
                        yAxisId="loss"
                        dataKey={`x${s.id}`}
                        stroke="none"
                        connectNulls={false}
                        dot={{ r: 3, fill: LOSS_RED, strokeWidth: 0 }}
                        activeDot={false}
                        isAnimationActive={false}
                        legendType="none"
                        tooltipType="none"
                      />
                    ))}
                    {shownProbes.map((s) => (
                      <Line
                        key={s.id}
                        dataKey={`${smooth ? "s" : "t"}${s.id}`}
                        name={s.name}
                        stroke={style(s.id).stroke}
                        strokeWidth={1.5}
                        isAnimationActive={false}
                        connectNulls
                        dot={(props) => <LossDot {...props} lossKey={`l${s.id}`} rawKey={`t${s.id}`} />}
                      />
                    ))}
                    {/* Drag either handle to zoom into a stretch of the trend. */}
                    <Brush
                      dataKey="ts"
                      height={18}
                      travellerWidth={8}
                      tickFormatter={clockFor(hours)}
                      fill="var(--color-muted)"
                      stroke="var(--color-muted-foreground)"
                      onChange={(r) => setZoom([r.startIndex ?? 0, r.endIndex ?? pingRows.length - 1])}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            <Legend probes={shownProbes} swatch={style} />
          </div>
          </>
        )
      ) : data.metrics.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有历史数据</p>
      ) : (
        <div className="space-y-5">
          <Panel title="CPU">
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, tops.cpu]} ticks={quarters(tops.cpu)} unit="%" width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, "CPU"]}
                  contentStyle={TIP_STYLE}
                />
                <Area dataKey="cpu" stroke="var(--color-chart-1)" fill="var(--color-chart-1)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* The axis top is the machine's memory, so the line's height is the
              fraction in use whatever range is picked. Tracking the window's
              own maximum, which is what an area chart does by default, puts
              127 MB of a 457 MB box at the top of the panel. The size is in the
              title because the axis top is claiming it. */}
          <Panel title={`内存 · ${bytes(node.mem_total)}`}>
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, node.mem_total]} ticks={quarters(node.mem_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => bytes(Number(v))}
                  contentStyle={TIP_STYLE}
                />
                <Area dataKey="mem_used" name="内存" stroke="var(--color-chart-2)" fill="var(--color-chart-2)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* A rate has no total to be a fraction of, so this one climbs the
              ladder like CPU rather than pinning to a capacity. */}
          <Panel title="网络速率">
            <ResponsiveContainer>
              <LineChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, tops.rate]} ticks={quarters(tops.rate)} tickFormatter={axisBytes} unit="/s" width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => rate(Number(v))}
                  contentStyle={TIP_STYLE}
                />
                <Line dataKey="net_rx" name="下行" stroke="var(--color-ok)" {...SERIES} />
                <Line dataKey="net_tx" name="上行" stroke="var(--color-chart-1)" {...SERIES} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* The disk it is filling, for the same reason as memory: a node
              using 2.7% of its disk draws along the top of the panel when the
              axis tracks the window's own maximum. */}
          <Panel title={`硬盘 · ${bytes(node.disk_total)}`}>
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, node.disk_total]} ticks={quarters(node.disk_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => bytes(Number(v))}
                  contentStyle={TIP_STYLE}
                />
                <Area dataKey="disk_used" name="硬盘" stroke="var(--color-chart-3)" fill="var(--color-chart-3)" fillOpacity={0.15} {...SERIES} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}
    </div>
  )
}
