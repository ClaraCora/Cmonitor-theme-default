// Natural Earth 5.1.2, public domain. Regenerate with scripts/build-node-globe.py.
import world from "./node-world.json" with { type: "json" }

export type Orientation = { lon: number; lat: number }
type Vector = [number, number, number]
const degrees = Math.PI / 180

function toVector(lon: number, lat: number): Vector {
  const longitude = lon * degrees
  const latitude = lat * degrees
  return [Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude)]
}

export const points = new Map(Object.entries(world.points).map(([code, [lon, lat]]) => [code, toVector(lon / 10, lat / 10)]))
export const land: Vector[] = []
for (let i = 0; i < world.dots.length; i += 2) {
  land.push(toVector(world.dots[i] / 10, world.dots[i + 1] / 10))
}

export function projectFrom({ lon, lat }: Orientation) {
  const sinLon = Math.sin(lon * degrees), cosLon = Math.cos(lon * degrees)
  const sinLat = Math.sin(lat * degrees), cosLat = Math.cos(lat * degrees)
  return ([x, y, z]: Vector) => {
    const forward = x * cosLon + z * sinLon
    return { x: z * cosLon - x * sinLon, y: forward * sinLat - y * cosLat, depth: forward * cosLat + y * sinLat }
  }
}

export function facing([x, y, z]: Vector): Orientation {
  return { lon: Math.atan2(z, x) / degrees, lat: Math.atan2(y, Math.hypot(x, z)) / degrees }
}

const candidateCenters = Array.from({ length: 13 }, (_, row) =>
  Array.from({ length: 24 }, (_, col) => toVector(col * 15 - 180, row * 15 - 90)),
).flat()

export const markerDepth = 0.14

export function fitGlobe(codes: string[]) {
  const regions = codes.flatMap(code => points.has(code) ? [points.get(code)!] : [])
  if (!regions.length) return { lon: 105, lat: 24 }
  const mean = regions.reduce<Vector>(([x, y, z], [a, b, c]) => [x + a, y + b, z + c], [0, 0, 0])
  const candidates = [toVector(facing(mean).lon, facing(mean).lat), ...regions, ...candidateCenters]
  let best = candidates[0]
  let bestScore = -Infinity
  for (const candidate of candidates) {
    const [x, y, z] = candidate
    let visible = 0
    let depth = 0
    for (const [a, b, c] of regions) {
      const d = x * a + y * b + z * c
      if (d >= markerDepth) visible++
      depth += Math.max(0, d)
    }
    // First maximize the number of clickable markers, then favor a centered view.
    const score = visible * (regions.length + 1) + depth
    if (score > bestScore) {
      bestScore = score
      best = candidate
    }
  }
  return facing(best)
}
