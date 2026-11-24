import { ArrowRight, Wallet } from "lucide-react"
import { Dialog } from "radix-ui"

import type { ExchangeState } from "@/lib/useExchangeRates"
import { valueInCny, type MonthlyPlan } from "@/lib/value"
import { CostRankingDialog, formatMonthlyCny } from "./CostRankingDialog"
import "./traffic-dock.css"

type Props = {
  plans: MonthlyPlan[]
  nodeCount: number
  exchange: ExchangeState
  onOpenNode: (id: number) => void
}

export function CostRanking({ plans, nodeCount, exchange, onOpenNode }: Props) {
  const ranked = plans.flatMap(({ id, name, currency, monthly }) => {
    const cny = valueInCny([[currency, monthly]], exchange.rates?.rates).total
    return cny === null ? [] : [{ id, name, cny }]
  }).sort((a, b) => b.cny - a.cny)
  const needsExchange = plans.some(plan => plan.currency !== "CNY")
  const omitted = nodeCount - ranked.length
  let empty = "暂无可计费节点"
  if (plans.length) {
    if (exchange.failed && !exchange.rates) empty = "暂无可用汇率"
    else if (needsExchange && !exchange.rates) empty = "正在获取汇率…"
    else empty = "暂无可换算的月费"
  }

  return <Dialog.Root>
    <section id="fleet-tool-cost" className="traffic-dock cost-dock" aria-label="本月消费排行榜">
      <h2 className="traffic-dock-heading">
        <Wallet aria-hidden="true" />
        <span>本月消费排行</span>
        <span className="cost-dock-unit">CNY / 月</span>
      </h2>
      <p className="traffic-dock-caption">{needsExchange && exchange.rates ? `按月折算 · 汇率 ${exchange.rates.date}` : "按月折算"}</p>
      {ranked.length ? (
        <ol className="traffic-dock-list cost-dock-list">
          {ranked.slice(0, 5).map((entry, index) => (
            <li key={entry.id}>
              <button type="button" className="cost-dock-row" onClick={() => onOpenNode(entry.id)} title={`查看 ${entry.name}`}>
                <span className="traffic-dock-rank tnum">{index + 1}</span>
                <span className="traffic-dock-name">{entry.name}</span>
                <strong className="traffic-dock-value tnum">{formatMonthlyCny(entry.cny)}</strong>
                <span className="traffic-dock-track" aria-hidden="true">
                  <span style={{ width: `${ranked[0].cny ? entry.cny / ranked[0].cny * 100 : 0}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="traffic-dock-empty" role="status">{empty}</p>
      )}
      {omitted > 0 && ranked.length > 0 && <p className="cost-dock-note">另有 {omitted} 台未计入</p>}
      {exchange.failed && needsExchange && <button type="button" className="traffic-dock-more" onClick={exchange.retry} disabled={exchange.loading}>
        {exchange.rates ? "使用缓存汇率，重试" : "汇率获取失败，重试"} <ArrowRight aria-hidden="true" />
      </button>}
      {ranked.length > 0 && <Dialog.Trigger asChild>
        <button type="button" className="traffic-dock-more">查看完整排行榜 <ArrowRight aria-hidden="true" /></button>
      </Dialog.Trigger>}
    </section>
    <CostRankingDialog rows={ranked} omitted={omitted} onOpenNode={onOpenNode} />
  </Dialog.Root>
}
