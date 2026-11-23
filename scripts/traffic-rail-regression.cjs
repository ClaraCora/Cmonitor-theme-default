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

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

async function expectClearGutter(page, rail) {
  const box = await rail.boundingBox()
  const {width, height} = page.viewportSize()
  assert(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, 'entire floating ranking fits viewport')
  const obstacles = [
    page.getByRole('complementary', {name:'来访者信息'}),
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
  assert.equal(await map.getByRole('button').count(), 1, 'only the map heading is a button in the map panel')
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
  await filters.getByRole('button', {name:'清除筛选',exact:true}).click()

  await page.setViewportSize({width:1800,height:640})
  await marker('JP').waitFor()
  await expectClearGutter(page, map)
  for (const [width,height] of [[1799,900], [1920,639], [320,720], [390,844]]) {
    await page.setViewportSize({width,height})
    await marker('JP').waitFor({state:'hidden'})
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    const filterBox = await filters.boundingBox()
    const inlineBox = await map.boundingBox()
    assert(inlineBox.y >= filterBox.y + filterBox.height - 1, 'collapsed map sits below the filters')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  }
  await toggle.focus()
  await page.keyboard.press('Enter')
  await marker('JP').waitFor()
  assert.equal(await markers.count(), expectedRegions.length, 'expanding the phone map displays every known region')
  assert.equal(await map.getByRole('button').count(), 1)
  await country('JP', 2).focus()
  await page.keyboard.press('Space')
  assert.equal(await cards.count(), 2, 'mobile keyboard users can select a country from the center filters')
  assert.equal(await marker('JP').getAttribute('data-active'), 'true')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await map.evaluate(el => window.scrollBy(0, el.getBoundingClientRect().top - 72))
  await page.screenshot({animations:'disabled',path:path.join(output,'node-map-mobile.png')})
  await country('JP', 2).click()
  await toggle.click()
  await page.setViewportSize({width:1920,height:1080})
  await page.evaluate(() => window.scrollTo(0,0))
}

module.exports = async function checkTrafficRail(context, origin, nodes, output) {
  const previous = nodes.slice()
  const today = Math.floor(Date.now() / 86400000) * 86400
  const now = today + 12 * 3600
  const expiryOffsets = [10, 0, -1, 11, 4, null, 2, 1]
  const fixtures = fleet.map(([name, country, rx, tx], index) => ({
    ...previous[0], name, country, id: index + 1, sort: index, public: index < 7,
    day_rx: rx * GiB, day_tx: tx * GiB, total_rx: rx * 8 * GiB, total_tx: tx * 10 * GiB,
    month_rx: rx * 2 * GiB, month_tx: tx * 2 * GiB, traffic_limit: 1024 * GiB,
    expires_at: expiryOffsets[index] === null ? null : new Date((today + expiryOffsets[index] * 86400) * 1000).toISOString().slice(0,10),
    permanent: index === 6, valuation_at: now, billing_timezone: 'UTC',
    currency: 'CNY', price: 28 + index * 4, tags: ['双栈;1Gbps','游走;2Gbps','备用;1Gbps'][index % 3],
    metrics: {...previous[0].metrics, cpu: 7 + index * 4, mem_total: 4 * GiB, mem_used: (0.5 + index / 4) * GiB,
      disk_total: 40 * GiB, disk_used: (6 + index * 2) * GiB, net_rx: (index + 1) * 125000, net_tx: (8 - index) * 70000},
    pings: [{id:1,name:'Cloudflare',latency:12 + index,updated_at:now,samples:[11,14,12,11,15,13,12,13]}],
  }))
  fixtures[7].country = 'FR' // A private node must not introduce a visible region.
  const tokyoBackup = {...fixtures[0], id:20, name:'东京 · 备用', online:false, day_rx:0, day_tx:0, expires_at:null}
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
    const expiry = page.getByRole('region', {name:'临期提醒', exact:true})
    const expectedDue = ['香港 · 海湾', '伦敦 · 西区', '东京 · 青叶']
    const openAll = rail.getByRole('button', {name:'查看完整排行',exact:true})
    const dialog = page.getByRole('dialog', {name:'今日流量排行',exact:true})
    await page.getByRole('complementary', {name:'来访者信息'}).waitFor()
    await expectNames(rail.getByRole('list').first(), firstFive)
    await expectNames(expiry, expectedDue)
    await expiry.getByRole('button', {name:/香港 · 海湾/}).getByText('今天到期', {exact:true}).waitFor()
    await expiry.getByRole('button', {name:/东京 · 青叶/}).getByText('剩 10 天', {exact:true}).waitFor()
    await expectClearGutter(page, rail)
    await expectClearGutter(page, expiry)
    await checkNodeMap(page, output)
    await require('./weekly-traffic-regression.cjs').checkWeekly(context, origin, output)
    await page.screenshot({animations:'disabled',path:path.join(output,'traffic-ranking-1920.png')})
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

    await page.setViewportSize({width:1600,height:640})
    await rail.waitFor()
    await expectClearGutter(page, rail)
    await expectClearGutter(page, expiry)

    const rankBox = await rail.boundingBox()
    assert(!intersects(rankBox, await expiry.boundingBox()), 'the two panels have separate space')
    await page.screenshot({animations:'disabled',path:path.join(output,'traffic-expiry-1600.png')})

    // All reminders must remain reachable even when a short desktop cannot fit the list.
    const extra = Array.from({length:12}, (_, i) => ({...fixtures[1], id:100 + i, sort:100 + i,
      name:'同日到期 ' + (i + 1), day_rx:0, day_tx:0}))
    nodes.push(...extra)
    await expiry.getByText('同日到期 12', {exact:true}).waitFor()
    for (const node of extra) assert.equal(await expiry.getByText(node.name, {exact:true}).count(), 1)
    const lastDue = expiry.getByText('东京 · 青叶', {exact:true})
    await expiry.getByText(expectedDue[0], {exact:true}).hover()
    await page.mouse.wheel(0, 1800)
    await page.waitForFunction(el => {
      const r = el.getBoundingClientRect()
      return el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
    }, await lastDue.elementHandle())
    await expectClearGutter(page, rail)
    await expectClearGutter(page, expiry)

    await lastDue.click()
    await page.getByRole('button', {name:'刷新图表',exact:true}).waitFor()
    assert.equal(new URL(page.url()).pathname, '/node/1', 'clicking the last reminder opens that node')
    assert.equal(await page.getByRole('region', {name:'节点地图',exact:true}).count(), 0)
    await page.goBack()
    await expiry.waitFor()

    for (const [width,height] of [[1599,900], [1920,639], [390,844]]) {
      await page.setViewportSize({width,height})
      await rail.waitFor({state:'hidden'})
      await expiry.waitFor({state:'hidden'})
    }
    const headerAction = page.locator('header').getByRole('button', {name:/排行/})
    await headerAction.click()
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'hidden'})
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)

    await page.setViewportSize({width:1920,height:1080})
    await expiry.waitFor()
    for (const node of nodes) node.expires_at = null
    await expiry.waitFor({state:'detached'})
    assert(await openAll.isVisible(), 'with no upcoming renewals the traffic ranking is still available')
    assert.equal(await page.getByRole('heading', {name:'临期提醒', exact:true, includeHidden:true}).count(), 0)
    await page.getByRole('heading',{name:'东京 · 青叶',exact:true}).click()
    await page.getByRole('button',{name:'刷新图表',exact:true}).waitFor()
    await rail.waitFor({state:'hidden'})
    assert.deepEqual(errors, [])
  } finally {
    nodes.splice(0, nodes.length, ...previous)
    await page.close()
  }
}
