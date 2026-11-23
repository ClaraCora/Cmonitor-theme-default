import { Component, lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from "react"
import { ChevronDown, Earth } from "lucide-react"
import { regionLabel } from "@/lib/countries"
import { WeeklyTraffic } from "./WeeklyTraffic"
import "./node-map.css"

const WorldPlot = lazy(() => import("./WorldPlot"))
const wide = matchMedia("(min-width: 1800px) and (min-height: 640px)")
function watchWide(listener: () => void) {
  wide.addEventListener("change", listener)
  return () => wide.removeEventListener("change", listener)
}

class PlotBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed ? <p className="node-map-placeholder">底图加载失败，可使用首页的地区筛选。</p> : this.props.children
  }
}

type Props = {
  entries: [string, number][]
  total: number
  selected: string | null
  onPick: (code: string) => void
}

export function NodeMap({ entries, total, selected, onPick }: Props) {
  const docked = useSyncExternalStore(watchWide, () => wide.matches)
  const [expanded, setExpanded] = useState({ dock: true, inline: false })
  const mode = docked ? "dock" : "inline"
  const open = expanded[mode]
  const [hover, setHover] = useState<string | null>(null)
  const current = entries.find(([code]) => code === (hover ?? selected))
  const unknown = total - entries.reduce((sum, [, count]) => sum + count, 0)

  return <div className="geo-week-panels">
    <section className="node-map" aria-label="节点地图">
      <h2>
        <button className="node-map-heading" type="button" aria-label="节点地图" aria-expanded={open} aria-controls="node-map-body"
          onClick={() => { setExpanded(prev => ({ ...prev, [mode]: !prev[mode] })); setHover(null) }}>
          <Earth aria-hidden="true" />节点地图
          <span className="node-map-coverage tnum">{entries.length} 个地区</span>
          <ChevronDown aria-hidden="true" className="node-map-chevron" />
        </button>
      </h2>
      <div id="node-map-body" hidden={!open}>
        {open && (entries.length ? (
          <div className="node-map-atlas">
            <PlotBoundary>
              <Suspense fallback={<p className="node-map-placeholder">正在加载地图…</p>}>
                <WorldPlot entries={entries} selected={selected} active={current?.[0] ?? null} onHover={setHover} onPick={onPick} />
              </Suspense>
            </PlotBoundary>
            <p className="node-map-caption">
              <span className="node-map-key" aria-hidden="true" />
              <span>{current ? regionLabel(current[0]) + " · " + current[1] + " 台节点" : total + " 台公开节点"}</span>
              {unknown > 0 && <span>{unknown} 台未标注地区</span>}
            </p>
          </div>
        ) : (
          <p className="node-map-empty">{unknown ? unknown + " 台未标注地区" : "暂无公开节点"}</p>
        ))}
      </div>
    </section>
    <WeeklyTraffic selected={selected} visible={open} />
  </div>
}
