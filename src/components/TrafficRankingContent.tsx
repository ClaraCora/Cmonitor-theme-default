import type { ReactNode } from "react"
import { ArrowDown, ArrowUp, Trophy, X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
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

function rankTone(rank: number): string {
  if (rank === 1) return "bg-primary text-primary-foreground"
  if (rank === 2) return "bg-secondary text-secondary-foreground"
  if (rank === 3) return "bg-chart-3/20 text-foreground"
  return "bg-muted text-muted-foreground"
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
  return <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <DialogPrimitive.Content onCloseAutoFocus={onCloseAutoFocus} className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none">
      <div className="flex items-start gap-4 border-b px-4 py-4 sm:px-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Trophy aria-hidden="true" className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
        </div>
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon-sm" aria-label={"关闭" + title}><X /></Button>
        </DialogPrimitive.Close>
      </div>
      {summary}
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-3">
        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ol className="divide-y" aria-label={listLabel}>
            {rows.map((node, index) => {
              const rank = index + 1
              const sum = node.rx === null || node.tx === null ? null : node.rx + node.tx
              return <li key={node.id} data-node-id={node.id} className="grid gap-3 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)] sm:items-center sm:px-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn("tnum grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold", rankTone(rank))}>{rank}</span>
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
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
}
