import { useEffect, useState } from "react"
import { Clock, Globe, MapPin, Monitor, Shield, X } from "lucide-react"

import { api } from "@/lib/api"

/** What the hub could tell about the caller: an address, and optionally geo. */
type Visitor = { ip: string; city?: string; region?: string; country?: string; org?: string }

/** Common country codes as names; anything less common shows the code itself. */
const COUNTRIES: Record<string, string> = {
  CN: "中国", HK: "香港", MO: "澳门", TW: "台湾", JP: "日本", KR: "韩国", SG: "新加坡",
  US: "美国", GB: "英国", DE: "德国", FR: "法国", NL: "荷兰", RU: "俄罗斯",
  AU: "澳大利亚", CA: "加拿大", IN: "印度", MY: "马来西亚", TH: "泰国", VN: "越南",
  PH: "菲律宾", ID: "印度尼西亚",
}

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

/**
 * Who is looking at the page, from their own perspective: their address and
 * approximate origin as the hub reported them, plus what their browser says
 * about itself. Collapsed into the page footer and dismissible on every screen
 * size for the rest of the browser session.
 */
export function VisitorCard() {
  const [visitor, setVisitor] = useState<Visitor | null>(null)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("visitor-card-off") === "1")
  useEffect(() => {
    // Silence on failure: this is a greeting, not a gate, and a status page
    // that cannot greet still works.
    api<Visitor>("/visitor").then(setVisitor).catch(() => {})
  }, [])
  if (dismissed || !visitor) return null

  const country = COUNTRIES[visitor.country ?? ""] ?? visitor.country
  const place = [visitor.city, country].filter((v, i, a) => v && a.indexOf(v) === i).join(", ")
  const ua = navigator.userAgent
  const rows: { icon: typeof Monitor; text: string }[] = [
    { icon: Monitor, text: osOf(ua) },
    { icon: Globe, text: browserOf(ua) },
    { icon: MapPin, text: visitor.ip },
    // ipinfo prefixes the ASN; the card wants the carrier's name.
    ...(visitor.org ? [{ icon: Shield, text: visitor.org.replace(/^AS\d+\s*/, "") }] : []),
    { icon: Clock, text: new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }) },
  ]
  const close = () => {
    sessionStorage.setItem("visitor-card-off", "1")
    setDismissed(true)
  }

  return (
    <aside className="mx-auto max-w-[1400px] px-4 pb-5 sm:px-6">
      <div className="flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground">
        <details className="min-w-0 flex-1">
          <summary className="cursor-pointer py-2">访客信息 · {place || "未知地区"}</summary>
          <ul className="grid gap-3 py-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(({icon: Icon,text},index) => <li key={index} className="flex min-w-0 items-center gap-2"><Icon className="size-4 shrink-0" /><span className="break-all">{text}</span></li>)}</ul>
        </details>
        <button type="button" onClick={close} aria-label="关闭访客信息" className="grid size-11 shrink-0 place-items-center rounded-md hover:bg-muted"><X className="size-4" /></button>
      </div>
    </aside>
  )
}
