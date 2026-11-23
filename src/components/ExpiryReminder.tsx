import { CalendarClock } from "lucide-react"
import type { Node } from "@/lib/api"
import { daysUntil } from "@/lib/format"

export function ExpiryReminder({ nodes, onOpen }: { nodes: Node[]; onOpen: (id: number) => void }) {
  const upcoming = nodes.flatMap(node => {
    if (!node.public || node.permanent || !node.expires_at) return []
    const days = daysUntil(node.expires_at, node.expires_at_epoch, node.valuation_at, node.billing_timezone)
    if (days === null || days < 0 || days > 10) return []
    return [{ node, days, date: node.expires_at }]
  }).sort((a, b) => a.days - b.days || a.node.sort - b.node.sort || a.node.id - b.node.id)

  if (!upcoming.length) return null

  return <section className="expiry-dock" aria-labelledby="expiry-dock-title">
    <div className="expiry-dock-heading">
      <CalendarClock aria-hidden="true" />
      <h2 id="expiry-dock-title">临期提醒</h2>
      <span className="tnum">{upcoming.length} 台</span>
    </div>
    <ol className="expiry-dock-list">
      {upcoming.map(({ node, days, date }) => (
        <li key={node.id}>
          <button type="button" onClick={() => onOpen(node.id)} title={node.name}>
            <span className="expiry-dock-name">{node.name}</span>
            <strong data-urgent={days <= 1}>{days === 0 ? "今天到期" : days === 1 ? "明天到期" : `剩 ${days} 天`}</strong>
            <time dateTime={date} className="tnum">{date}</time>
          </button>
        </li>
      ))}
    </ol>
  </section>
}
