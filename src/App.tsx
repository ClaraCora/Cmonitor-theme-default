import { readPreference, savePreference } from "@/lib/storage"
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { Moon, Sun, Tag, Wrench } from "lucide-react"

import { NodeCard } from "@/components/NodeCard"
import { Summary } from "@/components/Summary"
import { TrafficRanking } from "@/components/TrafficRanking"
import { VisitorCard } from "@/components/VisitorCard"
import { flagPath } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes, type Node } from "@/lib/api"
import { hasTag, parsePresetTags } from "@/lib/tags"

// `admin_url` is sent only to a signed-in caller, which is what lets the entry
// exist here without the path ever reaching the public bundle.
type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean; admin_url?: string; visitor_card?: boolean; preset_tag?: string }

// Split out because recharts is most of this bundle and the list page draws no
// chart. The landing page is 242 kB rather than 629 kB (77 kB gzipped against
// 188 kB), with the rest fetched immediately after it paints.
const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

// `/node/{id}` is a real page: it survives a reload, can be linked to, and back
// leaves the detail view rather than the site. The hub serves index.html for any
// unknown path, so no server-side route is required.
function useNodeRoute() {
  const read = () => {
    const match = location.pathname.match(/^\/node\/(\d+)/)
    return match ? Number(match[1]) : null
  }
  const [id, setId] = useState(read)
  const listScroll = useRef(0)
  useEffect(() => {
    const sync = () => { setId(read()); requestAnimationFrame(() => scrollTo(0, history.state?.scrollY ?? 0)) }
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    // The tab is a query rather than part of the path: it names which view of
    // the node a link opens, and the detail page reads it once on mount.
    (next: number | null, tab?: "latency") => {
      if (id === null) listScroll.current = scrollY
      history.replaceState({ ...history.state, scrollY }, "")
      const query = new URLSearchParams(location.search)
      query.delete("tab"); query.delete("range")
      if (tab === "latency") query.set("tab", "latency")
      const suffix = query.size ? `?${query}` : ""
      const targetScroll = next === null ? listScroll.current : 0
      history.pushState({ scrollY: targetScroll }, "", `${next === null ? "/" : `/node/${next}`}${suffix}`)
      setId(next)
      requestAnimationFrame(() => scrollTo(0, targetScroll))
    },
  ] as const
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = readPreference("theme")
    return saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    savePreference("theme", dark ? "dark" : "light")
  }, [dark])
  return [dark, () => setDark((d) => !d)] as const
}

type Filters = { region: string | null; tag: string | null; status: string }

function readFilters(): Filters {
  const p = new URLSearchParams(location.search)
  const status = p.get("status") ?? "all"
  const tag = p.get("tag") || null
  return { region: tag ? null : p.get("region"), tag, status: ["online", "offline", "probe"].includes(status) ? status : "all" }
}

/** Preset labels and countries share one selection, with status alongside. */
function FleetFilters({ nodes, presetTags, filters, onPick }: {
  nodes: Node[]
  presetTags: string[]
  filters: Filters
  onPick: (patch: Partial<Filters>) => void
}) {
  const { region, tag, status } = filters
  const counts = new Map<string, number>()
  for (const n of nodes) if (n.country) counts.set(n.country, (counts.get(n.country) ?? 0) + 1)
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const chip = (active: boolean) =>
    `inline-flex min-h-11 max-w-full items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-9 ${
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`
  return (
    <div aria-label="节点筛选" role="group" className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card p-2 shadow-sm backdrop-blur-md">
      {presetTags.map(presetTag => (
        <button key={presetTag} aria-pressed={tag === presetTag} onClick={() => onPick({ tag: tag === presetTag ? null : presetTag, region: null })} className={chip(tag === presetTag)}>
          <Tag aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 break-all text-left">{presetTag}</span>
          <span className="tnum shrink-0">{nodes.filter(n => hasTag(n.tags, presetTag)).length}</span>
        </button>
      ))}
      <button aria-pressed={!region && !tag} onClick={() => onPick({ region: null, tag: null })} className={chip(!region && !tag)}>
        全部 <span className="tnum">{nodes.length}</span>
      </button>
      {entries.map(([cc, n]) => (
        <button key={cc} aria-pressed={region === cc} onClick={() => onPick({ region: region === cc ? null : cc, tag: null })} className={chip(region === cc)} title={cc}>
          <img
            src={flagPath(cc)}
            alt=""
            loading="lazy"
            className="h-3 w-[18px] rounded-[2px] object-cover ring-1 ring-black/10"
          />
          {cc} <span className="tnum">{n}</span>
        </button>
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <select aria-label="节点状态" value={status} onChange={e => onPick({ status: e.target.value })} className="min-h-11 rounded-lg border bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9">
          <option value="all">全部状态</option><option value="online">在线</option><option value="offline">离线</option><option value="probe">探测异常</option>
        </select>
        {(region || tag || status !== "all") && <Button variant="ghost" size="sm" onClick={() => onPick({ region: null, tag: null, status: "all" })}>清除筛选</Button>}
      </div>
    </div>
  )
}

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed, stale, lastUpdatedAt, connection } = useNodes()
  const [open, go] = useNodeRoute()
  const [filters, setFilters] = useState(readFilters)
  const presetTags = parsePresetTags(me?.preset_tag)
  const { region, status } = filters
  // An old bookmark cannot keep filtering by a preset the operator removed.
  const tag = filters.tag && presetTags.includes(filters.tag) ? filters.tag : null
  const pick = (patch: Partial<typeof filters>) => {
    const next = { ...filters, tag, ...patch }
    const p = new URLSearchParams(location.search)
    p.delete("q")
    for (const [key, value] of Object.entries(next)) {
      if (!value || (key === "status" && value === "all")) p.delete(key); else p.set(key, value)
    }
    history.replaceState(history.state, "", `${location.pathname}${p.size ? `?${p}` : ""}`)
    setFilters(next)
  }
  useEffect(() => {
    // Name/tag search has been removed, including its old bookmark parameter.
    const p = new URLSearchParams(location.search)
    if (p.has("q")) {
      p.delete("q")
      history.replaceState(history.state, "", `${location.pathname}${p.size ? `?${p}` : ""}`)
    }
    const sync = () => setFilters(readFilters())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])

  const loadMe = useCallback(() => {
    // `|| "..."` because an empty message reads as no error: api() falls back to
    // res.statusText, which HTTP/2 and HTTP/3 removed, so a bodiless 502 from a
    // proxy arrives as "". The check below would then take the loading branch and
    // the retry button would never render.
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message || "网络错误"))
  }, [])

  useEffect(() => {
    loadMe()
    // Warmed here rather than left to Suspense, which requests the chunk only
    // once a render reaches the detail view, itself waiting on /me. Without this
    // the split trades its first paint for a full-page skeleton over the first
    // node opened: 2.6s click-to-chart on 4G against 1.4s unsplit, 1.7s warm.
    void loadDetail()
  }, [loadMe])

  // The status page was closed while this tab was open. `me` holds whatever it
  // reported at load, so it is re-queried and the closed notice below replaces
  // the stale list.
  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  // The status page is the public view for everyone: a node the panel hides
  // stays hidden even for a signed-in operator, whose complete list lives in
  // the panel rather than here.
  const sorted = [...(nodes ?? [])].filter((n) => n.public).sort((a, b) => a.sort - b.sort || a.id - b.id)
  const selected = sorted.find((n) => n.id === open)
  const shown = sorted.filter(n => (!region || n.country === region)
    && (!tag || hasTag(n.tags, tag))
    && (status === "all" || status === "online" && n.online || status === "offline" && !n.online
      || status === "probe" && n.pings?.some(p => p.status === "stale" || p.status === "failed" || p.latency !== null && p.latency < 0)))

  // `/node/{id}` is a page people bookmark and share, so the tab needs the node's
  // name. The site name rather than a fixed string, since the hub lets an operator
  // rename the site.
  useEffect(() => {
    // oxlint-disable-next-line react/immutability
    document.title = [selected?.name, me?.site_name || "Monitor"].filter(Boolean).join(" · ")
  }, [selected?.name, me?.site_name])

  // Only while there is nothing else to show. Once `me` has loaded, a later
  // failure belongs beside the page rather than over it.
  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? <div className="space-y-3 text-center"><p role="alert">加载失败：{meError}</p><Button onClick={loadMe}>重试</Button></div> : "加载中…"}
    </div>
  )

  // The status page is closed and nobody is signed in. Fresh visits never get
  // this far -- the hub redirects them to sign in -- but a tab open across the
  // switch lands here as its polls start failing.
  if (!me.public_page && !me.authed) {
    return (
      <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
        状态页未公开
      </div>
    )
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-1.5 px-4 py-3 sm:gap-3 sm:px-6">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. */}
          <button className="flex min-w-0 flex-1 items-center gap-2 font-semibold transition-opacity hover:opacity-70" onClick={() => go(null)}>
            <img src="/favicon.svg" alt="" className="size-5 rounded-md" />
            <span className="truncate">{me.site_name || "Monitor"}</span>
          </button>
          <TrafficRanking nodes={sorted} />
          {/* The hub names the panel only to a signed-in caller, so the path
              never appears in the bundle an anonymous visitor downloads. */}
          {me.authed && me.admin_url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={me.admin_url}>
                <Wrench />
                <span className="hidden sm:inline">进入后台</span>
                <span className="sr-only sm:hidden">进入后台</span>
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-4 sm:px-6">
        {stale && <div role="status" className="rounded-lg border p-3 text-sm">数据更新中断，以下为最近一次收到的状态（{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("zh-CN") : "—"}）。正在尝试重新连接。</div>}
        {!stale && lastUpdatedAt && <p className="text-xs text-muted-foreground">{connection === "live" ? "实时更新" : "轮询更新"} · 最近更新 {new Date(lastUpdatedAt).toLocaleTimeString("zh-CN")}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <Suspense fallback={<Skeleton className="h-96" />}>
              <NodeDetail node={selected} />
            </Suspense>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              节点不存在或未公开。<button className="underline" onClick={() => go(null)}>返回列表</button>
            </p>
          )
        ) : !nodes ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        ) : (
          <>
            <Summary nodes={sorted} stale={stale} />
            <FleetFilters nodes={sorted} presetTags={presetTags} filters={{ ...filters, tag }} onPick={pick} />
            {(region || tag || status !== "all") && (
              <p className="text-sm text-muted-foreground" role="status">已显示 {shown.length} / {sorted.length} 台 · 顶部统计为全部节点</p>
            )}
            {shown.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{sorted.length ? "没有符合筛选条件的节点，可清除筛选后重试" : "还没有节点"}</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {shown.map((n: Node) => (
                  <NodeCard key={n.id} node={n} onOpen={() => go(n.id)} onOpenLatency={() => go(n.id, "latency")} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      {/* The greeting belongs to the list: a node page is read, not visited. */}
      {open === null && me.visitor_card !== false && <VisitorCard />}
    </div>
  )
}
