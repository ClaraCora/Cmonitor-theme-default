import { useState } from "react"
import { ChartNoAxesColumn, Earth, Trophy, Wallet } from "lucide-react"
import type { Node } from "@/lib/api"
import type { ExchangeState } from "@/lib/useExchangeRates"
import type { MonthlyPlan } from "@/lib/value"
import { CostRanking } from "./CostRanking"
import { ExpiryReminder } from "./ExpiryReminder"
import { NodeMap } from "./NodeMap"
import { WeeklyTraffic } from "./WeeklyTraffic"
import { useVisitor, VisitorCard } from "./VisitorCard"
import "./fleet-tools.css"

const compactQuery = matchMedia("(width < 1024px)")
export const compactLayout = {
  matches: () => compactQuery.matches,
  subscribe(listener: () => void) {
    compactQuery.addEventListener("change", listener)
    return () => compactQuery.removeEventListener("change", listener)
  },
}

const tools = [
  { key: "map", label: "节点地图", short: "地图", icon: Earth },
  { key: "week", label: "近 7 天流量", short: "近 7 天", icon: ChartNoAxesColumn },
  { key: "rank", label: "今日流量排行", short: "今日排行", icon: Trophy },
  { key: "cost", label: "本月消费排行", short: "月消费", icon: Wallet },
] as const
type Tool = typeof tools[number]["key"]

type Props = {
  nodes: Node[]
  plans: MonthlyPlan[]
  exchange: ExchangeState
  entries: [string, number][]
  selected: string | null
  onPick: (region: string) => void
  onOpenNode: (id: number) => void
  visitorEnabled: boolean
  compact: boolean
  setRankingHost: (host: HTMLDivElement | null) => void
}

export function FleetTools({ nodes, plans, exchange, entries, selected, onPick, onOpenNode, visitorEnabled, compact, setRankingHost }: Props) {
  const { visitor, close } = useVisitor(visitorEnabled)
  const [active, setActive] = useState<Tool | null>(null)
  const shown = (tool: Tool) => !compact || active === tool
  return <div className="fleet-tools">
    {compact && <div role="group" aria-label="首页工具" className="fleet-tool-switcher">
      {tools.map(({ key, label, short, icon: Icon }) => (
        <button key={key} type="button"
          aria-label={label} aria-expanded={active === key}
          aria-controls={active === key ? "fleet-tool-" + key : undefined}
          onClick={() => setActive(active === key ? null : key)}>
          <Icon aria-hidden="true" /><span>{short}</span>
        </button>
      ))}
    </div>}
    <div className="geo-week-panels">
      <div className="geo-week-overview">
        {shown("map") && <NodeMap compact={compact} entries={entries} total={nodes.length} selected={selected} onPick={onPick} />}
        <WeeklyTraffic visible={shown("week")} selected={selected} />
      </div>
      {shown("cost") && <CostRanking plans={plans} nodeCount={nodes.length} exchange={exchange} onOpenNode={onOpenNode} />}
    </div>
    <div className="fleet-rail">
      <div className="fleet-rail-panels">
        <div id="fleet-tool-rank" className="fleet-ranking-slot" hidden={!shown("rank")} ref={setRankingHost} />
        {shown("rank") && <ExpiryReminder nodes={nodes} onOpen={onOpenNode} />}
      </div>
      {visitor && <VisitorCard visitor={visitor} onClose={close} />}
    </div>
  </div>
}
