import { lazy, Suspense, useCallback, useEffect, useState } from "react"
import { Moon, Sun, Wrench } from "lucide-react"

import { NodeCard } from "@/components/NodeCard"
import { Summary } from "@/components/Summary"
import { VisitorCard } from "@/components/VisitorCard"
import { flagPath } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, useNodes, type Node } from "@/lib/api"

// `admin_url` is sent only to a signed-in caller, which is what lets the entry
// exist here without the path ever reaching the public bundle.
type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean; admin_url?: string; visitor_card?: boolean }

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
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    // The tab is a query rather than part of the path: it names which view of
    // the node a link opens, and the detail page reads it once on mount.
    (next: number | null, tab?: "latency") => {
      history.pushState({}, "", next === null ? "/" : `/node/${next}${tab === "latency" ? "?tab=latency" : ""}`)
      setId(next)
      scrollTo(0, 0)
    },
  ] as const
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("theme")
    return saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("theme", dark ? "dark" : "light")
  }, [dark])
  return [dark, () => setDark((d) => !d)] as const
}

/** Country chips with counts, between the summary and the grid: one tap
 * filters the fleet to a region, another clears it. */
function RegionBar({ nodes, region, onPick }: { nodes: Node[]; region: string | null; onPick: (c: string | null) => void }) {
  const counts = new Map<string, number>()
  for (const n of nodes) if (n.country) counts.set(n.country, (counts.get(n.country) ?? 0) + 1)
  if (counts.size < 2) return null
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border bg-card p-2 shadow-sm backdrop-blur-md">
      <button onClick={() => onPick(null)} className={chip(!region)}>
        全部 <span className="tnum">{nodes.length}</span>
      </button>
      {entries.map(([cc, n]) => (
        <button key={cc} onClick={() => onPick(region === cc ? null : cc)} className={chip(region === cc)} title={cc}>
          <img
            src={flagPath(cc)}
            alt={cc}
            loading="lazy"
            className="h-3 w-[18px] rounded-[2px] object-cover ring-1 ring-black/10"
          />
          {cc} <span className="tnum">{n}</span>
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [dark, toggleTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const { nodes, error, closed } = useNodes()
  const [open, go] = useNodeRoute()
  const [region, setRegion] = useState<string | null>(null)

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
  const shown = region ? sorted.filter((n) => n.country === region) : sorted

  // `/node/{id}` is a page people bookmark and share, so the tab needs the node's
  // name. The site name rather than a fixed string, since the hub lets an operator
  // rename the site.
  useEffect(() => {
    if (!me) return
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
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. */}
          <button className="flex items-center gap-2 font-semibold transition-opacity hover:opacity-70" onClick={() => go(null)}>
            <img src="/favicon.svg" alt="" className="size-5 rounded-md" />
            {me.site_name || "Monitor"}
          </button>
          <div className="flex-1" />
          {/* The hub names the panel only to a signed-in caller, so the path
              never appears in the bundle an anonymous visitor downloads. */}
          {me.authed && me.admin_url && (
            <Button variant="ghost" size="sm" asChild>
              <a href={me.admin_url}>
                <Wrench /> 进入后台
              </a>
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={toggleTheme} title="切换主题">
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-4 sm:px-6">
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
            <Summary nodes={sorted} />
            <RegionBar nodes={sorted} region={region} onPick={setRegion} />
            {sorted.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">还没有节点</p>
            ) : (
              <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
