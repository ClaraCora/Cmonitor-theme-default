// Each connection starts with a full public or admin frame. A delta belongs
// only to that socket's sequence; an HTTP fallback is never a delta base.
import type { Node, LivePing } from "./api.ts"

export type Snapshot = { nodes: Node[]; seq: number | null }
type NodePatch = { id: number; set?: Partial<Node>; metrics?: Partial<NonNullable<Node["metrics"]>>; pings?: [number, Partial<LivePing>][] }
type Frame = { nodes?: Node[]; base?: number; seq?: number; at?: number; put?: Node[]; drop?: number[]; order?: number[]; patch?: NodePatch[] }

export function nextSnapshot(previous: Snapshot | null, frame: Frame): Snapshot {
  const check = (ok: boolean) => { if (!ok) throw new Error("invalid live frame") }
  if (Array.isArray(frame.nodes)) {
    check(frame.seq === undefined || Number.isSafeInteger(frame.seq))
    return { nodes: frame.nodes, seq: frame.seq ?? null }
  }
  if (!previous || previous.seq === null || frame.base !== previous.seq ||
      !Number.isSafeInteger(frame.seq) || frame.seq! <= previous.seq || !Number.isSafeInteger(frame.at)) {
    throw new Error("live snapshot out of sequence")
  }
  const nodes = new Map(previous.nodes.map((n) => [n.id, n]))
  for (const id of frame.drop ?? []) check(nodes.delete(id))
  for (const n of frame.put ?? []) {
    check(Number.isSafeInteger(n.id))
    nodes.set(n.id, n)
  }
  for (const patch of frame.patch ?? []) {
    const original = nodes.get(patch.id)
    if (!original) throw new Error("unknown node")
    const next = { ...original, ...patch.set }
    check(next.id === original.id)
    if (patch.metrics) {
      if (!next.metrics) throw new Error("missing metrics base")
      next.metrics = { ...next.metrics, ...patch.metrics }
    }
    if (patch.pings) {
      const changes = new Map(patch.pings)
      next.pings = (next.pings ?? []).map((ping) => {
        const change = changes.get(ping.id)
        if (!change) return ping
        changes.delete(ping.id)
        const updated = { ...ping, ...change }
        check(updated.id === ping.id)
        return updated
      })
      check(changes.size === 0)
    }
    nodes.set(patch.id, next)
  }
  if (frame.order) check(frame.order.length === nodes.size && new Set(frame.order).size === nodes.size)
  const ordered = Array.from(frame.order ?? nodes.keys(), (id) => {
    const n = nodes.get(id)
    if (!n) throw new Error("unknown node in display order")
    return n.valuation_at === frame.at ? n : { ...n, valuation_at: frame.at }
  })
  return { nodes: ordered, seq: frame.seq! }
}

export async function decodeFrame(input: string | ArrayBuffer): Promise<Frame> {
  if (typeof input === "string") return JSON.parse(input)
  const decoded = new Blob([input]).stream().pipeThrough(new DecompressionStream("gzip"))
  return await new Response(decoded).json()
}
