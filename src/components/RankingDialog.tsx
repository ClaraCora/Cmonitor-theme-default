import type { ReactNode } from "react"
import { X, type LucideIcon } from "lucide-react"
import { Dialog } from "radix-ui"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const medals = ["bg-primary text-primary-foreground", "bg-secondary text-secondary-foreground", "bg-chart-3/20 text-foreground"]

export function RankNumber({ rank }: { rank: number }) {
  return <span className={cn("tnum grid size-7 shrink-0 place-items-center rounded-md text-xs font-semibold",
    medals[rank - 1] ?? "bg-muted text-muted-foreground")}>{rank}</span>
}

type Props = {
  title: string
  description: string
  icon: LucideIcon
  children: ReactNode
  summary?: ReactNode
  compact?: boolean
  onCloseAutoFocus?: (event: Event) => void
}

export function RankingDialog({ title, description, icon: Icon, children, summary, compact, onCloseAutoFocus }: Props) {
  return <Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none" />
    <Dialog.Content onCloseAutoFocus={onCloseAutoFocus} className={cn(
      "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none",
      compact ? "max-w-lg" : "max-w-3xl",
    )}>
      <div className="flex items-start gap-4 border-b px-4 py-4 sm:px-5">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon aria-hidden="true" className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <Dialog.Title className="font-semibold">{title}</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-muted-foreground">{description}</Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon-sm" aria-label={"关闭" + title}><X /></Button>
        </Dialog.Close>
      </div>
      {summary}
      <div className="min-h-0 overflow-y-auto overscroll-contain p-2 sm:p-3">{children}</div>
    </Dialog.Content>
  </Dialog.Portal>
}
