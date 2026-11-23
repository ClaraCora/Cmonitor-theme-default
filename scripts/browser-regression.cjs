/* Built-asset regression. All data and writes stay on an ephemeral loopback server. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../node_modules/playwright')
const mode = process.env.UX_APP || 'theme'
const dist = path.resolve(process.env.UX_DIST || path.join(__dirname, '../dist'))
const output = path.resolve(process.env.UX_OUTPUT || path.join(__dirname, '../target/ux-evidence'))

const metric = { uptime: 1000, cpu: 5, load: [0, 0, 0], mem_total: 1024, mem_used: 128, swap_total: 0, swap_used: 0, disk_total: 2048, disk_used: 256, net_rx: 10, net_tx: 20, total_rx: 1000, total_tx: 2000, month_rx: 100, month_tx: 200, tcp: 3, udp: 1, procs: 10 }
const nodes = [1, 2].map(id => ({ id, name: `测试节点 ${id}`, sort: id, public: true, online: true, country: 'SG', last_seen: Math.floor(Date.now()/1000), metrics: metric, hostname: 'fixture', ip: `198.51.100.${id}`, ipv4: '', ipv6: '', os: 'Linux', kernel: '', arch: 'x86_64', virt: 'kvm', cpu_name: 'Test CPU', cpu_cores: 2, mem_total: 1024, swap_total: 0, disk_total: 2048, agent_version: '1.2.0', price: 5, currency: 'USD', billing_cycle: 'monthly', expires_at: '2026-12-10', permanent: false, traffic_limit: 1024**3, traffic_mode: 'sum', traffic_reset_day: 1, total_rx: 1000, total_tx: 2000, month_rx: 100, month_tx: 200, month_start: '2026-11-01', day_rx: 10, day_tx: 20, traffic_incomplete: false, token: 'fixture-only', notify: true, muted_until: 0, remark: '', tags: '', website: 'https://example.com', pings: [{id: 1, name: '测试探测', latency: 20, updated_at: Math.floor(Date.now()/1000), samples: [20,21,19]}] }))
const settings = { site_name: 'Monitor', retention_days: '7', public_page: 'on', visitor_card: 'on', notify_grace: '3', notify_traffic: '80', notify_expiry: '7', notify_disk_percent: '90', notify_disk_minutes: '10', notify_ping_failures: '3', notify_cooldown: '60', notify_login: 'on', notify_telegram_chat: '', notify_telegram_text: '{{title}}', notify_webhook_body: '{"text":"{{message}}"}', password_login: 'on' }
const me = { authed: true, github: false, password_login: true, hub_version: 'test', site_name: 'Monitor', public_page: true, site: 'https://monitor.example.com', can_provision: true, admin_url: '/clara/nodes', visitor_card: true }
me.preset_tag = '游走;备用;未分配'
nodes[0].tags = '游走<green>; 1Gbps'
nodes[1].tags = '游走备用; 500M; 备用<amber>'
nodes[1].country = 'US'

async function main() {
  fs.mkdirSync(output, { recursive: true })
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/clara(?=\/|$)/, '')
    let filename = path.join(dist, pathname)
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) filename = path.join(dist, 'index.html')
    const ext = path.extname(filename)
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[ext] || 'application/octet-stream')
    fs.createReadStream(filename).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await chromium.launch({ headless: true, ...(process.env.UX_BROWSER_CHANNEL ? { channel: process.env.UX_BROWSER_CHANNEL } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', hasTouch: true })
  let dnsOnly = false
  let settingsFail = false, pingFail = false, outage = false, exchangeFail = false
  let exchangeCalls = 0
  const sockets = new Set(), timers = new Set(), writes = [], historyCalls = []
  const errors = []
  try {
    await context.route('**/v1/currencies/cny.min.json', route => {
      exchangeCalls++
      return route.fulfill(exchangeFail ? {status:503,body:'unavailable'} : {contentType:'application/json',body:JSON.stringify({date:new Date().toISOString().slice(0,10),cny:{cny:1,usd:0.125,eur:0.1,jpy:20}})})
    })
    await context.route('**/api/**', async route => {
      const req = route.request(), pathname = new URL(req.url()).pathname
      const fail = body => route.fulfill({status:503,body})
      if (outage && pathname === '/api/nodes') return fail('模拟网络中断')
      if (settingsFail && pathname === '/api/settings') return fail('模拟设置加载失败')
      if (pingFail && pathname === '/api/ping-tasks') return fail('模拟探测加载失败')
      if (req.method() !== 'GET') {
        writes.push({ pathname, method:req.method(), body:req.postData() })
        if (pathname === '/api/auth/logout') return fail('模拟退出失败')
        return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true})})
      }
      let data = {}
      if (pathname === '/api/me') data = me
      else if (pathname === '/api/nodes') data = {nodes,admin:true}
      else if (pathname === '/api/traffic/weekly') data = require('./weekly-traffic-regression.cjs').weeklyFixture()
      else if (pathname === '/api/settings') data = settings
      else if (pathname.endsWith('/metrics')) {
        historyCalls.push(req.url())
        const now=Math.floor(Date.now()/1000)
        if (dnsOnly) data={metrics:[],ping:[],probes:{1:'测试探测'},loss:{},stats:{1:{avg_ms:null,p50_ms:null,p95_ms:null,jitter_ms:null,success_count:0,loss_count:0,error_count:4,loss_pct:null}}}
        else data={metrics:[{ts:now-60,cpu:5,mem_used:128,disk_used:256,net_rx:10,net_tx:20},{ts:now,cpu:6,mem_used:130,disk_used:256,net_rx:20,net_tx:20}],ping:[{task_id:1,ts:now-60,latency:20},{task_id:1,ts:now,latency:21}],probes:{1:'测试探测'},loss:{},stats:{1:{avg_ms:1.8061224489795917,p50_ms:1,p95_ms:3,jitter_ms:0.8,success_count:2,loss_count:0,error_count:0,loss_pct:0}}}
      }
      else if (pathname === '/api/ping-tasks') data={tasks:[]}
      else if (pathname === '/api/visitor-log') data={visits:[]}
      else if (pathname === '/api/visitor') data={ip:'198.51.100.99',city:'测试地区',country:'CN'}
      else if (pathname.endsWith('/renewals')) data={history:[]}
      else if (pathname === '/api/notify/history') data={items:[]}
      else if (pathname === '/api/sessions') data=[]
      return route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
    })
    await context.routeWebSocket('**/api/ws', ws => {
      if (outage) { ws.close(); return }
      sockets.add(ws)
      ws.onClose(() => sockets.delete(ws))
      const send=() => { try { ws.send(JSON.stringify({nodes,admin:true})) } catch {} }
      send()
      const timer=setInterval(() => { if (outage) {ws.close();clearInterval(timer)} else send() },1000)
      timers.add(timer)
    })
    const page=await context.newPage()
    await page.clock.install()
    page.on('pageerror',e => errors.push(e.message))
    if (mode === 'admin') {
      await page.goto(origin+'/clara/nodes')
      await page.getByRole('button',{name:'编辑节点',exact:true}).first().click()
      const dialog=page.getByRole('dialog')
      await dialog.getByLabel('流量计算方式',{exact:true}).waitFor()
      await dialog.getByLabel('名称',{exact:true}).fill('未保存修改')
      const labelCounts=await dialog.locator('input').evaluateAll(inputs=>inputs.map(el=>el.labels.length || (el.getAttribute('aria-label') ? 1 : 0)))
      assert(labelCounts.every(Boolean),'every input has an accessible name')
      page.once('dialog',d=>d.dismiss())
      await page.keyboard.press('Escape')
      assert.equal(await dialog.count(),1,'Escape preserves dirty edits when discard is declined')
      await dialog.getByLabel('名称',{exact:true}).fill(nodes[0].name+' 已编辑')
      await dialog.getByRole('button',{name:'保存',exact:true}).click()
      await dialog.waitFor({state:'hidden'})
      const saves=writes.filter(w=>w.pathname===`/api/nodes/${nodes[0].id}`)
      assert.equal(saves.length,1)
      assert.equal(writes.filter(w=>w.pathname.endsWith('/traffic')).length,0,'one atomic save request')
      assert('traffic_correction' in JSON.parse(saves[0].body))
      await page.screenshot({animations:"disabled",path:path.join(output,'admin-desktop.png')})
      await page.setViewportSize({width:390,height:844})
      await page.clock.fastForward(5000)
      await page.getByRole('button',{name:'编辑',exact:true}).first().tap()
      await page.getByLabel('名称',{exact:true}).waitFor()
      await page.screenshot({animations:"disabled",path:path.join(output,'editor-mobile.png')})
      await page.keyboard.press('Escape')
      await page.getByRole('button',{name:`${nodes[0].name} 更多操作`,exact:true}).tap()
      await page.getByRole('menuitem',{name:'下移',exact:true}).tap()
      assert(writes.some(w=>w.pathname==='/api/nodes/order'),'mobile sorting uses explicit controls')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({animations:"disabled",path:path.join(output,'admin-mobile.png')})
      settingsFail=true
      await page.goto(origin+'/clara/settings')
      await page.getByRole('button',{name:'重新加载',exact:true}).click()
      await page.getByText('加载失败：模拟设置加载失败').waitFor()
      settingsFail=false
      await page.getByRole('button',{name:'重新加载',exact:true}).click()
      await page.getByLabel('站点名称',{exact:true}).waitFor()
      await page.getByRole('button',{name:'退出登录',exact:true}).click()
      await page.getByText('退出失败，请重试',{exact:true}).waitFor()
      assert(page.url().endsWith('/clara/settings'),'failed logout must not navigate')
      pingFail=true
      await page.goto(origin+'/clara/ping')
      await page.getByText('加载失败：模拟探测加载失败').waitFor()
      assert.equal(await page.getByText('还没有延迟监控。',{exact:false}).count(),0)
    } else {
      await page.goto(origin+'/')
      await page.getByText('全部在线',{exact:true}).waitFor()
      const valueTile=page.getByRole('region',{name:'节点统计'}).locator('[data-slot="card"]').last()
      await valueTile.getByText('CNY',{exact:true}).waitFor()
      assert.equal(await valueTile.getByText('USD',{exact:true}).count(),0,'summary shows a single CNY total')
      const converted=Number((await valueTile.locator('dd').innerText()).replaceAll(',',''))
      assert(converted>0,'foreign plans are converted to a positive CNY value')
      const end=new Date(nodes[0].expires_at+'T00:00:00Z')
      const start=new Date(end)
      start.setUTCMonth(start.getUTCMonth()-1)
      const clock=await page.evaluate(()=>Date.now())
      const expected=nodes.reduce((sum,node)=>sum+node.price*8*Math.max(0,end.getTime()-clock)/(end.getTime()-start.getTime()),0)
      assert(Math.abs(converted-expected)<=0.01,'the browser uses the CNY rate rather than the original foreign amount')
      const loadedCalls=exchangeCalls
      exchangeFail=true
      await page.reload()
      await valueTile.getByText('CNY',{exact:true}).waitFor()
      assert.equal(exchangeCalls,loadedCalls,'fresh rates are reused from local storage')
      await page.evaluate(()=>localStorage.removeItem('cmonitor.cny-rates.v1'))
      await page.reload()
      await valueTile.getByRole('button',{name:'汇率获取失败，重试',exact:true}).waitFor()
      assert.equal(await valueTile.locator('dd').count(),0,'failed conversion never displays a partial total')
      exchangeFail=false
      await valueTile.getByRole('button',{name:'汇率获取失败，重试',exact:true}).click()
      await valueTile.getByText('CNY',{exact:true}).waitFor()
      await page.evaluate(()=>{
        const key='cmonitor.cny-rates.v1', saved=JSON.parse(localStorage.getItem(key))
        saved.fetchedAt=Date.now()-7*60*60*1000
        localStorage.setItem(key,JSON.stringify(saved))
      })
      exchangeFail=true
      await page.reload()
      await valueTile.getByRole('button',{name:'使用缓存汇率，重试',exact:true}).waitFor()
      await valueTile.getByText('CNY',{exact:true}).waitFor()
      exchangeFail=false
      await valueTile.getByRole('button',{name:'使用缓存汇率，重试',exact:true}).click()
      await valueTile.getByRole('button',{name:'使用缓存汇率，重试',exact:true}).waitFor({state:'hidden'})
      await page.getByRole('button',{name:'关闭访客信息',exact:true}).waitFor()
      const visitor=page.getByRole('complementary',{name:'来访者信息',exact:true})
      assert.equal(await visitor.evaluate(el=>getComputedStyle(el).position),'fixed')
      assert.equal(await visitor.evaluate(el=>getComputedStyle(el).left),'16px')
      assert.equal(await visitor.evaluate(el=>getComputedStyle(el).bottom),'16px')
      assert.equal(await visitor.evaluate(el=>el.getBoundingClientRect().width),256)
      await visitor.getByText('访客',{exact:true}).waitFor()
      await visitor.getByText('198.51.100.99',{exact:true}).waitFor()
      assert.equal(await visitor.locator('details').count(),0,'visitor card is visible without expanding a footer')
      await page.screenshot({animations:"disabled",path:path.join(output,'status-desktop.png')})
      await page.setViewportSize({width:390,height:844})
      assert.equal(await visitor.evaluate(el=>getComputedStyle(el).position),'fixed')
      assert.equal(await visitor.evaluate(el=>getComputedStyle(el).bottom),'12px')
      const pill=await visitor.boundingBox()
      assert(pill && pill.x>=0 && pill.x+pill.width<=390,'mobile visitor pill stays inside the viewport')
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
      await page.screenshot({animations:"disabled",path:path.join(output,'visitor-mobile.png')})
      await page.getByRole('button',{name:'关闭访客信息',exact:true}).click()
      await page.reload()
      assert.equal(await page.getByRole('button',{name:'关闭访客信息',exact:true}).count(),0)
      await page.getByText('全部在线',{exact:true}).waitFor()
      await page.screenshot({animations:"disabled",path:path.join(output,'status-mobile.png')})
      await page.goto(origin+`/node/${nodes[0].id}`)
      await page.getByRole('heading',{name:nodes[0].name,exact:true}).waitFor()
      await page.getByRole('button',{name:'刷新图表',exact:true}).waitFor()
      const before=historyCalls.length
      await page.clock.fastForward(65000)
      await page.waitForTimeout(100)
      assert(historyCalls.length>before,'visible history refreshes without changing tabs')
      const auto=historyCalls.length
      await page.getByRole('button',{name:'刷新图表',exact:true}).click()
      await page.waitForTimeout(100)
      assert(historyCalls.length>auto,'manual history refresh works')
      await page.clock.resume()
    }
    await page.goto(origin+(mode==='admin'?'/clara/nodes':'/'))
    await page.getByText(/实时更新/).waitFor()
    outage=true
    for (const ws of sockets) ws.close()
    await page.clock.fastForward(17000)
    await page.getByText(/数据更新中断/).waitFor()
    if(mode==='theme') assert.equal(await page.getByText('全部在线',{exact:true}).count(),0)
    await page.screenshot({animations:"disabled",path:path.join(output,`${mode}-outage.png`)})
    outage=false
    await page.clock.fastForward(6000)
    await page.getByText(/数据更新中断/).waitFor({state:'hidden'})
    // Regression for independently stale probes and ratios beyond their quota.
    if (mode === 'theme') {
      for (const node of nodes) {
        node.traffic_limit=1000; node.month_rx=1250; node.month_tx=250
        Object.assign(node.pings[0],{status:'stale',latency:null,last_latency:1,updated_at:Math.floor(Date.now()/1000)-3600})
      }
      await page.goto(origin+'/')
      await page.getByText('探测未更新',{exact:true}).first().waitFor()
      assert.equal(await page.getByText('150%',{exact:true}).count(),nodes.length)
      await page.goto(origin+'/?q=无匹配的节点')
      const filters=page.getByRole('group',{name:'节点筛选',exact:true})
      await page.getByRole('heading',{name:nodes[0].name,exact:true}).waitFor()
      assert.equal(await page.getByRole('textbox').count(),0,'name and label search has been removed')
      assert.equal(new URL(page.url()).searchParams.has('q'),false,'legacy search bookmarks cannot hide nodes')
      assert.equal(await page.locator('.node-card').count(),2)
      assert.equal(await filters.getByRole('button').first().getByText('游走',{exact:true}).count(),1,'preset is the leftmost chip')
      assert.deepEqual((await filters.getByRole('button').allTextContents()).slice(0,4),['游走1','备用1','未分配0','全部 2'],'preset buttons precede countries in configured order')
      const preset=filters.getByRole('button',{name:'游走 1',exact:true})
      const backup=filters.getByRole('button',{name:'备用 1',exact:true})
      await backup.click()
      await page.getByRole('heading',{name:nodes[1].name,exact:true}).waitFor()
      assert.equal(await page.locator('.node-card').count(),1,'each preset filters its own exact label')
      assert.equal(new URL(page.url()).searchParams.get('tag'),'备用')
      await page.reload()
      await backup.waitFor()
      assert.equal(await backup.getAttribute('aria-pressed'),'true','second preset survives reload')
      await preset.click()
      assert.equal(await backup.getAttribute('aria-pressed'),'false','switching presets replaces the selection')
      assert.equal(await preset.getAttribute('aria-pressed'),'true')
      assert.equal(await page.locator('.node-card').count(),1,'exact tag matching excludes 游走备用')
      assert.equal(new URL(page.url()).searchParams.get('tag'),'游走')
      await page.reload()
      await page.getByRole('heading',{name:nodes[0].name,exact:true}).waitFor()
      assert.equal(await preset.getAttribute('aria-pressed'),'true','preset selection survives reload')
      await page.getByRole('heading',{name:nodes[0].name,exact:true}).click()
      await page.getByRole('button',{name:'刷新图表',exact:true}).waitFor()
      await page.goBack()
      await preset.waitFor()
      assert.equal(await preset.getAttribute('aria-pressed'),'true','detail back preserves preset selection')
      await filters.getByRole('button',{name:'US 1',exact:true}).click()
      assert.equal(new URL(page.url()).searchParams.has('tag'),false,'country selection clears preset')
      await page.getByRole('heading',{name:nodes[1].name,exact:true}).waitFor()
      assert.equal(await page.locator('.node-card').count(),1)
      await preset.click()
      assert.equal(new URL(page.url()).searchParams.has('region'),false,'preset selection clears country')
      await filters.getByLabel('节点状态').selectOption('offline')
      await page.getByText('没有符合筛选条件的节点，可清除筛选后重试',{exact:true}).waitFor()
      await filters.getByRole('button',{name:'清除筛选',exact:true}).click()
      assert.equal(await page.locator('.node-card').count(),2)
      await filters.getByRole('button',{name:'未分配 0',exact:true}).click()
      await page.getByText('没有符合筛选条件的节点，可清除筛选后重试',{exact:true}).waitFor()
      await filters.getByRole('button',{name:'未分配 0',exact:true}).click()
      assert.equal(await page.locator('.node-card').count(),2,'clicking the selected preset clears it')

      me.preset_tag='all'
      nodes[0].tags+=';all'
      await page.goto(origin+'/')
      await filters.getByRole('button',{name:'all 1',exact:true}).click()
      assert.equal(new URL(page.url()).searchParams.get('tag'),'all')
      await page.reload()
      await page.getByText('已显示 1 / 2 台 · 顶部统计为全部节点',{exact:true}).waitFor()
      await page.getByText('估算说明',{exact:true}).click()
      assert.equal(await page.locator('details[open]').count(),1)
      me.preset_tag='备用'
      await page.goto(origin+'/?tag=游走')
      await filters.waitFor()
      await page.getByRole('heading',{name:nodes[0].name,exact:true}).waitFor()
      assert.equal(await filters.getByRole('button',{name:'游走 1',exact:true}).count(),0,'unset preset hides its button')
      assert.equal(await page.locator('.node-card').count(),2,'removed presets cannot leave a hidden filter')
      me.preset_tag=''
      await page.goto(origin+'/')
      await filters.waitFor()
      assert.equal(await filters.getByRole('button').count(),3,'empty configuration hides all preset buttons')
      const longPreset='长标签'.repeat(10)
      me.preset_tag=[longPreset,...Array.from({length:11},(_,i)=>`预设标签${i+2}`)].join(';')
      nodes[0].tags=longPreset+'<green>'
      await page.goto(origin+'/')
      await filters.getByRole('button').first().waitFor()
      for(const width of [320,390]) {
        await page.setViewportSize({width,height:844})
        await filters.getByRole('button').first().click()
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'long preset fits mobile width')
        const dimensions=await filters.getByRole('button').first().boundingBox()
        assert(dimensions.height>=44,'mobile preset has a usable touch target')
        await page.screenshot({animations:'disabled',path:path.join(output,`preset-mobile-${width}.png`)})
      }
      await page.setViewportSize({width:1440,height:1000})
      await page.screenshot({animations:'disabled',path:path.join(output,'multiple-presets-desktop.png')})
      me.preset_tag='游走'; nodes[0].tags='游走<green>; 1Gbps'
      await page.goto(origin+'/')
      await page.getByRole('heading',{name:nodes[0].name,exact:true}).waitFor()
      assert.equal(await filters.getByRole('button',{name:'游走 1',exact:true}).count(),1,'existing single-preset settings remain compatible')
      dnsOnly=true
      await page.goto(origin+`/node/${nodes[0].id}?tab=latency`)
      await page.getByText('DNS 错误 4 次（未计入丢包）',{exact:true}).waitFor()
      await page.getByText('丢包 —',{exact:true}).waitFor()
      await page.getByText('这段时间没有 TCP 观测，请查看 DNS 错误和当前探测状态。',{exact:true}).waitFor()
      await page.goto(origin+'/')
    }
    if (mode === 'theme') await require('./traffic-rail-regression.cjs')(context, origin, nodes, output)
    // A denied Storage API must not blank either app (including restore status).
    await context.addInitScript(()=>{
      Storage.prototype.getItem=()=>{throw new DOMException('blocked','SecurityError')}
      Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError')}
    })
    await page.reload()
    await page.getByText(nodes[0].name,{exact:true}).first().waitFor()
    await page.getByRole('button',{name:'切换主题',exact:true}).click()
    const pending=await context.newPage()
    await pending.route('**/api/me',()=>{})
    await pending.clock.install()
    await pending.goto(origin+(mode==='admin'?'/clara/nodes':'/'))
    await pending.getByText('加载中…',{exact:true}).waitFor()
    await pending.clock.fastForward(16000)
    await pending.getByRole('button',{name:'重试',exact:true}).waitFor()
    await pending.close()
    assert.deepEqual(errors,[],'no browser runtime errors')
    fs.writeFileSync(path.join(output,`${mode}-results.json`),JSON.stringify({mode,passed:true,writes,historyRequests:historyCalls.length},null,2))
    console.log(`${mode}: labels, error recovery, data freshness, responsive controls and refresh checks passed`)
  } finally {
    for (const timer of timers) clearInterval(timer)
    await browser.close()
    await new Promise(resolve=>server.close(resolve))
  }
}
main().catch(e=>{console.error(e);process.exitCode=1})
