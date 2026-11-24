import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, Trophy } from "lucide-react"

import { RankingDialog, RankNumber } from "./RankingDialog"
import { bytes } from "@/lib/format"
import { flagPath } from "@/lib/icons"
import { cn } from "@/lib/utils"

type RankingRow = {
  id: number
  name: string
  rx: number | null
  tx: number | null
  online?: boolean
  country?: string
}

type Props = {
  title: string
  description: string
  summary?: ReactNode
  rows: RankingRow[]
  empty: string
  listLabel: string
  onCloseAutoFocus: (event: Event) => void
}

function Volume({ label, value, icon }: { label: string; value: number | null; icon?: ReactNode }) {
  return <div className="min-w-0">
    <dt className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">{icon}{label}</dt>
    <dd className={cn("mt-0.5 text-sm whitespace-nowrap", icon ? "font-medium" : "font-semibold")}>
      {value === null ? "—" : bytes(value)}
    </dd>
  </div>
}

export function TrafficRankingContent({ title, description, summary, rows, empty, listLabel, onCloseAutoFocus }: Props) {
  return <RankingDialog title={title} description={description} summary={summary} icon={Trophy} onCloseAutoFocus={onCloseAutoFocus}>
    {rows.length === 0 ? (
      <p className="px-4 py-12 text-center text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ol className="divide-y" aria-label={listLabel}>
        {rows.map((node, index) => {
          const rank = index + 1
          const sum = node.rx === null || node.tx === null ? null : node.rx + node.tx
          return <li key={node.id} data-node-id={node.id} className="grid gap-3 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)] sm:items-center sm:px-3">
            <div className="flex min-w-0 items-center gap-3">
              <RankNumber rank={rank} />
              {node.online !== undefined && <span className={cn("size-2 shrink-0 rounded-full", node.online ? "bg-ok" : "bg-muted-foreground/45")}
                title={node.online ? "在线" : "离线"} aria-label={node.online ? "在线" : "离线"} />}
              {node.country && <img src={flagPath(node.country)} alt={node.country} title={node.country} loading="lazy"
                className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10" />}
              <span className="text-sm font-medium [overflow-wrap:anywhere]" title={node.name}>{node.name}</span>
            </div>
            <dl className="tnum grid grid-cols-3 gap-2 text-right">
              <Volume label="下载量" value={node.rx} icon={<ArrowDown aria-hidden="true" className="size-3" />} />
              <Volume label="上传量" value={node.tx} icon={<ArrowUp aria-hidden="true" className="size-3" />} />
              <Volume label="合计" value={sum} />
            </dl>
          </li>
        })}
      </ol>
    )}
  </RankingDialog>
}
