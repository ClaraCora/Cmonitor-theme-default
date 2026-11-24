import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { LocateFixed, Minus, Plus } from "lucide-react"
import { getCountryPoint, WORLD_AREAS, WORLD_SIZE } from "@/lib/node-geography"
import { regionLabel } from "@/lib/countries"

const land = WORLD_AREAS.map(({ code, path }) => <path key={code} d={path} />)
const areas = new Map(WORLD_AREAS.map(({ code, path }) => [code, path]))
// A 60° × 30° graticule in the same Equal Earth projection as the land.
const graticule = [
  "M293,9 276,21 242,50 209,89 185,136 169,187 164,240 169,293 185,344 209,391 242,430 276,459 293,471",
  "M386,9 378,21 361,50 345,89 332,136 325,187 322,240 325,293 332,344 345,391 361,430 378,459 386,471",
  "M480,9V471",
  "M574,9 582,21 599,50 615,89 628,136 635,187 638,240 635,293 628,344 615,391 599,430 582,459 574,471",
  "M667,9 684,21 718,50 751,89 775,136 791,187 796,240 791,293 775,344 751,391 718,430 684,459 667,471",
  "M123,430H837 M37,344H923 M6,240H954 M37,136H923 M123,50H837",
].join(" ")

const fullView = { x: 0, y: 0, zoom: 1 }
const maxZoom = 8
function boundedView(x: number, y: number, zoom: number) {
  const maxX = WORLD_SIZE.width * (1 - 1 / zoom)
  const maxY = WORLD_SIZE.height * (1 - 1 / zoom)
  return { x: Math.max(0, Math.min(maxX, x)), y: Math.max(0, Math.min(maxY, y)), zoom }
}

type Drag = { id: number; startX: number; startY: number; originX: number; originY: number; scale: number; moved: boolean }
type Props = {
  entries: [string, number][]
  selected: string | null
  active: string | null
  onHover: (code: string | null) => void
  onPick: (code: string) => void
  caption: ReactNode
}

export default function WorldPlot({ entries, selected, active, onHover, onPick, caption }: Props) {
  const [view, setView] = useState(fullView)
  const drag = useRef<Drag | null>(null)
  const ignoreClick = useRef(false)
  const width = WORLD_SIZE.width / view.zoom
  const height = WORLD_SIZE.height / view.zoom
  const zoomed = view.zoom > 1

  function zoomTo(zoom: number) {
    const center = selected && zoom > view.zoom ? getCountryPoint(selected) : undefined
    const cx = center?.[0] ?? view.x + width / 2
    const cy = center?.[1] ?? view.y + height / 2
    setView(boundedView(cx - WORLD_SIZE.width / (2 * zoom), cy - WORLD_SIZE.height / (2 * zoom), zoom))
  }

  function startDrag(e: PointerEvent<SVGSVGElement>) {
    if (!e.isPrimary || e.button !== 0) return
    ignoreClick.current = false
    const scale = e.currentTarget.getScreenCTM()?.a
    if (!zoomed || !scale) return
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, originX: view.x, originY: view.y, scale, moved: false }
  }
  function moveDrag(e: PointerEvent<SVGSVGElement>) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 4) return
      d.moved = true
      ignoreClick.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      onHover(null)
    }
    setView(boundedView(d.originX - dx / d.scale, d.originY - dy / d.scale, view.zoom))
  }
  function endDrag(e: PointerEvent<SVGSVGElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null
  }
  function panWithKeys(e: KeyboardEvent<SVGSVGElement>) {
    if (!zoomed) return
    const stepX = width / 5, stepY = height / 5
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-stepX, 0], ArrowRight: [stepX, 0], ArrowUp: [0, -stepY], ArrowDown: [0, stepY],
    }
    if (!step[e.key]) return
    e.preventDefault()
    const [dx, dy] = step[e.key]
    setView(boundedView(view.x + dx, view.y + dy, view.zoom))
  }
  return <>
    <div className="node-map-sheet">
      <svg viewBox={[view.x, view.y, width, height].join(" ")} className="node-world"
        role="group" aria-label={zoomed ? "节点分布，使用方向键平移" : "世界节点分布"} tabIndex={zoomed ? 0 : undefined}
        data-zoomed={zoomed} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
        onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onPointerLeave={e => { if (!drag.current?.moved) endDrag(e); onHover(null) }}
        onClickCapture={e => { if (ignoreClick.current) { e.stopPropagation(); ignoreClick.current = false } }}
        onKeyDown={panWithKeys}>
        <path className="node-world-grid" d={graticule} />
        <g className="node-world-land" fillRule="evenodd">{land}</g>
        {entries.map(([code]) => <path key={code} d={areas.get(code)} fillRule="evenodd" className="node-world-coverage"
          data-active={code === active} data-selected={code === selected} aria-hidden="true"
          onMouseEnter={() => onHover(code)} onMouseLeave={() => onHover(null)} onClick={() => onPick(code)} />)}
        {entries.map(([code, count]) => {
          const point = getCountryPoint(code)
          if (!point) return null
          const name = regionLabel(code) + " · " + count + " 台节点"
          const inView = point[0] >= view.x && point[0] <= view.x + width && point[1] >= view.y && point[1] <= view.y + height
          return <g key={code} transform={`translate(${point.join(" ")}) scale(${1 / view.zoom})`}
            data-map-marker={code} className="node-world-marker" data-active={code === active || code === selected}
            role="button" tabIndex={inView ? 0 : -1} aria-label={name} aria-pressed={code === selected}
            onMouseEnter={() => onHover(code)} onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(code)} onBlur={() => onHover(null)} onClick={() => onPick(code)}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!e.repeat) onPick(code) }
            }}>
            <title>{name}</title>
            <circle r="12" fill="transparent" />
            <circle className="node-world-ring" r="10" />
            <circle className="node-world-dot" r="6" />
          </g>
        })}
      </svg>
    </div>
    <div className="node-map-footer">
      {caption}
      <div className="node-map-controls" role="group" aria-label="地图视图">
        <button type="button" disabled={!zoomed} aria-label="缩小地图" title="缩小地图" onClick={() => zoomTo(view.zoom / 2)}><Minus /></button>
        <button type="button" disabled={view.zoom >= maxZoom} aria-label="放大地图" title="放大地图" onClick={() => zoomTo(view.zoom * 2)}><Plus /></button>
        <button type="button" disabled={!zoomed} aria-label="重置地图视图" title="回到全球视图" onClick={() => setView(fullView)}><LocateFixed /></button>
      </div>
    </div>
  </>
}
