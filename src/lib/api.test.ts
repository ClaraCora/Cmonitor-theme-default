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
