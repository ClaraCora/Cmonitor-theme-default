import { useRef, useState } from "react"
import { ChartNoAxesColumn, Earth, Trophy, UserRound } from "lucide-react"
import type { Node } from "@/lib/api"
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
  { key: "visitor", label: "访客", short: "访客", icon: UserRound },
] as const
type Tool = typeof tools[number]["key"]

type Props = {
  nodes: Node[]
  entries: [string, number][]
  selected: string | null
  onPick: (region: string) => void
  onOpenNode: (id: number) => void
  visitorEnabled: boolean
  compact: boolean
  setRankingHost: (host: HTMLDivElement | null) => void
}

export function FleetTools({ nodes, entries, selected, onPick, onOpenNode, visitorEnabled, compact, setRankingHost }: Props) {
  const { visitor, close } = useVisitor(visitorEnabled)
  const [active, setActive] = useState<Tool | null>(null)
  const rankButton = useRef<HTMLButtonElement>(null)
  const shown = (tool: Tool) => !compact || active === tool
  return <div className="fleet-tools">
    {compact && <div role="group" aria-label="首页工具" className="fleet-tool-switcher">
      {tools.filter(tool => tool.key !== "visitor" || visitor).map(({ key, label, short, icon: Icon }) => (
        <button key={key} type="button" ref={key === "rank" ? rankButton : undefined}
          aria-label={label} aria-expanded={active === key}
          aria-controls={active === key ? "fleet-tool-" + key : undefined}
          onClick={() => setActive(active === key ? null : key)}>
          <Icon aria-hidden="true" /><span>{short}</span>
        </button>
      ))}
    </div>}
    <div className="geo-week-panels">
      {shown("map") && <NodeMap compact={compact} entries={entries} total={nodes.length} selected={selected} onPick={onPick} />}
      <WeeklyTraffic visible={shown("week")} selected={selected} />
    </div>
    <div className="fleet-rail">
      <div className="fleet-rail-panels">
        <div id="fleet-tool-rank" className="fleet-ranking-slot" hidden={!shown("rank")} ref={setRankingHost} />
        <ExpiryReminder nodes={nodes} onOpen={onOpenNode} />
      </div>
      {visitor && shown("visitor") && <VisitorCard visitor={visitor} onClose={() => {
        close()
        if (compact) {
          setActive(null)
          rankButton.current?.focus()
        }
      }} />}
    </div>
  </div>
}
