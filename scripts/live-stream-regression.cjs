// Exercise the built theme against compressed deltas, reconnects and a legacy Hub.
const assert = require('node:assert/strict')
const { gzipSync } = require('node:zlib')
module.exports = async function verifyLive(context, origin, nodes) {
  const page = await context.newPage()
  const sockets = []
  let polls = 0
  let pollPending
  try {
    await page.addInitScript(() => {
      window.fixtureHidden = false
      Object.defineProperty(document, 'hidden', { get: () => window.fixtureHidden })
    })
    await page.clock.install()
    await page.route('**/api/nodes', async route => { polls++; pollPending = route })
    await page.routeWebSocket(/\/api\/ws(?:\?|$)/, ws => {
      const url = new URL(ws.url())
      assert.equal(url.searchParams.get('format'), 'delta-v1')
      assert.equal(url.searchParams.get('gzip'), '1')
      sockets.push(ws)
      ws.send(gzipSync(JSON.stringify({seq:10,nodes:[{...nodes[0], name:'完整实时节点'}],admin:false})))
    })
    const name = n => page.getByRole('heading',{name:n,exact:true})
    await page.goto(origin)
    await name('完整实时节点').waitFor()
    assert.equal(polls,0)
    const socket = sockets.at(-1)
    socket.send(gzipSync(JSON.stringify({base:10,seq:12,at:123,patch:[{id:nodes[0].id,set:{name:'压缩节点'}}]})))
    socket.send(JSON.stringify({base:12,seq:14,at:124,patch:[{id:nodes[0].id,set:{name:'最终节点'}}]}))
    await name('最终节点').waitFor()
    assert.equal(sockets.length,1)
    socket.send(JSON.stringify({base:13,seq:15,at:125}))
    await page.waitForRequest(req=>new URL(req.url()).pathname==='/api/nodes',{timeout:5000}).catch(()=>{ assert.ok(pollPending) })
    await page.clock.fastForward(5001)
    await name('完整实时节点').waitFor()
    assert.equal(sockets.length,2)
    await pollPending.fulfill({json:{nodes:[{...nodes[0], name:'滞后的轮询'}]}}).catch(()=>{})
    assert.equal(await name('滞后的轮询').count(),0)

    await page.evaluate(() => { window.fixtureHidden=true; document.dispatchEvent(new Event('visibilitychange')) })
    await page.clock.fastForward(60000)
    assert.equal(sockets.length,2)
    assert.equal(polls,1)
    await page.evaluate(() => { window.fixtureHidden=false; document.dispatchEvent(new Event('visibilitychange')) })
    await page.waitForFunction(()=>document.body.textContent.includes('实时更新'))
    // A fresh socket can speak the old protocol indefinitely.
    for (let i=0; i<100 && sockets.length<3; i++) await new Promise(resolve=>setTimeout(resolve,10))
    assert.equal(sockets.length,3)
    sockets[2].send(JSON.stringify({nodes:[{...nodes[0],name:'旧版节点'}],admin:false}))
    await name('旧版节点').waitFor()
    assert.equal(polls,1)
  } finally { await page.close() }
}
