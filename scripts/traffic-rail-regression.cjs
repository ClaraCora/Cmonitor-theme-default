// The simulated Hub serves this fleet via both the initial GET and its live socket.
const assert = require('node:assert/strict')
const path = require('node:path')

const GiB = 1024 ** 3
const fleet = [
  ['东京 · 青叶', 'JP', 14, 2],
  ['香港 · 海湾', 'HK', 8, 45],
  ['法兰克福 · 莱茵', 'DE', 39, 2],
  ['新加坡 · 南岸', 'SG', 16, 4],
  ['伦敦 · 西区', 'GB', 29, 2],
  ['悉尼 · 北港', 'AU', 5, 1],
  ['纽约 · 东岸', 'US', 2, 18],
  ['内网节点', '', 100, 200],
]
const firstFive = ['香港 · 海湾', '法兰克福 · 莱茵', '伦敦 · 西区', '新加坡 · 南岸', '纽约 · 东岸']
const monthlyTopFive = [['悉尼 · 北港', '48.00'], ['伦敦 · 西区', '44.00'], ['新加坡 · 南岸', '40.00'],
  ['法兰克福 · 莱茵', '36.00'], ['香港 · 海湾', '32.00']]

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function expectInlineRow(page, panels) {
  const boxes = []
  for (const panel of panels) {
    await panel.waitFor()
    assert.equal(await panel.count(), 1, 'each panel appears once')
    boxes.push(await panel.boundingBox())
  }
  const firstNode = await page.locator('.node-card').first().boundingBox()
  const summary = await page.getByRole('region', {name:'节点统计'}).boundingBox()
  const filters = await page.getByRole('group', {name:'节点筛选'}).boundingBox()
  const firstTop = boxes[0].y
  assert(firstTop >= filters.y + filters.height - 1, 'the inline row follows the filters')
  for (const box of boxes) {
    assert(Math.abs(box.y - firstTop) <= 2, 'all available panels align in one row')
    assert(box.x >= summary.x - 1 && box.x + box.width <= summary.x + summary.width + 1,
      'each panel fits the main column')
    assert(box.y + box.height <= firstNode.y + 1, 'the row precedes the node list')
  }
  for (let i = 1; i < boxes.length; i++) {
    assert(boxes[i].x >= boxes[i - 1].x + boxes[i - 1].width, 'neighboring panels do not overlap')
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
}

async function expectClearGutter(page, rail) {
  const box = await rail.boundingBox()
  const {width, height} = page.viewportSize()
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'entire floating ranking fits viewport')
  const obstacles = [
    page.locator('[aria-label="来访者信息"]:visible'),
    page.getByRole('region', {name:'节点统计'}),
    page.getByRole('group', {name:'节点筛选'}),
    ...await page.locator('.node-card').all(),
  ]
  for (const obstacle of obstacles) {
    const bounds = await obstacle.boundingBox()
    assert(bounds && !intersects(box, bounds), 'ranking does not cover the visitor card or dashboard content')
  }
}

// Compare rendered names in reading order without depending on the row markup.
async function expectNames(container, expected) {
  await container.getByText(expected[0], {exact:true}).waitFor()
  const text = await container.innerText()
  const names = fleet.map(([name]) => name).filter(name => text.includes(name))
    .sort((left, right) => text.indexOf(left) - text.indexOf(right))
  assert.deepEqual(names, expected)
}

async function expectReadableCosts(cost) {
  const rows = cost.getByRole('listitem')
  assert.equal(await rows.count(), monthlyTopFive.length)
  for (const [index, [name, amount]] of monthlyTopFive.entries()) {
    const row = rows.nth(index)
    const label = row.getByText(name, {exact:true})
    const value = row.locator('.traffic-dock-value')
    await label.scrollIntoViewIfNeeded()
    assert((await value.innerText()).includes(amount), `${name} has its own monthly amount`)
    const labelBox = await label.boundingBox()
    const amountBox = await value.boundingBox()
    assert(labelBox && amountBox && labelBox.width >= 36 && !intersects(labelBox, amountBox),
      `VPS name and amount have visible, separate space for ${name}`)
    assert(await label.evaluate(el => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + 4, r.top + r.height / 2))
    }), `the name of ${name} is reachable in the visible list`)
  }
}

async function checkFullCosts(page, cost, output, mobile = false) {
  const trigger = cost.getByRole('button', {name:'查看完整排行榜', exact:true})
  const filters = scope => scope.getByRole('group', {name:'消费排行标签', exact:true})
  const select = (scope, name) => filters(scope).getByRole('button', {name, exact:true}).click()
  async function expectTotal(scope, name, amount) {
    assert.equal(await filters(scope).getByRole('button', {pressed:true}).innerText(), name)
    const currency = scope.getByRole('status', {name:'月费合计', exact:true})
    assert((await currency.innerText()).includes('¥' + amount), `${name} monthly total should be ¥${amount}`)
  }
  assert.deepEqual(await filters(cost).getByRole('button').allTextContents(), ['全部', 'CC', '游走', '未分配'])
  await expectTotal(cost, '全部', '284.00')
  await select(cost, 'CC')
  await expectTotal(cost, 'CC', '108.00')
  await expectNames(cost.getByRole('list'), ['悉尼 · 北港', '香港 · 海湾', '东京 · 青叶'])
  if (mobile) await trigger.tap()
  else {
    await trigger.focus()
    await page.keyboard.press('Enter')
  }
  const dialog = page.getByRole('dialog', {name:'本月消费排行', exact:true})
  const rows = dialog.getByRole('list').getByRole('listitem')
  await expectTotal(dialog, 'CC', '108.00')
  assert.equal(await rows.count(), 3, 'the full ranking opens in the tag chosen on the dashboard')
  await select(dialog, '未分配')
  await expectTotal(dialog, '未分配', '0.00')
  assert.equal(await rows.count(), 0)
  await select(dialog, '全部')
  await expectTotal(dialog, '全部', '284.00')
  const all = [...monthlyTopFive, ['东京 · 青叶', '28.00'], ['东京 · 备用', '28.00'], ['未定位节点', '28.00']]
  await rows.last().waitFor()
  assert.equal(await rows.count(), all.length, 'all and only public nodes with a recurring cost are included')
  for (const [index, [name, amount]] of all.entries()) {
    const row = rows.nth(index)
    await row.getByText(name, {exact:true}).scrollIntoViewIfNeeded()
    assert((await row.innerText()).includes(amount), `${name} appears with its own monthly cost in position ${index + 1}`)
  }
  const box = await dialog.boundingBox()
  const {width, height} = page.viewportSize()
  assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1)
  await dialog.screenshot({animations:'disabled',path:path.join(output,`monthly-costs-${mobile ? 'mobile' : 'desktop'}.png`)})
  await select(dialog, '游走')
  await expectTotal(dialog, '游走', '116.00')
  await expectNames(dialog.getByRole('list'), ['伦敦 · 西区', '新加坡 · 南岸', '香港 · 海湾'])
  if (mobile) await dialog.getByRole('button', {name:/关闭/}).tap()
  else await page.keyboard.press('Escape')
  await dialog.waitFor({state:'hidden'})
  await page.waitForFunction(el => el === document.activeElement, await trigger.elementHandle(), {timeout:3000})
  await expectTotal(cost, '游走', '116.00')
  await select(cost, '全部')
}

async function checkMapNavigation(page, map) {
  const plot = map.locator('svg.node-world')
  const readView = () => plot.evaluate(el => {
    const {x, y, width, height} = el.viewBox.baseVal
    return [x, y, width, height]
  })
  const more = map.getByRole('button', {name:'放大地图', exact:true})
  const less = map.getByRole('button', {name:'缩小地图', exact:true})
  const reset = map.getByRole('button', {name:'恢复自动取景', exact:true})
  const original = await readView()
  assert(await reset.isDisabled(), 'the map starts in automatic mode')
  await less.click()
  assert((await readView())[2] > original[2], 'the map can zoom out from the fitted view')
  await reset.click()
  assert.deepEqual(await readView(), original, 'reset returns to the fitted view')
  await more.focus()
  await page.keyboard.press('Enter')
  const zoomed = await readView()
  assert(zoomed[2] < original[2] && zoomed[3] < original[3], 'zoom magnifies the map in both axes')
  const box = await plot.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 26, y + 12, {steps:5})
  await page.mouse.up()
  const panned = await readView()
  assert.notDeepEqual(panned.slice(0, 2), zoomed.slice(0, 2), 'drag changes the visible longitude or latitude')
  assert.deepEqual(panned.slice(2), zoomed.slice(2), 'drag keeps the zoom level')
  assert.equal(new URL(page.url()).searchParams.get('region'), null, 'dragging never selects a region')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  assert((await readView())[0] > panned[0], 'the keyboard can pan the enlarged map')
  await reset.click()
  assert.deepEqual(await readView(), original, 'reset restores both the scale and position')
}

async function checkNodeMap(page, output) {
  const map = page.getByRole('region', {name:'节点地图', exact:true})
  const toggle = map.getByRole('button', {name:'节点地图', exact:true})
  const marker = code => map.locator(`g[data-map-marker="${code}"]`)
  const filters = page.getByRole('group', {name:'节点筛选'})
  const country = (code, count) => filters.getByRole('button', {name:`${code} ${count}`, exact:true})
  const cards = page.locator('.node-card')
  const query = () => new URL(page.url()).searchParams
  await marker('JP').waitFor()
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
  await checkMapNavigation(page, map)
  const expectedRegions = fleet.slice(0, 7).map(([,code]) => code).sort()
  const markers = map.locator('g[data-map-marker]')
  assert.deepEqual(await markers.evaluateAll(items => items.map(item => item.dataset.mapMarker).sort()), expectedRegions)
  for (const code of expectedRegions) {
    const count = code === 'JP' ? 2 : 1
    assert.equal(await country(code, count).count(), 1, `${code} has one country filter`)
    assert.match(await marker(code).locator('title').textContent(), new RegExp(`· ${count} 台节点$`))
  }
  await map.getByText(/1\s*台未标注地区/).waitFor()
  assert.equal(await country('FR', 1).count(), 0, 'private nodes do not create a filter')
  assert.equal(await cards.count(), 9)

  const mapBox = await map.boundingBox()
  const edge = Math.max(...await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().right)))
  assert(mapBox.x >= edge, 'the map occupies the gutter to the right of every node card')
  await expectClearGutter(page, map)
  await page.screenshot({animations:'disabled',path:path.join(output,'node-map-desktop.png')})

  // Keyboard selection replaces a preset and retains the current status filter.
  await filters.getByRole('button', {name:/游走/}).click()
  await filters.getByLabel('节点状态').selectOption('offline')
  await country('JP', 2).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('heading', {name:'东京 · 备用',exact:true}).waitFor()
  assert.equal(await cards.count(), 1)
  assert.equal(query().get('region'), 'JP')
  assert.equal(query().get('status'), 'offline')
  assert.equal(query().get('tag'), null)
  assert.equal(await country('JP', 2).getAttribute('aria-pressed'), 'true')
  assert.equal(await marker('JP').getAttribute('data-active'), 'true')
  await map.locator('.node-map-caption').getByText('日本 · 2 台节点', {exact:true}).waitFor()
  await page.keyboard.press('Space')
  assert.equal(query().get('region'), null)
  assert.equal(await marker('JP').getAttribute('data-active'), 'false')

  await filters.getByLabel('节点状态').selectOption('all')
  await country('US', 1).click()
  assert.equal(await marker('US').getAttribute('data-active'), 'true', 'country chip updates the map')
  await page.reload()
  await marker('US').waitFor()
  assert.equal(await marker('US').getAttribute('data-active'), 'true', 'the URL restores the map selection')
  await marker('SG').click()
  await page.mouse.move(0, 0)
  await page.getByRole('heading', {name:'新加坡 · 南岸',exact:true}).waitFor()
  assert.equal(await cards.count(), 1)
  assert.equal(query().get('region'), 'SG')
  assert.equal(await country('SG', 1).getAttribute('aria-pressed'), 'true', 'clicking the map selects the center filter')
  assert.equal(await marker('SG').getAttribute('data-active'), 'true')
  assert.equal(await marker('US').getAttribute('data-active'), 'false')
  await page.getByRole('region', {name:'近 7 天流量', exact:true}).getByText('新加坡', {exact:true}).waitFor()
  await filters.getByRole('button', {name:'清除筛选',exact:true}).click()

  await page.setViewportSize({width:1800,height:760})
  await marker('JP').waitFor()
  await expectClearGutter(page, map)
  const week = page.getByRole('region', {name:'近 7 天流量',exact:true})
  const rank = page.locator('[aria-label="今日流量排行浮窗"]')
  const visitor = page.locator('.visitor-pill:visible')
  const cost = page.getByRole('region', {name:'本月消费排行榜', exact:true})
  const expiry = page.getByRole('region', {name:'临期提醒',exact:true})
  const headerRank = page.locator('header').getByRole('button',{name:/排行/})
  for (const [width,height] of [[1799,900], [1600,640], [1440,900], [1024,768], [1800,640], [1920,759]]) {
    await page.setViewportSize({width,height})
    await marker('JP').waitFor()
    await expectInlineRow(page, [map, week, rank, cost])
    const pillBox = await visitor.boundingBox()
    const costBox = await cost.boundingBox()
    const firstNode = await cards.first().boundingBox()
    assert(pillBox && pillBox.y >= costBox.y + costBox.height - 1 && pillBox.y + pillBox.height <= firstNode.y + 1,
      'the desktop visitor pill fits between the tools and the node list')
    const exp = await expiry.boundingBox()
    for (const panel of [map, week, rank, cost]) {
      const r = await panel.boundingBox()
      assert(exp.y >= r.y + r.height - 1, 'expiry reminders appear on their own line')
    }
    assert.equal(await headerRank.count(), 0, 'the homepage has a single ranking entry')
    if (width === 1440) await page.screenshot({animations:'disabled',path:path.join(output,'fleet-tools-desktop.png')})
    if (width === 1800) {
      const latestDay = week.locator('[data-traffic-day]').last()
      await latestDay.scrollIntoViewIfNeeded()
      await latestDay.click({trial:true})
      await page.screenshot({animations:'disabled',path:path.join(output,'fleet-tools-short-desktop.png')})
    }
  }
  await toggle.click()
  await marker('JP').waitFor({state:'hidden'})
  assert.equal(await week.locator('[data-traffic-day]').count(), 7, 'collapsing the desktop map leaves the weekly chart accessible')
  await toggle.click()

  const titles = ['节点地图','近 7 天流量','今日流量排行','本月消费排行']
  const switcher = page.getByRole('group', {name:'首页工具',exact:true})
  const tools = titles.map(name => switcher.getByRole('button',{name,exact:true}))
  for (const [width,height] of [[1023,768], [390,844], [320,720]]) {
    await page.setViewportSize({width,height})
    const boxes = []
    for (const tool of tools) {
      await tool.waitFor()
      assert.equal(await tool.count(), 1, 'each mobile tool has just one launcher')
      assert.equal(await tool.getAttribute('aria-expanded'), 'false')
      boxes.push(await tool.boundingBox())
    }
    assert.equal(await visitor.count(), 1, 'the visitor is available as a compact pill')
    assert.equal(await headerRank.count(), 0)
    for (let i = 1; i < boxes.length; i++) {
      assert(Math.abs(boxes[0].y - boxes[i].y) <= 1 && boxes[i-1].x + boxes[i-1].width <= boxes[i].x + 1, 'four mobile launchers fit one row')
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await tools[0].focus()
  await page.keyboard.press('Enter')
  await marker('JP').waitFor()
  assert.equal(await markers.count(), expectedRegions.length, 'expanding the phone map displays every known region')
  await map.screenshot({animations:'disabled',path:path.join(output,'node-map-mobile.png')})
  await country('JP', 2).focus()
  await page.keyboard.press('Space')
  assert.equal(await cards.count(), 2, 'mobile keyboard users can select a country from the center filters')
  assert.equal(await marker('JP').getAttribute('data-active'), 'true')
  await tools[1].click()
  await marker('JP').waitFor({state:'hidden'})
  await week.getByText('日本', {exact:true}).waitFor()
  await week.locator('[data-traffic-day]').last().click()
  const daily = page.getByRole('dialog',{name:'当日流量排行',exact:true})
  await daily.getByText('东京 · 青叶',{exact:true}).waitFor()
  await page.keyboard.press('Escape')
  await daily.waitFor({state:'hidden'})
  await tools[2].click()
  await week.waitFor({state:'hidden'})
  await rank.getByRole('button',{name:'查看完整排行',exact:true}).click()
  const todayRank = page.getByRole('dialog',{name:'今日流量排行',exact:true})
  await todayRank.waitFor()
  await page.keyboard.press('Escape')
  await todayRank.waitFor({state:'hidden'})
  await tools[3].click()
  await cost.getByText('悉尼 · 北港',{exact:true}).waitFor()
  await checkFullCosts(page, cost, output, true)
  for (let i=0; i<tools.length; i++) assert.equal(await tools[i].getAttribute('aria-expanded'), String(i===3))
  await visitor.scrollIntoViewIfNeeded()
  await page.screenshot({animations:'disabled',path:path.join(output,'fleet-tools-mobile.png')})
  await tools[3].click()
  await cost.waitFor({state:'hidden'})
  await country('JP', 2).click()
  await page.setViewportSize({width:1920,height:1080})
  await page.evaluate(() => window.scrollTo(0,0))
}

async function checkMapAutoFit(page, nodes, output) {
  const map = page.getByRole('region', {name:'节点地图', exact:true})
  const plot = map.locator('svg.node-world')
  const marker = code => map.locator(`g[data-map-marker="${code}"]`)
  const readWidth = () => plot.evaluate(el => el.viewBox.baseVal.width)
  const initialWidth = await readWidth()
  const previous = nodes.slice()
  const asia = previous.filter(node => ['JP', 'HK', 'SG'].includes(node.country))
  const edgeNodes = ['WS', 'FJ'].map((country, i) => ({
    ...nodes[0], id:80 + i, sort:80 + i, name:`太平洋节点 ${country}`, country, day_rx:0, day_tx:0,
    price:null, expires_at:null,
  }))
  nodes.splice(0, nodes.length, ...asia)
  try {
    await marker('AU').waitFor({state:'detached'})
    const regionalWidth = await readWidth()
    assert(regionalWidth < initialWidth * .7, 'the map zooms in when all VPS are in the same part of the world')
    const regionalBounds = await map.boundingBox()
    await map.screenshot({animations:'disabled',path:path.join(output,'node-map-asia.png')})

    await map.getByRole('button', {name:'放大地图', exact:true}).click()
    const manualWidth = await readWidth()
    nodes.push(...edgeNodes)
    await marker('FJ').waitFor({state:'attached'})
    assert.equal(await readWidth(), manualWidth, 'fleet updates do not interrupt manual navigation')
    await map.getByRole('button', {name:'恢复自动取景', exact:true}).click()

    for (const node of edgeNodes) {
      const pin = marker(node.country)
      await pin.waitFor()
      assert.equal(await pin.getAttribute('tabindex'), '0', 'new markers near the date line are keyboard reachable')
      const bounds = await plot.boundingBox()
      const target = await pin.boundingBox()
      assert(target.x > bounds.x && target.x + target.width < bounds.x + bounds.width,
        'the default viewport fits the entire target near either edge')
    }
    assert((await readWidth()) > regionalWidth,
      'the overview expands when a new node needs more space')
    const expandedBounds = await map.boundingBox()
    assert.deepEqual([expandedBounds.width, expandedBounds.height], [regionalBounds.width, regionalBounds.height],
      'changing geographic coverage does not resize the card')
    await marker('FJ').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('heading', {name:edgeNodes[1].name, exact:true}).waitFor()
    assert.equal(new URL(page.url()).searchParams.get('region'), 'FJ')
    await page.keyboard.press('Enter')
    assert.equal(new URL(page.url()).searchParams.get('region'), null)
    nodes.splice(-edgeNodes.length, edgeNodes.length)
    await marker('FJ').waitFor({state:'detached'})
    assert.equal(await readWidth(), regionalWidth, 'the regional view returns when edge nodes are removed')
  } finally {
    nodes.splice(0, nodes.length, ...previous)
  }
  await marker('AU').waitFor()
}

async function checkOptionalVisitor(context, origin) {
  const page = await context.newPage()
  try {
    await page.setViewportSize({width:1280,height:800})
    await page.goto(origin)
    const visitor = page.locator('.visitor-pill:visible')
    const map = page.getByRole('region',{name:'节点地图',exact:true})
    const week = page.getByRole('region',{name:'近 7 天流量',exact:true})
    const ranking = page.locator('[aria-label="今日流量排行浮窗"]')
    await visitor.getByRole('button',{name:'关闭访客信息',exact:true}).click()
    await visitor.waitFor({state:'hidden'})
    await expectInlineRow(page, [map, week, ranking, page.getByRole('region',{name:'本月消费排行榜', exact:true})])
    await page.setViewportSize({width:320,height:720})
    assert.equal(await page.locator('.visitor-pill:visible').count(), 0)
    // A fresh tab has no dismissal preference. The Hub can also turn off this panel.
    const disabled = await context.newPage()
    try {
      await disabled.route('**/api/me', route => route.fulfill({json:{
        site_name:'Monitor', authed:false, public_page:true, visitor_card:false,
      }}))
      await disabled.setViewportSize({width:1024,height:768})
      await disabled.goto(origin)
      const panels = [
        disabled.getByRole('region',{name:'节点地图',exact:true}),
        disabled.getByRole('region',{name:'近 7 天流量',exact:true}),
        disabled.locator('[aria-label="今日流量排行浮窗"]'),
        disabled.getByRole('region',{name:'本月消费排行榜', exact:true}),
      ]
      await expectInlineRow(disabled, panels)
      assert.equal(await disabled.locator('[aria-label="来访者信息"]:visible').count(), 0)
      const bounds = await Promise.all(panels.map(panel => panel.boundingBox()))
      assert(Math.max(...bounds.map(r => r.width)) - Math.min(...bounds.map(r => r.width)) <= 2)
    } finally {
      await disabled.close()
    }
  } finally {
    await page.close()
  }
}

module.exports = async function checkTrafficRail(context, origin, nodes, output) {
  const previous = nodes.slice()
  const today = Math.floor(Date.now() / 86400000) * 86400
  const now = today + 12 * 3600
  const expiryOffsets = [10, 0, -1, 11, 4, null, 2, 1]
  const costTags = ['CC<blue>', 'CC;游走<green>', '游走备用', '游走', '游走', 'CC', 'CC;游走', 'CC;游走']
  const fixtures = fleet.map(([name, country, rx, tx], index) => ({
    ...previous[0], name, country, id: index + 1, sort: index, public: index < 7,
    day_rx: rx * GiB, day_tx: tx * GiB, total_rx: rx * 8 * GiB, total_tx: tx * 10 * GiB,
    month_rx: rx * 2 * GiB, month_tx: tx * 2 * GiB, traffic_limit: 1024 * GiB,
    expires_at: expiryOffsets[index] === null ? null : new Date((today + expiryOffsets[index] * 86400) * 1000).toISOString().slice(0,10),
    permanent: index === 6, valuation_at: now, billing_timezone: 'UTC',
    currency: 'CNY', price: 28 + index * 4, tags: costTags[index],
    metrics: {...previous[0].metrics, cpu: 7 + index * 4, mem_total: 4 * GiB, mem_used: (0.5 + index / 4) * GiB,
      disk_total: 40 * GiB, disk_used: (6 + index * 2) * GiB, net_rx: (index + 1) * 125000, net_tx: (8 - index) * 70000},
    pings: [{id:1,name:'Cloudflare',latency:12 + index,updated_at:now,samples:[11,14,12,11,15,13,12,13]}],
  }))
  // With the fixture's 8 CNY/USD rate, these plans rank at 48 and 40 CNY per month.
  Object.assign(fixtures[5], {currency:'USD', price:6})
  Object.assign(fixtures[3], {billing_cycle:'yearly', price:480})
  fixtures[7].country = 'FR' // A private node must not introduce a visible region.
  const tokyoBackup = {...fixtures[0], id:20, name:'东京 · 备用', tags:'备用', online:false, day_rx:0, day_tx:0, expires_at:null}
  const unknown = {...tokyoBackup, id:21, name:'未定位节点', country:'', online:true}
  nodes.splice(0, nodes.length, ...fixtures, tokyoBackup, unknown)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.clock.setFixedTime(new Date(now * 1000))
    await page.setViewportSize({width:1920,height:1080})
    await page.goto(origin + '/')
    const rail = page.locator('[aria-label="今日流量排行浮窗"]')
    const cost = page.getByRole('region', {name:'本月消费排行榜', exact:true})
    const expiry = page.getByRole('region', {name:'临期提醒', exact:true})
    const expectedDue = ['香港 · 海湾', '伦敦 · 西区', '东京 · 青叶']
    const openAll = rail.getByRole('button', {name:'查看完整排行',exact:true})
    const dialog = page.getByRole('dialog', {name:'今日流量排行',exact:true})
    await page.locator('.visitor-desktop:visible').waitFor()
    await expectNames(rail.getByRole('list').first(), firstFive)
    await cost.getByText('悉尼 · 北港', {exact:true}).waitFor()
    await expectReadableCosts(cost)
    await checkFullCosts(page, cost, output)
    const costBox = await cost.boundingBox()
    const weekBox = await page.getByRole('region', {name:'近 7 天流量', exact:true}).boundingBox()
    const expiryBox = await expiry.boundingBox()
    const rankBox = await rail.boundingBox()
    assert(rankBox.y + rankBox.height <= weekBox.y + 1,
      'today ranking stays above weekly traffic in the left gutter')
    assert(weekBox.x + weekBox.width <= expiryBox.x + 1,
      'weekly traffic stays in the left gutter when the expiry reminder moves right')
    assert(Math.abs(costBox.x - expiryBox.x) <= 2 && costBox.y >= expiryBox.y + expiryBox.height,
      'expiry reminders and cost ranking share the right gutter')
    assert(page.viewportSize().height - costBox.y - costBox.height <= 32, 'cost ranking sits at the bottom of the right gutter')
    await expectNames(expiry, expectedDue)
    await expiry.getByRole('button', {name:/香港 · 海湾/}).getByText('今天到期', {exact:true}).waitFor()
    await expiry.getByRole('button', {name:/东京 · 青叶/}).getByText('剩 10 天', {exact:true}).waitFor()
    await expectClearGutter(page, rail)
    await expectClearGutter(page, page.getByRole('region', {name:'近 7 天流量', exact:true}))
    await expectClearGutter(page, cost)
    await expectClearGutter(page, expiry)
    await checkNodeMap(page, output)
    await checkMapAutoFit(page, nodes, output)
    await checkOptionalVisitor(context, origin)
    await require('./weekly-traffic-regression.cjs').checkWeekly(context, origin, output)
    // A desktop breakpoint must not force dark surfaces in the light theme.
    const themeColors = () => page.evaluate(() => {
      const color = (selector, property) => getComputedStyle(document.querySelector(selector))[property]
      const surfaces = ['.traffic-dock:not(.cost-dock)', '.weekly-traffic', '.node-map', '.expiry-dock', '.cost-dock', '.visitor-desktop']
      return {
        background: color('.node-card', 'backgroundColor'),
        panels: surfaces.map(selector => color(selector, 'backgroundColor')),
        text: surfaces.map(selector => color(selector, 'color')),
        map: color('.node-map-sheet', 'backgroundColor'),
        land: color('.node-world-land', 'fill'),
        weekly: color('.weekly-up', 'backgroundColor'),
        selection: color('.cost-dock .cost-tags [aria-pressed="true"]', 'color'),
      }
    })
    const light = await themeColors()
    assert(light.panels.every(background => background === light.background), 'light gutter panels use the node card surface')
    await page.setViewportSize({width:1440,height:900})
    const inlineLight = await themeColors()
    assert.deepEqual(inlineLight, light, 'light panel colors do not change at the gutter breakpoint')
    await page.setViewportSize({width:1920,height:1080})
    await page.screenshot({animations:'disabled',path:path.join(output,'traffic-ranking-1920.png')})
    await page.getByRole('button', {name:'切换主题',exact:true}).click()
    await page.locator('html.dark').waitFor()
    const dark = await themeColors()
    assert(dark.panels.every((background, index) => background !== light.panels[index]), 'every gutter surface follows dark mode')
    assert(dark.text.every((color, index) => color !== light.text[index]), 'every gutter foreground follows dark mode')
    for (const key of ['map', 'land', 'weekly', 'selection']) assert.notEqual(dark[key], light[key], `${key} follows dark mode`)
    await page.getByRole('button', {name:'切换主题',exact:true}).click()
    await page.locator('html:not(.dark)').waitFor()
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.node-card')).backgroundColor ===
      getComputedStyle(document.querySelector('.traffic-dock')).backgroundColor)
    assert.deepEqual(await themeColors(), light, 'switching back restores the full light palette')
    await page.getByRole('button', {name:'切换主题',exact:true}).click()
    await page.locator('html.dark').waitFor()
    await expectClearGutter(page, rail)
    await page.screenshot({animations:'disabled',path:path.join(output,'traffic-ranking-1920-dark.png')})
    await openAll.focus()
    await page.keyboard.press('Enter')
    await expectNames(dialog, [...firstFive, '东京 · 青叶', '悉尼 · 北港'])
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'hidden'})
    await page.waitForFunction(() => document.activeElement?.textContent?.includes('查看完整排行'))

    await page.getByRole('button', {name:'收起今日流量排行',exact:true}).click()
    await openAll.waitFor({state:'hidden'})
    await expectNames(expiry, expectedDue)
    await page.getByRole('button', {name:'展开今日流量排行',exact:true}).click()
    await expectNames(rail.getByRole('list').first(), firstFive)
    // A new arrival in the top five must evict the old fifth row without a reload.
    fixtures[5].day_tx = 72 * GiB
    await expectNames(rail.getByRole('list').first(), ['悉尼 · 北港', ...firstFive.slice(0,4)])

    await page.setViewportSize({width:1800,height:760})
    await rail.waitFor()
    await expectReadableCosts(cost)
    const shortCost = await cost.boundingBox()
    assert(page.viewportSize().height - shortCost.y - shortCost.height <= 32)
    await expectClearGutter(page, rail)
    await expectClearGutter(page, page.getByRole('region', {name:'近 7 天流量', exact:true}))
    await expectClearGutter(page, cost)
    await expectClearGutter(page, expiry)

    const shortRankBox = await rail.boundingBox()
    const shortWeekBox = await page.getByRole('region', {name:'近 7 天流量', exact:true}).boundingBox()
    assert(shortRankBox.y + shortRankBox.height <= shortWeekBox.y + 1, 'short desktop keeps the left rail order')
    assert(!intersects(shortRankBox, await expiry.boundingBox()), 'the two panels have separate space')
    await page.screenshot({animations:'disabled',path:path.join(output,'traffic-expiry-1800.png')})

    // All reminders must remain reachable even when a short desktop cannot fit the list.
    const extra = Array.from({length:12}, (_, i) => ({...fixtures[1], id:100 + i, sort:100 + i,
      name:'同日到期 ' + (i + 1), day_rx:0, day_tx:0}))
    nodes.push(...extra)
    await expiry.getByText('同日到期 12', {exact:true}).waitFor()
    for (const node of extra) assert.equal(await expiry.getByText(node.name, {exact:true}).count(), 1)
    const lastDue = expiry.getByText('东京 · 青叶', {exact:true})
    await expiry.locator('.expiry-dock-list').evaluate(el => {
      el.scrollTop = el.scrollHeight
      const scroller = el.closest('.geo-week-overview')
      if (scroller) scroller.scrollTop = scroller.scrollHeight
    })
    await page.waitForFunction(el => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
    }, await lastDue.elementHandle())
    await expectClearGutter(page, rail)
    await expectClearGutter(page, page.getByRole('region', {name:'近 7 天流量', exact:true}))
    await expectClearGutter(page, cost)

    await lastDue.click()
    await page.getByRole('button', {name:'刷新图表',exact:true}).waitFor()
    assert.equal(new URL(page.url()).pathname, '/node/1', 'clicking the last reminder opens that node')
    const headerRank = page.locator('header').getByRole('button', {name:/排行/})
    await headerRank.click()
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'hidden'})
    assert.equal(await page.getByRole('region', {name:'节点地图',exact:true}).count(), 0)
    await page.goBack()
    await expiry.waitFor()

    await page.setViewportSize({width:1920,height:1080})
    await expiry.waitFor()
    for (const node of nodes) node.expires_at = null
    await expiry.waitFor({state:'detached'})
    assert(await openAll.isVisible(), 'with no upcoming renewals the traffic ranking is still available')
    assert.equal(await page.getByRole('heading', {name:'临期提醒', exact:true, includeHidden:true}).count(), 0)
    await cost.getByRole('button', {name:'查看完整排行榜',exact:true}).click()
    const fullCosts = page.getByRole('dialog', {name:'本月消费排行',exact:true})
    const sixth = fullCosts.getByRole('listitem').nth(5)
    await sixth.getByRole('button', {name:new RegExp(extra[0].name + '\\s')}).click()
    await page.getByRole('button',{name:'刷新图表',exact:true}).waitFor()
    assert.equal(new URL(page.url()).pathname, '/node/' + extra[0].id, 'the sixth cost opens the correct VPS')
    await rail.waitFor({state:'hidden'})
    assert.deepEqual(errors, [])
  } finally {
    nodes.splice(0, nodes.length, ...previous)
    await page.close()
  }
}
