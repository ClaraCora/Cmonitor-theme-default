import { useEffect, useState } from "react"
import { Clock, Globe, MapPin, Monitor, Shield, User, X } from "lucide-react"

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
 * about itself. A card on the desktop's lower left, a pill on a phone's
 * bottom edge; dismissed for the rest of the session from the card.
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
    <>
      <aside className="fixed bottom-4 left-4 z-40 hidden w-64 rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-slate-100 shadow-xl backdrop-blur-md md:block">
        <div className="flex items-start gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-400 to-blue-600">
            <User className="size-5 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-violet-300">访客</div>
            <div className="truncate text-xs text-slate-300" title={place}>{place || "未知地区"}</div>
          </div>
          <button
            onClick={close}
            title="关闭"
            aria-label="关闭"
            className="rounded p-0.5 text-slate-400 transition-colors hover:text-white"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-2.5 border-b border-white/10 pb-2.5 text-sm">
          欢迎来自{visitor.city || country || "远方"}的你！
        </p>
        <ul className="mt-2.5 space-y-2 text-xs text-slate-300">
          {rows.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-center gap-2">
              <Icon className="size-3.5 shrink-0 text-slate-400" />
              <span className="truncate" title={text}>{text}</span>
            </li>
          ))}
        </ul>
      </aside>
      <div className="fixed bottom-3 left-1/2 z-40 flex max-w-[92vw] -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-slate-900/70 px-4 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur-md md:hidden">
        <Globe className="size-3.5 shrink-0 text-sky-400" />
        <span className="tnum">{visitor.ip}</span>
        {(visitor.city || country) && (
          <>
            <span className="text-slate-500">|</span>
            <span>{visitor.city || country}</span>
          </>
        )}
      </div>
    </>
  )
}
