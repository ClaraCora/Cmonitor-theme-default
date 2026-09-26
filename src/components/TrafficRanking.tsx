import { ArrowDown, ArrowUp, Trophy, X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { bytes } from "@/lib/format"
import { flagPath } from "@/lib/icons"
import { cn } from "@/lib/utils"
import type { Node } from "@/lib/api"

function total(node: Node): number {
  return node.day_rx + node.day_tx
}

function rankTone(rank: number): string {
  if (rank === 1) return "bg-primary text-primary-foreground"
  if (rank === 2) return "bg-secondary text-secondary-foreground"
  if (rank === 3) return "bg-chart-3/20 text-foreground"
  return "bg-muted text-muted-foreground"
}

/** Every public VPS ranked by the traffic booked to the current calendar day. */
export function TrafficRanking({ nodes }: { nodes: Node[] }) {
  const ranked = [...nodes].sort((a, b) => total(b) - total(a) || a.sort - b.sort || a.id - b.id)
  const combined = ranked.reduce((sum, node) => sum + total(node), 0)

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="sm">
          <Trophy />
          <span className="hidden sm:inline">今日流量排行</span>
          <span className="sm:hidden">排行</span>
        </Button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none">
          <div className="flex items-start gap-4 border-b px-4 py-4 sm:px-5">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <Trophy className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="font-semibold">今日流量排行</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                按上传量与下载量总和排序 · {ranked.length} 台 VPS 共 {bytes(combined)}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="关闭今日流量排行">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="min-h-0 overflow-y-auto p-2 sm:p-3">
            {ranked.length === 0 ? (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">还没有可显示的 VPS</p>
            ) : (
              <ol className="divide-y">
                {ranked.map((node, index) => {
                  const rank = index + 1
                  return (
                    <li key={node.id} className="grid gap-3 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.9fr)] sm:items-center sm:px-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn("tnum grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold", rankTone(rank))}>
                          {rank}
                        </span>
                        <span
                          className={cn("size-2 shrink-0 rounded-full", node.online ? "bg-ok" : "bg-muted-foreground/45")}
                          title={node.online ? "在线" : "离线"}
                          aria-label={node.online ? "在线" : "离线"}
                        />
                        {node.country && (
                          <img
                            src={flagPath(node.country)}
                            alt={node.country}
                            title={node.country}
                            loading="lazy"
                            className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover ring-1 ring-black/10"
                          />
                        )}
                        <span className="truncate text-sm font-medium" title={node.name}>{node.name}</span>
                      </div>

                      <dl className="tnum grid grid-cols-3 gap-2 text-right">
                        <div className="min-w-0">
                          <dt className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                            <ArrowDown className="size-3" /> 下载量
                          </dt>
                          <dd className="mt-0.5 truncate text-sm font-medium" title={bytes(node.day_rx)}>{bytes(node.day_rx)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
                            <ArrowUp className="size-3" /> 上传量
                          </dt>
                          <dd className="mt-0.5 truncate text-sm font-medium" title={bytes(node.day_tx)}>{bytes(node.day_tx)}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-[11px] text-muted-foreground">总和</dt>
                          <dd className="mt-0.5 truncate text-sm font-semibold" title={bytes(total(node))}>{bytes(total(node))}</dd>
                        </div>
                      </dl>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
