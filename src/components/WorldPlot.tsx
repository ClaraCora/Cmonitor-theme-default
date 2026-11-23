import { getCountryPoint, WORLD_AREAS, WORLD_VIEW_BOX } from "@/lib/node-geography"
import { regionLabel } from "@/lib/countries"

const land = WORLD_AREAS.map(({ code, path }) => <path key={code} d={path} />)
const areas = new Map(WORLD_AREAS.map(({ code, path }) => [code, path]))

export default function WorldPlot({ entries, selected, active, onHover, onPick }: {
  entries: [string, number][]
  selected: string | null
  active: string | null
  onHover: (code: string | null) => void
  onPick: (code: string) => void
}) {
  // The dashboard's country filters offer the same selection by keyboard or touch.
  return <svg viewBox={WORLD_VIEW_BOX} className="node-world" aria-hidden="true" focusable="false" onMouseLeave={() => onHover(null)}>
    <g className="node-world-land" fillRule="evenodd">{land}</g>
    {entries.map(([code]) => <path key={code} d={areas.get(code)} fillRule="evenodd" className="node-world-coverage"
      data-active={code === active || code === selected} onMouseEnter={() => onHover(code)} onMouseLeave={() => onHover(null)}
      onClick={() => onPick(code)} />)}
    {entries.map(([code, count]) => {
      const point = getCountryPoint(code)
      if (!point) return null
      return <g key={code} transform={"translate(" + point.join(" ") + ")"} data-map-marker={code}
        data-active={code === active || code === selected} className="node-world-marker"
        onMouseEnter={() => onHover(code)} onMouseLeave={() => onHover(null)} onClick={() => onPick(code)}>
        <title>{regionLabel(code)} · {count} 台节点</title>
        <circle r="12" fill="transparent" />
        <circle className="node-world-dot" r="5.7" />
      </g>
    })}
  </svg>
}
