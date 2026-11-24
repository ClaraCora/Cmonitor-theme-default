/// <reference types="node" />
import assert from "node:assert/strict"
import { safeNodes, type Node } from "./api.ts"

const node = { id: 1, metrics: { uptime: 100, cpu: 1, load: [0.1, 0.2, 0.3],
  mem_total: 1024, mem_used: 512, swap_total: 0, swap_used: 0, disk_total: 2048, disk_used: 1024,
  net_rx: 10, net_tx: 20, total_rx: 100, total_tx: 200, month_rx: 50, month_tx: 100,
  tcp: 3, udp: 4, procs: 20 } } as Node
assert.equal(safeNodes([node])[0], node)
for (const patch of [{ load: null }, { load: [1, "bad", 3] }, { cpu: "bad" }, { net_rx: Infinity }]) {
  const bad = { ...node, metrics: { ...node.metrics, ...patch } } as unknown as Node
  const result = safeNodes([bad, node])
  assert.equal(result[0].metrics, null)
  assert.equal(result[1], node)
}
console.log("invalid live reports are isolated")

const { api } = await import("./api.ts")
const originalFetch = globalThis.fetch
try {
  let calls = 0
  globalThis.fetch = async (_url, init) => {
    calls++
    assert.equal(new Headers(init?.headers).get("x-fixture"), "preserved")
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } })
  }
  assert.deepEqual(await api("/fixture", { headers: new Headers({ "x-fixture": "preserved" }) }), { ok: true })
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("aborted", "AbortError"))
    if (init?.signal?.aborted) abort(); else init?.signal?.addEventListener("abort", abort, { once: true })
  })
  await assert.rejects(api("/timeout", { method: "POST", body: "{}" }, 5), /请求超时/)
  const controller = new AbortController()
  const request = api("/cancel", { signal: controller.signal })
  controller.abort()
  await assert.rejects(request, /aborted/)
  assert.equal(calls, 1)
} finally { globalThis.fetch = originalFetch }
console.log("request deadline, cancellation and Headers compatibility passed")

const { nextSnapshot, decodeFrame } = await import("./live.ts")
const n1 = { ...node, pings: [{ id: 4, name: "example", latency: 9, updated_at: 1, samples: [8,9] }] }
const n2 = { ...node, id: 2 }
const full = nextSnapshot(null, {nodes:[n1,n2],seq:7})
const payload = { base:7,seq:9,at:99,drop:[2],put:[{ ...node,id:3 }],order:[3,1],
  patch:[{id:1,set:{name:"renamed"},metrics:{cpu:15},pings:[[4,{samples:[9,15],latency:15}]]}] }
const { gzipSync } = await import("node:zlib")
const text = JSON.stringify(payload)
const data = new Uint8Array(gzipSync(text)).buffer
const states = await Promise.all([text, data].map(async input=>nextSnapshot(full, await decodeFrame(input))))
assert.deepEqual(states[0], states[1])
assert.deepEqual(states[0].nodes.map(n=>[n.id,n.valuation_at]),[[3,99],[1,99]])
assert.equal(states[0].nodes[1].metrics?.cpu,15)
assert.deepEqual(states[0].nodes[1].pings?.[0],{id:4,name:"example",updated_at:1,latency:15,samples:[9,15]})
assert.equal(full.nodes[0].metrics?.cpu,1)
assert.deepEqual(full.nodes[0].pings?.[0].samples,[8,9])
assert.equal(nextSnapshot(full,{nodes:[n2]}).seq,null)
for (const invalid of [{base:6,seq:9,at:100},{base:7,seq:7,at:100},{base:7,seq:9,at:100,order:[1,1]},
  {base:7,seq:9,at:100,patch:[{id:9}]}]) assert.throws(()=>nextSnapshot(full,invalid))
assert.throws(()=>nextSnapshot(nextSnapshot(null,{nodes:[n1]}),{base:7,seq:9,at:100}))
console.log("full, legacy, gzip and text deltas, ordering, missing bases, immutable pings passed")
