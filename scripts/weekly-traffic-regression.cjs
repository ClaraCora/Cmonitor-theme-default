const assert = require('node:assert/strict')
const path = require('node:path')

function weeklyFixture(now = new Date()) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const days = Array.from({length:7}, (_, index) => new Date(end - (7 - index) * 86400000).toISOString().slice(0,10))
  const bucket = (rx, tx, observed, expected) => ({rx, tx, observed_nodes:observed, expected_nodes:expected})
  const GiB = 1024 ** 3
  const all = days.map((_, i) => bucket((i + 7) * GiB, (i + 2) * GiB, 9, 9))
  const jp = days.map((_, i) => bucket(2 * GiB, (i + 1) * GiB, 2, 2))
  jp[0] = bucket(null, null, 0, 2)
  jp[1] = bucket(0, 0, 2, 2)
  jp[2] = bucket(2 * GiB, 3 * GiB, 1, 2)
  return {days, all, regions:{JP:jp, SG:days.map(() => bucket(null, null, 0, 1))}}
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
  try {
    await page.setViewportSize({width:1920,height:1080})
    await page.goto(origin)
    await day(0).waitFor()
    assert.equal(await chart.locator('[data-traffic-day]').count(), 7)
    assert.match(await label(0), /上传\s*2(?:\.0+)?\s*GB/)
    assert.match(await label(0), /下载\s*7(?:\.0+)?\s*GB/)
    const firstCalls = calls
    assert.ok(firstCalls > 0)
    await map.locator('g[data-map-marker="JP"]').click()
    await chart.getByText('日本', {exact:true}).waitFor()
    assert.match(await label(0), /无记录/)
    assert.match(await label(1), /上传\s*0\s*B/)
    assert.match(await label(2), /上传\s*3(?:\.0+)?\s*GB/)
    assert.match(await label(2), /下载\s*2(?:\.0+)?\s*GB/)
    await day(2).focus()
    await page.keyboard.press('Enter')
    assert.equal(await day(2).getAttribute('aria-pressed'), 'true')
    await page.screenshot({animations:'disabled',path:path.join(output,'weekly-traffic-region.png')})
    await filters.getByRole('button', {name:'SG 1',exact:true}).click()
    await chart.getByText(/近 7 天暂无流量记录/).waitFor()
    await filters.getByRole('button', {name:'清除筛选',exact:true}).click()
    await chart.getByText('全部地区',{exact:true}).waitFor()
    assert.equal(await label(6) !== null, true)
    assert.equal(calls, firstCalls, 'all region changes use the same server snapshot')
    const mapBox = await map.boundingBox()
    const chartBox = await chart.boundingBox()
    assert(chartBox.y >= mapBox.y + mapBox.height - 1, 'chart appears below the map')

    await page.setViewportSize({width:320,height:720})
    unavailable = true
    await page.reload()
    const beforeOpening = calls
    await map.getByRole('button',{name:'节点地图',exact:true}).click()
    await chart.getByRole('button',{name:/重试/}).waitFor()
    assert(calls > beforeOpening)
    unavailable = false
    await chart.getByRole('button',{name:/重试/}).click()
    await day(6).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  } finally {
    await page.close()
  }
}

module.exports = {weeklyFixture, checkWeekly}
