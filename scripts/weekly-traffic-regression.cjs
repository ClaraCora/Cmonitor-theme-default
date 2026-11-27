const assert = require('node:assert/strict')
const path = require('node:path')

function weeklyFixture(now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const days = Array.from({length:7}, (_, index) => new Date(end - (7 - index) * 86400000).toISOString().slice(0,10))
  const GiB = 1024 ** 3
  const node = (id, name, rx, tx) => ({id, name, rx:rx * GiB, tx:tx * GiB})
  const bucket = (rows, expected) => ({
    rx:rows.length ? rows.reduce((sum, row) => sum + row.rx, 0) : null,
    tx:rows.length ? rows.reduce((sum, row) => sum + row.tx, 0) : null,
    observed_nodes:rows.length, expected_nodes:expected,
    top_nodes:[...rows].sort((a,b) => (b.rx + b.tx) - (a.rx + a.tx) || a.id - b.id).slice(0,10),
  })
  const base = Array.from({length:12}, (_, i) => {
    const id = i + 1
    return node(id, '公开节点 ' + id, id, id === 1 ? 40 : id === 11 ? 2 : 1)
  })
  const jpRows = days.map((_, i) => {
    if (i === 0) return []
    if (i === 1) return [node(13, '东京 · 青叶', 0, 0), node(14, '东京 · 备用', 0, 0)]
    if (i === 2) return [node(13, '东京 · 青叶', 2, 3)]
    return [node(13, '东京 · 青叶', 2, i), node(14, '东京 · 备用', 0, 1)]
  })
  // Legacy country names and current ISO codes refer to the same map filter.
  return {days, all:jpRows.map(rows => bucket([...base,...rows], 15)),
    regions:{
      JP:jpRows.map(rows => bucket(rows.filter(row => row.id === 13), 1)),
      Japan:jpRows.map(rows => bucket(rows.filter(row => row.id === 14), 1)),
      SG:days.map(() => bucket([], 1)),
    }}
}

async function checkWeekly(context, origin, output) {
  const page = await context.newPage()
  const data = weeklyFixture()
  let calls = 0
  let unavailable = false
  await page.route('**/api/traffic/weekly', route => {
    calls++
    return unavailable ? route.fulfill({status:503,body:'unavailable'}) : route.fulfill({json:data})
  })
  const chart = page.getByRole('region', {name:'近 7 天流量',exact:true})
  const day = i => chart.locator('[data-traffic-day="' + data.days[i] + '"]')
  const filters = page.getByRole('group', {name:'节点筛选'})
  const map = page.getByRole('region', {name:'节点地图',exact:true})
  const label = i => day(i).getAttribute('aria-label')
  const dialog = page.getByRole('dialog', {name:'当日流量排行'})
  const rowIds = () => dialog.locator('li[data-node-id]').evaluateAll(rows => rows.map(row => Number(row.dataset.nodeId)))
  async function closeDay(i) {
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'hidden'})
    await page.waitForFunction(el => document.activeElement === el, await day(i).elementHandle(), {timeout:3000})
  }
  try {
    await page.setViewportSize({width:1920,height:1080})
    await page.goto(origin)
    await day(0).waitFor()
    assert.equal(await chart.locator('[data-traffic-day]').count(), 7)
    assert.match(await label(0), /上传\s*52(?:\.0+)?\s*GB/)
    assert.match(await label(0), /下载\s*78(?:\.0+)?\s*GB/)
    const firstCalls = calls
    assert.ok(firstCalls > 0)
    await day(0).click()
    await dialog.waitFor()
    assert.deepEqual(await rowIds(), [1,11,12,10,9,8,7,6,5,4])
    const winner = dialog.locator('li[data-node-id="1"]')
    assert.match(await winner.innerText(), /公开节点 1/)
    for (const amount of ['1.00 GB','40.0 GB','41.0 GB']) assert((await winner.innerText()).includes(amount))
    assert((await dialog.innerText()).includes(data.days[0]))
    await dialog.screenshot({animations:'disabled',path:path.join(output,'weekly-day-top10.png')})
    await closeDay(0)
    await map.locator('g[data-map-marker="JP"]').click()
    await chart.getByText('日本', {exact:true}).waitFor()
    assert.match(await label(0), /无记录/)
    assert.match(await label(1), /上传\s*0\s*B/)
    assert.match(await label(2), /上传\s*3(?:\.0+)?\s*GB/)
    assert.match(await label(2), /下载\s*2(?:\.0+)?\s*GB/)
    await day(2).focus()
    await page.keyboard.press('Enter')
    await dialog.waitFor()
    assert.deepEqual(await rowIds(), [13], 'day and region narrow the ranking')
    assert((await dialog.innerText()).includes('东京 · 青叶'))
    await closeDay(2)
    await day(1).click()
    await dialog.waitFor()
    assert.deepEqual(await rowIds(), [13,14], 'measured zero-byte nodes are ranked')
    await closeDay(1)
    await day(0).click()
    await dialog.getByText('当天没有流量记录', {exact:true}).waitFor()
    assert.deepEqual(await rowIds(), [])
    await closeDay(0)
    await page.screenshot({animations:'disabled',path:path.join(output,'weekly-traffic-region.png')})
    await filters.getByRole('button', {name:'SG 1',exact:true}).click()
    await chart.getByText(/近 7 天暂无流量记录/).waitFor()
    await filters.getByRole('button', {name:'清除筛选',exact:true}).click()
    await chart.getByText('全部地区',{exact:true}).waitFor()
    assert.equal(await label(6) !== null, true)
    assert.equal(calls, firstCalls, 'all region changes use the same server snapshot')
    const mapBox = await map.boundingBox()
    const chartBox = await chart.boundingBox()
    assert(chartBox.x + chartBox.width <= mapBox.x + 1, 'chart appears in the left gutter beside the map')

    await page.setViewportSize({width:320,height:720})
    unavailable = true
    await page.reload()
    const beforeOpening = calls
    await page.getByRole('button',{name:'近 7 天流量',exact:true}).click()
    await chart.getByRole('button',{name:/重试/}).waitFor()
    assert(calls > beforeOpening)
    unavailable = false
    await chart.getByRole('button',{name:/重试/}).click()
    await day(6).waitFor()
    await day(0).click()
    await dialog.waitFor()
    await dialog.locator('li[data-node-id]').last().scrollIntoViewIfNeeded()
    const box = await dialog.boundingBox()
    assert(box.x >= 0 && box.x + box.width <= 321, 'the ranking fits a narrow screen')
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1), true)
    await closeDay(0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  } finally {
    await page.close()
  }
}

module.exports = {weeklyFixture, checkWeekly}
