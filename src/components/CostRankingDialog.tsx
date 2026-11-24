import { ChevronRight, Wallet } from "lucide-react"
import { Dialog } from "radix-ui"

import { RankNumber, RankingDialog } from "./RankingDialog"

const moneyFormat = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMonthlyCny(amount: number): string {
  return moneyFormat.format(amount)
}

type Props = {
  rows: { id: number; name: string; cny: number }[]
  omitted: number
  onOpenNode: (id: number) => void
}

export function CostRankingDialog({ rows, omitted, onOpenNode }: Props) {
  const description = `按套餐价格折算人民币月费（CNY），已计入 ${rows.length} 台 VPS${omitted ? `，另有 ${omitted} 台未计入` : ""}。`
  return <RankingDialog title="本月消费排行" icon={Wallet} compact description={description}>
    {rows.length ? <ol aria-label="节点月费排行" className="divide-y">
      {rows.map(({ id, name, cny }, index) => <li key={id}>
        <Dialog.Close asChild>
          <button type="button" onClick={() => onOpenNode(id)}
            className="grid min-h-12 w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:gap-3 sm:px-3">
            <RankNumber rank={index + 1} />
            <span className="text-sm font-medium [overflow-wrap:anywhere]">{name || `VPS #${id}`}</span>
            <strong className="tnum whitespace-nowrap text-sm font-semibold">{formatMonthlyCny(cny)}</strong>
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </button>
        </Dialog.Close>
      </li>)}
    </ol> : <p className="px-4 py-12 text-center text-sm text-muted-foreground">暂无可计算月费的节点</p>}
  </RankingDialog>
}
