import { useEffect, useRef, useState } from "react"
import { ChartNoAxesColumn } from "lucide-react"
import { Dialog } from "radix-ui"
import { api, ApiError } from "@/lib/api"
import { regionLabel } from "@/lib/countries"
import { bytes } from "@/lib/format"
import { readWeek, type Bucket, type WeeklyTrafficData } from "@/lib/weekly-traffic"
import { TrafficRankingContent } from "./TrafficRankingContent"
import "./weekly-traffic.css"

const refreshInterval = 5 * 60 * 1000
const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"]
const shortNumber = new Intl.NumberFormat("zh-CN", {maximumSignificantDigits: 3, useGrouping:false})
function barLabel(value: number) {
  if (value > 0 && value < 0.1) return "<0.1"
  return String(value >= 10 ? Math.round(value) : Number(value.toFixed(1)))
}
const total = (b: Bucket) => (b.rx ?? 0) + (b.tx ?? 0)

function useWeek(visible: boolean) {
  const [week, setWeek] = useState<WeeklyTrafficData | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    let pending = false
    async function load() {
      if (pending || document.hidden) return
      pending = true
      try {
        const data = await api<unknown>("/traffic/weekly", {signal:controller.signal, cache:"no-store"})
        if (controller.signal.aborted) return
        setWeek(readWeek(data))
        setError("")
      } catch (e) {
        if (controller.signal.aborted) return
        setWeek(null)
        setError(e instanceof ApiError && [401,403].includes(e.status) ? "暂无访问权限" : "流量数据加载失败")
      } finally { pending = false }
    }
    void load()
    const timer = window.setInterval(load, refreshInterval)
    document.addEventListener("visibilitychange", load)
    window.addEventListener("online", load)
    return () => {
      controller.abort()
      clearInterval(timer)
      document.removeEventListener("visibilitychange", load)
      window.removeEventListener("online", load)
    }
  }, [visible, retry])
  return {week, error, reload:() => {setError(""); setRetry(n => n + 1)}}
}

function summary(day: string, b: Bucket) {
  if (!b.observed_nodes) return day + "，无记录"
  return day + "，上传 " + bytes(b.tx!) + "，下载 " + bytes(b.rx!) + "，合计 " + bytes(total(b))
    + (b.observed_nodes < b.expected_nodes ? "，仅部分节点有记录" : "")
}

function DayTotals({ bucket }: { bucket: Bucket }) {
  const totals = [["上传", bucket.tx], ["下载", bucket.rx], ["合计", bucket.observed_nodes ? total(bucket) : null]] as const
  return <dl aria-label="当日流量合计" className="tnum grid shrink-0 grid-cols-3 gap-2 border-b bg-muted/25 px-4 py-3 sm:px-5">
    {totals.map(([label, value]) =>
      <div key={label}>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={"mt-1 text-sm sm:text-base " + (label === "合计" ? "font-semibold" : "font-medium")}>
          {value === null ? "—" : bytes(value)}
        </dd>
      </div>
    )}
  </dl>
}

function DayChart({ days, buckets, scope }: { days: string[]; buckets: Bucket[]; scope: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  if (!buckets.some(b => b.observed_nodes)) return <p className="weekly-note">近 7 天暂无流量记录</p>
  const up = buckets.reduce((sum, b) => sum + (b.tx ?? 0), 0)
  const down = buckets.reduce((sum, b) => sum + (b.rx ?? 0), 0)
  const partial = buckets.some(b => b.observed_nodes < b.expected_nodes || !b.observed_nodes)
  const maximum = Math.max(...buckets.map(total), 1)
  const unit = Math.min(Math.floor(Math.log(maximum) / Math.log(1024)), units.length - 1)
  const divisor = 1024 ** unit
  const peak = maximum / divisor
  const factor = 10 ** Math.floor(Math.log10(peak))
  // Round up to a whole tick at the magnitude of the largest daily total.
  const top = Math.ceil(peak / factor) * factor
  const ceiling = top * divisor
  const index = selected ? days.indexOf(selected) : -1
  const bucket = buckets[index]
  return <Dialog.Root open={dialogOpen && !!bucket} onOpenChange={setDialogOpen}>
    <div className="weekly-legend">
      <span><i className="weekly-up" />上传 <b>{bytes(up)}</b></span>
      <span><i className="weekly-down" />下载 <b>{bytes(down)}</b></span>
    </div>
    <div className="weekly-plot">
      <span className="weekly-unit">{units[unit]}</span>
      <div className="weekly-grid" aria-hidden="true">
        {[top, top/2, 0].map(n => <div key={n}><span>{shortNumber.format(n)}</span></div>)}
      </div>
      <div className="weekly-days">
        {days.map((day, i) => {
          const b = buckets[i]
          const sum = total(b)
          const dayNumber = Number(day.slice(8))
          const monthChanged = i === 0 || days[i - 1].slice(0,7) !== day.slice(0,7)
          const stamp = monthChanged ? Number(day.slice(5,7)) + "/" + dayNumber : String(dayNumber)
          return <button key={day} data-traffic-day={day} type="button" aria-haspopup="dialog" aria-expanded={dialogOpen && day === selected}
            aria-label={summary(day,b) + "，查看当日流量排行"} title={summary(day,b) + "，查看当日流量排行"}
            onClick={event => { opener.current = event.currentTarget; setSelected(day); setDialogOpen(true) }}>
            <span className="weekly-stack" style={{height: (100 * sum / ceiling) + "%"}}>
              <span className="weekly-amount">{b.observed_nodes ? barLabel(sum / divisor) : "—"}</span>
              {sum > 0 && <span className="weekly-fill"><i className="weekly-up" style={{flexGrow:b.tx! / sum}} />
                <i className="weekly-down" style={{flexGrow:b.rx! / sum}} /></span>}
            </span>
            <span className="weekly-date">{stamp}</span>
          </button>
        })}
      </div>
    </div>
    <p className="weekly-note">选择日期查看节点排行{partial && " · 仅统计有记录的流量"}</p>
    {bucket && <TrafficRankingContent title="当日流量排行" listLabel="当日节点流量排行"
      description={[
        days[index], scope,
        bucket.observed_nodes > 0 && (bucket.observed_nodes < bucket.expected_nodes
          ? bucket.observed_nodes + "/" + bucket.expected_nodes
          : bucket.observed_nodes) + " 台节点有记录",
        bucket.top_nodes && bucket.observed_nodes > 10 && "显示前 10 名",
      ].filter(Boolean).join(" · ")}
      summary={<DayTotals bucket={bucket} />}
      rows={bucket.observed_nodes ? bucket.top_nodes ?? [] : []}
      empty={!bucket.observed_nodes ? "当天没有流量记录" : !bucket.top_nodes ? "当前 Hub 未提供节点排行" : "当天没有可显示的节点"}
      onCloseAutoFocus={event => {
        if (opener.current?.isConnected) {
          event.preventDefault()
          opener.current.focus()
        }
      }} />}
  </Dialog.Root>
}

export function WeeklyTraffic({ selected, visible }: { selected: string | null; visible: boolean }) {
  const {week, error, reload} = useWeek(visible)
  if (!visible) return null
  const series = week && (selected ? week.regions[selected] : week.all)
  return <section id="fleet-tool-week" className="weekly-traffic" aria-label="近 7 天流量">
    <div className="weekly-heading">
      <ChartNoAxesColumn aria-hidden="true" /><h2>近 7 天流量</h2>
      <span>{selected ? regionLabel(selected) : "全部地区"}</span>
    </div>
    {error ? <p className="weekly-note" role="status">{error} <button type="button" onClick={reload}>重试</button></p> :
      !week ? <p className="weekly-note" role="status">正在加载流量…</p> :
      !series ? <p className="weekly-note">近 7 天暂无流量记录</p> :
      <DayChart key={selected ?? ""} days={week.days} buckets={series} scope={selected ? regionLabel(selected) : "全部地区"} />}
  </section>
}
