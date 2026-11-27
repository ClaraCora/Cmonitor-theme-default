import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react"
import { LocateFixed, Minus, Plus } from "lucide-react"
import { facing, fitGlobe, land, markerDepth, points, projectFrom, type Orientation } from "@/lib/node-geography"
import { regionLabel } from "@/lib/countries"

const canvasSize = 512
const baseRadius = .47
const zoomLevels = [1.025, 1.25, 1.55]
const keyRotation: Record<string, [number, number]> = {
  ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, 15], ArrowDown: [0, -15],
}

type View = Orientation & { level: number }
type Drag = { id: number; x: number; y: number; view: View; degreesPerPixel: number; moved: boolean }
type Props = {
  entries: [string, number][]
  selected: string | null
  active: string | null
  onHover: (code: string | null) => void
  onPick: (code: string) => void
  caption: ReactNode
}

function turn(view: View, lon: number, lat: number) {
  return { ...view, lon: ((view.lon + lon + 540) % 360 + 360) % 360 - 180, lat: Math.max(-90, Math.min(90, view.lat + lat)) }
}

function GlobeLand({ view }: { view: View }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { lon, lat } = view

  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext("2d")
    if (!element || !ctx) return
    const project = projectFrom({ lon, lat })
    const half = canvasSize / 2

    function draw(context: CanvasRenderingContext2D, color: string) {
      context.clearRect(0, 0, canvasSize, canvasSize)
      context.fillStyle = color
      context.beginPath()
      for (const dot of land) {
        const point = project(dot)
        if (point.depth <= 0) continue
        const x = half + point.x * canvasSize * baseRadius
        const y = half + point.y * canvasSize * baseRadius
        const size = 1 + point.depth * 1.5
        context.moveTo(x + size, y)
        context.arc(x, y, size, 0, 2 * Math.PI)
      }
      context.fill()
    }

    const paint = () => draw(ctx, getComputedStyle(element).color)
    paint()
    const theme = new MutationObserver(paint)
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => theme.disconnect()
  }, [lon, lat])

  return <canvas ref={canvas} className="node-world-land" width={canvasSize} height={canvasSize} aria-hidden="true" />
}

export default function WorldPlot({ entries, selected, active, onHover, onPick, caption }: Props) {
  const [manual, setManual] = useState<View | null>(null)
  const drag = useRef<Drag | null>(null)
  const ignoreClick = useRef(false)
  const ball = useRef<HTMLDivElement>(null)
  const regionKey = entries.map(([code]) => code).sort().join(",")
  const automatic = useMemo(() => fitGlobe(regionKey.split(",")), [regionKey])
  const selectedPoint = selected ? points.get(selected) : undefined
  const autoView = selectedPoint && projectFrom(automatic)(selectedPoint).depth < markerDepth ? facing(selectedPoint) : automatic
  const view = manual ?? { ...autoView, level: 0 }
  const zoom = zoomLevels[view.level]
  const project = projectFrom(view)

  function startDrag(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return
    ignoreClick.current = false
    const diameter = (ball.current?.getBoundingClientRect().width ?? 0) * baseRadius * 2
    if (!diameter) return
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, view, degreesPerPixel: 135 / diameter, moved: false }
  }

  function moveDrag(e: PointerEvent<HTMLDivElement>) {
    const gesture = drag.current
    if (!gesture || e.pointerId !== gesture.id) return
    const dx = e.clientX - gesture.x, dy = e.clientY - gesture.y
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < 4) return
      gesture.moved = true
      ignoreClick.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      onHover(null)
    }
    setManual(turn(gesture.view, -dx * gesture.degreesPerPixel, dy * gesture.degreesPerPixel))
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === e.pointerId) drag.current = null
  }

  function rotateWithKeys(e: KeyboardEvent<HTMLDivElement>) {
    const step = keyRotation[e.key]
    if (!step) return
    e.preventDefault()
    onHover(null)
    setManual(turn(view, ...step))
  }

  return <>
    <div className="node-map-sheet">
      <div className="node-world" role="group" tabIndex={0}
        aria-label="球体节点地图，可拖动或用方向键旋转"
        data-view={`${view.lon.toFixed(2)},${view.lat.toFixed(2)},${view.level}`}
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag}
        onPointerCancel={endDrag} onLostPointerCapture={endDrag}
        onPointerLeave={e => { if (!drag.current?.moved) endDrag(e) }}
        onClickCapture={e => {
          if (ignoreClick.current && e.detail > 0) { e.stopPropagation(); ignoreClick.current = false }
        }}
        onKeyDown={rotateWithKeys}>
        <div className="node-globe-ball" ref={ball} style={{ height: `${zoom * 100}%` }}>
          <div className="node-globe-surface" aria-hidden="true" />
          <GlobeLand view={view} />
          {entries.map(([code, count]) => {
            const vector = points.get(code)
            if (!vector) return null
            const point = project(vector)
            const x = .5 + point.x * baseRadius
            const y = .5 + point.y * baseRadius
            const withinFrame = view.level === 0 || Math.abs(y - .5) * zoom <= .44
            const visible = point.depth >= markerDepth && withinFrame
            const name = regionLabel(code) + " · " + count + " 台节点"
            return <button type="button" key={code} hidden={!visible} data-map-marker={code}
              className="node-world-marker" data-active={code === active || code === selected}
              style={{ left: `${x * 100}%`, top: `${y * 100}%`, zIndex: 1 + Math.round(point.depth * 10) }}
              aria-label={name} aria-pressed={code === selected} title={name}
              onMouseEnter={() => onHover(code)} onMouseLeave={() => onHover(null)}
              onFocus={() => { if (!drag.current) onHover(code) }} onBlur={() => onHover(null)} onClick={() => onPick(code)}>
              <span className="node-world-dot" />
            </button>
          })}
        </div>
      </div>
    </div>
    <div className="node-map-footer">
      {caption}
      <div className="node-map-controls" role="group" aria-label="地图视图">
        <button type="button" disabled={view.level === 0} aria-label="缩小地图" title="缩小地图" onClick={() => setManual({ ...view, level: view.level - 1 })}><Minus aria-hidden="true" /></button>
        <button type="button" disabled={view.level === zoomLevels.length - 1} aria-label="放大地图" title="放大地图" onClick={() => setManual({ ...view, level: view.level + 1 })}><Plus aria-hidden="true" /></button>
        <button type="button" disabled={!manual} aria-label="恢复自动取景" title="恢复自动取景" onClick={() => setManual(null)}><LocateFixed aria-hidden="true" /></button>
      </div>
    </div>
  </>
}
