// Natural Earth 5.1.2, public domain: https://www.naturalearthdata.com/about/terms-of-use/
// Equal Earth paths and label points share a 960 × 480 canvas. The JSON is the
// output of ClaraCora/Cmonitor's scripts/build-visitor-map.py at tag v1.9.5.
import world from "./node-world.json" with { type: "json" }

export const WORLD_VIEW_BOX = "0 0 960 480"
export const WORLD_AREAS: readonly { code: string; path: string }[] =
  Object.entries(world.areas).map(([code, path]) => ({ code, path }))

type Point = readonly [number, number]
const points = new Map<string, Point>(
  Object.entries(world.points).map(([code, [x, y]]) => [code, [x, y]]),
)

export function getCountryPoint(code: string): Point | undefined {
  return points.get(code)
}
