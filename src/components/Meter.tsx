import type { ReactNode } from "react"

type Props = { label: ReactNode; pct: number | null; foot: ReactNode; empty?: ReactNode; tone?: string; icon?: ReactNode }

/** A Lumina-style segmented capacity bar: 24 notches, the filled share in the
 * metric's own hue. */
const SEGMENTS = 24

/**
 * One metric: name and percentage on top, bar in the middle, raw numbers
 * underneath. Each capacity has its own hue; the bar and its percentage share
 * it, so the eye matches figure to bar before reading either.
 */
export function Meter({ label, pct, foot, empty = "—", tone = "var(--color-primary)", icon }: Props) {
  // null means the metric has no ceiling to fill, so the bar stays empty rather
  // than reporting 0%. What replaces the percentage depends on the reason:
  // unknown for a node with no metrics, ∞ for a plan with no limit.
  const filled = pct === null ? 0 : Math.min(100, Math.max(0, pct))
  const notches = Math.round((filled / 100) * SEGMENTS)
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="tnum text-xs font-medium" style={{ color: tone }}>
          {pct === null ? empty : `${filled < 10 ? filled.toFixed(1) : filled.toFixed(0)}%`}
        </span>
      </div>
      <div className="mt-1.5 flex gap-[3px]" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="h-1.5 min-w-0 flex-1 rounded-full bg-muted transition-colors duration-500"
            style={i < notches ? { background: tone } : undefined}
          />
        ))}
      </div>
      <div className="tnum mt-1.5 truncate text-xs text-muted-foreground">{foot}</div>
    </div>
  )
}
