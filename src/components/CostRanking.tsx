import { useState } from "react"
import { ArrowRight, Wallet } from "lucide-react"
import { Dialog } from "radix-ui"

import type { Node } from "@/lib/api"
import type { ExchangeState } from "@/lib/useExchangeRates"
import { monthlyRanking, type MonthlyPlan } from "@/lib/value"
import { CostRankingDialog, formatMonthlyCny } from "./CostRankingDialog"
import "./traffic-dock.css"

type Props = {
  nodes: Node[]
  plans: MonthlyPlan[]
  presetTags: string[]
  exchange: ExchangeState
  onOpenNode: (id: number) => void
}

export function CostRanking({ nodes, plans, presetTags, exchange, onOpenNode }: Props) {
  const [selection, setSelection] = useState<string | null>(null)
  const tag = selection !== null && presetTags.includes(selection) ? selection : null
  const { rows, total, omitted, nodeCount, needsExchange } = monthlyRanking(nodes, plans, tag, exchange.rates?.rates)
  let empty = tag && !nodeCount ? "此标签下暂无公开节点" : "暂无可计费节点"
  if (needsExchange && !rows.length) {
    if (exchange.rates) empty = "暂无可换算的月费"
    else empty = exchange.failed ? "暂无可用汇率" : "正在获取汇率…"
  }
  const summary = <div className="cost-summary">
    {presetTags.length > 0 && <div role="group" aria-label="消费排行标签" className="cost-tags">
      {[null, ...presetTags].map(option => <button key={option === null ? "all" : "tag:" + option}
        type="button" aria-pressed={tag === option} title={option ?? "全部公开节点"}
        onClick={() => setSelection(option)}>{option ?? "全部"}</button>)}
    </div>}
    <p className="cost-total" role="status" aria-label="月费合计">
      <span>{omitted > 0 && rows.length > 0 ? "已计入小计" : "月费合计"}</span>
      <strong className="tnum">{total === null ? "—" : formatMonthlyCny(total)}</strong>
    </p>
  </div>
  const retry = exchange.failed && needsExchange && <button type="button" className="traffic-dock-more cost-retry" onClick={exchange.retry} disabled={exchange.loading}>
    {exchange.rates ? "使用缓存汇率，重试" : "汇率获取失败，重试"} <ArrowRight aria-hidden="true" />
  </button>

  return <Dialog.Root>
    <section id="fleet-tool-cost" className="traffic-dock cost-dock" aria-label="本月消费排行榜">
      <h2 className="traffic-dock-heading">
        <Wallet aria-hidden="true" />
        <span>本月消费排行</span>
        <span className="cost-dock-unit">CNY / 月</span>
      </h2>
      {summary}
      {rows.length ? (
        <ol className="traffic-dock-list cost-dock-list">
          {rows.slice(0, 5).map((entry, index) => (
            <li key={entry.id}>
              <button type="button" className="cost-dock-row" onClick={() => onOpenNode(entry.id)} title={`查看 ${entry.name}`}>
                <span className="traffic-dock-rank tnum">{index + 1}</span>
                <span className="traffic-dock-name">{entry.name}</span>
                <strong className="traffic-dock-value tnum">{formatMonthlyCny(entry.cny)}</strong>
                <span className="traffic-dock-track" aria-hidden="true">
                  <span style={{ width: `${rows[0].cny ? entry.cny / rows[0].cny * 100 : 0}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="traffic-dock-empty">{empty}</p>
      )}
      <p className="cost-dock-note">
        {needsExchange && exchange.rates ? `汇率 ${exchange.rates.date}` : "按月折算"}
        {omitted > 0 && ` · ${omitted} 台未计入`}
      </p>
      {retry}
      {nodes.length > 0 && <Dialog.Trigger asChild>
        <button type="button" className="traffic-dock-more">查看完整排行榜 <ArrowRight aria-hidden="true" /></button>
      </Dialog.Trigger>}
    </section>
    <CostRankingDialog rows={rows} omitted={omitted} onOpenNode={onOpenNode}
      summary={<div className="cost-dialog-summary">{summary}{retry}</div>} empty={empty} />
  </Dialog.Root>
}
