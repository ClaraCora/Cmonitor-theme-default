const assert = require('node:assert/strict')

// An isolated visitor sees a long fleet. Exercise the production observer,
// request queue and history fallback against a real scrollable viewport.
module.exports = async function cardHistory(browser, origin, sample, me) {
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}})
  const page = await ctx.newPage()
  const nodes = Array.from({length: 24}, (_, index) => ({
    ...sample, id: index + 1, sort: index + 1, name: `Viewport node ${index+1}`,
    pings: index === 2 ? [] : sample.pings,
  }))
  const hits = []
  let unavailable = null
  const send = (route, body) => route.fulfill({json:body})
  const hidden = (value) => page.evaluate(v => {
    Object.defineProperty(document, 'hidden', {configurable:true, value:v})
    document.dispatchEvent(new Event('visibilitychange'))
  }, value)
  try {
    await ctx.route(/\/api\//, route => {
      const u = new URL(route.request().url())
      if (u.pathname === '/api/me') return send(route, {...me, authed:false})
      if (u.pathname === '/api/nodes') return send(route, {admin:false,nodes})
      if (u.pathname.endsWith('/metrics')) {
        const id = Number(u.pathname.split('/')[3])
        if (u.searchParams.get('hours') === '2') hits.push(id)
        if (id === unavailable) return route.fulfill({status:503,body:'busy'})
        return send(route, {probes:{1:'测试探测'}, stats:{}, loss:{},
          ping:[{task_id:1,ts:1700000000,latency:24}],metrics:[]})
      }
      return send(route, {})
    })
    await ctx.routeWebSocket(/\/api\/ws(?:\?|$)/, sock => sock.send(JSON.stringify({admin:false,nodes})))
    await ctx.route('**/v1/currencies/cny.min.json',route=>send(route,{date:'2026-01-01',cny:{usd:.14}}))
    await page.goto(origin)
    const card = id => page.locator('.node-card').filter({has:page.getByRole('heading',{name:`Viewport node ${id}`,exact:true})})
    const visit = id => card(id).evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}))
    const history = id => card(id).getByLabel('最近 2 小时探测',{exact:true})
    await card(1).waitFor()
    await visit(1)
    await history(1).waitFor()
    assert(!hits.includes(24), 'offscreen cards do not fetch when the fleet mounts')
    await visit(3)
    assert.equal(await card(3).getByTitle('查看网络延迟').count(),0)
    await visit(24)
    await history(24).waitFor()
    assert(!hits.includes(3), 'a visible node without probes never fetches probe history')
    const firstReads=hits.filter(n=>n===1).length
    await visit(1)
    await history(1).waitFor()
    assert.equal(hits.filter(n=>n===1).length,firstReads,'returning to a fresh card reuses history')

    // Start a refused request; going into the background during its backoff
    // must cancel the retry. Scrolling there must not start a new request.
    unavailable=17
    const refused=page.waitForResponse(r=>r.status()===503 && r.url().includes('/nodes/17/metrics'))
    await visit(17)
    await refused
    await hidden(true)
    await visit(10)
    await page.waitForTimeout(1700)
    assert.equal(hits.filter(n=>n===17).length,1)
    assert(!hits.includes(10),'hidden documents do not fetch visible card histories')
    await hidden(false)
    await history(10).waitFor()
    // Leaving a visible, refused card also cancels its next retry.
    await Promise.all([page.waitForResponse(r=>r.status()===503 && r.url().includes('/nodes/17/metrics')), visit(17)])
    await visit(10)
    const before=hits.filter(n=>n===17).length
    await page.waitForTimeout(1700)
    assert.equal(hits.filter(n=>n===17).length,before)
    await card(10).getByTitle('查看网络延迟').click()
    await page.getByRole('button',{name:'7 天',exact:true}).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('tab'),'latency')
  } finally {
    await ctx.close()
  }
}
