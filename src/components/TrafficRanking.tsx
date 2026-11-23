import { useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ArrowRight, ChartNoAxesColumnDecreasing, ChevronDown, ChevronUp, Trophy } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { bytes } from "@/lib/format"
import { TrafficRankingContent } from "./TrafficRankingContent"
import type { Node } from "@/lib/api"
import { readPreference, savePreference } from "@/lib/storage"
import "./traffic-dock.css"

function total(node: Node): number | null {
  return Number.isFinite(node.day_rx) && Number.isFinite(node.day_tx) ? node.day_rx + node.day_tx : null
}

/** Every public VPS ranked by the traffic booked to the current calendar day. */
export function TrafficRanking({ nodes, dockHost, stale, compact, headerTrigger }: {
  nodes: Node[]
  dockHost: HTMLElement | null
  stale: boolean
  compact: boolean
  headerTrigger: boolean
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => readPreference("traffic-rank-collapsed", true) === "1")
  const dockOpener = useRef<HTMLButtonElement | null>(null)
  const ranked = [...nodes].sort((a, b) => (total(b) ?? -1) - (total(a) ?? -1) || a.sort - b.sort || a.id - b.id)
  const combined = ranked.reduce((sum, node) => sum + (total(node) ?? 0), 0)
  const leader = ranked.length ? total(ranked[0]) : null
  const toggleDock = () => {
    setCollapsed(!collapsed)
    savePreference("traffic-rank-collapsed", collapsed ? "0" : "1", true)
  }

  return (
    <DialogPrimitive.Root open={dialogOpen} onOpenChange={setDialogOpen}>
      {headerTrigger && <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="sm">
          <Trophy />
          <span className="hidden sm:inline">今日流量排行</span>
          <span className="sm:hidden">排行</span>
        </Button>
      </DialogPrimitive.Trigger>}

      {dockHost && createPortal(
        <aside className="traffic-dock" aria-label="今日流量排行浮窗">
          {compact ? <h2 className="traffic-dock-heading">
            <ChartNoAxesColumnDecreasing aria-hidden="true" />今日流量排行
          </h2> : <button type="button" className="traffic-dock-heading" onClick={toggleDock}
            aria-expanded={!collapsed} aria-controls="traffic-dock-body"
            aria-label={collapsed ? "展开今日流量排行" : "收起今日流量排行"}>
            <ChartNoAxesColumnDecreasing aria-hidden="true" />
            <span>今日流量排行</span>
            {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>}
          <div id="traffic-dock-body" hidden={!compact && collapsed}>
            <p className="traffic-dock-caption">{stale ? "更新中断 · 上次数据" : "上传 + 下载"}</p>
            {ranked.length ? (
              <ol className="traffic-dock-list">
                {ranked.slice(0, 5).map((node, index) => {
                  const value = total(node)
                  return <li key={node.id}>
                    <span className="traffic-dock-rank tnum" aria-hidden="true">{index + 1}</span>
                    <span className="traffic-dock-name" title={node.name}>{node.name}</span>
                    <strong className="traffic-dock-value tnum">{value === null ? "—" : bytes(value)}</strong>
                    <span className="traffic-dock-track" aria-hidden="true">
                      <span style={{ width: `${leader && value ? value / leader * 100 : 0}%` }} />
                    </span>
                  </li>
                })}
              </ol>
            ) : <p className="traffic-dock-empty">暂无公开节点</p>}
            <button type="button" className="traffic-dock-more" aria-haspopup="dialog"
              onClick={event => { dockOpener.current = event.currentTarget; setDialogOpen(true) }}>
              查看完整排行 <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </aside>, dockHost)}

      <TrafficRankingContent title="今日流量排行" listLabel="今日节点流量排行"
        description={"按上传量与下载量总和排序 · " + ranked.length + " 台 VPS 共 " + bytes(combined)}
        empty="还没有可显示的 VPS"
        rows={dialogOpen ? ranked.map(node => ({
          id: node.id, name: node.name, country: node.country, online: node.online,
          rx: Number.isFinite(node.day_rx) ? node.day_rx : null,
          tx: Number.isFinite(node.day_tx) ? node.day_tx : null,
        })) : []}
        onCloseAutoFocus={event => {
          if (dockOpener.current?.getClientRects().length) {
            event.preventDefault()
            dockOpener.current.focus()
          }
          dockOpener.current = null
        }} />
    </DialogPrimitive.Root>
  )
}
