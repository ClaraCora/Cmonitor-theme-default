import { readPreference, savePreference } from "@/lib/storage"
import { useEffect, useState } from "react"
import { Clock, Globe, MapPin, Monitor, Shield, User, X } from "lucide-react"

import { api } from "@/lib/api"
import { regionLabel } from "@/lib/countries"

/** What the hub could tell about the caller: an address, and optionally geo. */
export type Visitor = { ip: string; city?: string; region?: string; country?: string; org?: string }

function osOf(ua: string): string {
  if (/windows/i.test(ua)) return "Windows"
  if (/android/i.test(ua)) return "Android"
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS"
  if (/mac os x/i.test(ua)) return "macOS"
  if (/harmonyos/i.test(ua)) return "HarmonyOS"
  if (/linux/i.test(ua)) return "Linux"
  return "未知系统"
}

function browserOf(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge"
  if (/opr\/|opera/i.test(ua)) return "Opera"
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet"
  if (/firefox|fxios/i.test(ua)) return "Firefox"
  if (/chrome|chromium|crios/i.test(ua)) return "Chrome"
  if (/safari/i.test(ua)) return "Safari"
  return "未知浏览器"
}

/** Visitor details are optional; remember dismissal for the current browser session. */
export function useVisitor(enabled: boolean) {
  const [visitor, setVisitor] = useState<Visitor | null>(null)
  const [dismissed, setDismissed] = useState(() => readPreference("visitor-card-off", true) === "1")
  useEffect(() => {
    if (!enabled || dismissed || visitor) return
    const controller = new AbortController()
    api<Visitor>("/visitor", { signal: controller.signal })
      .then(data => {
        if (!controller.signal.aborted && data?.ip) setVisitor(data)
      })
      .catch(() => {}) // A failed lookup leaves the space to the other panels.
    return () => controller.abort()
  }, [enabled, dismissed, visitor])

  function close() {
    savePreference("visitor-card-off", "1", true)
    setDismissed(true)
  }
  return { visitor: enabled && !dismissed ? visitor : null, close }
}

export function VisitorCard({ visitor, onClose }: { visitor: Visitor; onClose: () => void }) {
  const country = visitor.country ? regionLabel(visitor.country) : ""
  const place = [visitor.city, country].filter((v, i, all) => v && all.indexOf(v) === i).join(", ") || "未知地区"
  const ua = navigator.userAgent
  const rows: { icon: typeof Monitor; text: string }[] = [
    { icon: Monitor, text: osOf(ua) },
    { icon: Globe, text: browserOf(ua) },
    { icon: MapPin, text: visitor.ip },
    // ipinfo prefixes the ASN; the card wants the carrier's name.
    ...(visitor.org ? [{ icon: Shield, text: visitor.org.replace(/^AS\d+\s*/, "") }] : []),
    { icon: Clock, text: new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) },
  ]
  return (
    <aside id="fleet-tool-visitor" aria-label="来访者信息" className="visitor-desktop">
      <div className="visitor-heading">
        <span className="visitor-icon" aria-hidden="true"><User /></span>
        <div className="min-w-0 flex-1">
          <h2 className="visitor-title">访客</h2>
          <div className="visitor-secondary truncate" title={place}>{place}</div>
        </div>
        <button type="button" onClick={onClose} title="关闭" aria-label="关闭访客信息" className="visitor-close">
          <X aria-hidden="true" />
        </button>
      </div>
      <ul className="visitor-list">
        {rows.map(({ icon: Icon, text }, i) => (
          <li key={i}>
            <Icon aria-hidden="true" />
            <span className="truncate" title={text}>{text}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
