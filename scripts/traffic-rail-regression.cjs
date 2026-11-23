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

module.exports = async function checkTrafficRail(context, origin, nodes, output) {
  const previous = nodes.slice()
  const now = Math.floor(Date.now() / 1000)
  const fixtures = fleet.map(([name, country, rx, tx], index) => ({
    ...previous[0], name, country, id: index + 1, sort: index, public: index < 7,
    day_rx: rx * GiB, day_tx: tx * GiB, total_rx: rx * 8 * GiB, total_tx: tx * 10 * GiB,
    month_rx: rx * 2 * GiB, month_tx: tx * 2 * GiB, traffic_limit: 1024 * GiB,
    expires_at: new Date((now + 18 * 86400) * 1000).toISOString().slice(0,10),
    currency: 'CNY', price: 28 + index * 4, tags: ['双栈;1Gbps','游走;2Gbps','备用;1Gbps'][index % 3],
    metrics: {...previous[0].metrics, cpu: 7 + index * 4, mem_total: 4 * GiB, mem_used: (0.5 + index / 4) * GiB,
      disk_total: 40 * GiB, disk_used: (6 + index * 2) * GiB, net_rx: (index + 1) * 125000, net_tx: (8 - index) * 70000},
    pings: [{id:1,name:'Cloudflare',latency:12 + index,updated_at:now,samples:[11,14,12,11,15,13,12,13]}],
  }))
  nodes.splice(0, nodes.length, ...fixtures)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.setViewportSize({width:1920,height:1080})
    await page.goto(origin + '/')
    const rail = page.locator('[aria-label="今日流量排行浮窗"]')
    const openAll = rail.getByRole('button', {name:'查看完整排行',exact:true})
    const dialog = page.getByRole('dialog', {name:'今日流量排行',exact:true})
    await page.getByRole('complementary', {name:'来访者信息'}).waitFor()
    await expectNames(rail, firstFive)
    await expectClearGutter(page, rail)
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
    await page.getByRole('button', {name:'展开今日流量排行',exact:true}).click()
    await expectNames(rail, firstFive)
    // A new arrival in the top five must evict the old fifth row without a reload.
    fixtures[5].day_tx = 72 * GiB
    await expectNames(rail, ['悉尼 · 北港', ...firstFive.slice(0,4)])

    await page.setViewportSize({width:1600,height:640})
    await rail.waitFor()
    await expectClearGutter(page, rail)
    for (const [width,height] of [[1599,900], [1920,639], [390,844]]) {
      await page.setViewportSize({width,height})
      await rail.waitFor({state:'hidden'})
    }
    const headerAction = page.locator('header').getByRole('button', {name:/排行/})
    await headerAction.click()
    await dialog.waitFor()
    await page.keyboard.press('Escape')
    await dialog.waitFor({state:'hidden'})
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)

    await page.setViewportSize({width:1920,height:1080})
    await page.getByRole('heading',{name:'东京 · 青叶',exact:true}).click()
    await page.getByRole('button',{name:'刷新图表',exact:true}).waitFor()
    await rail.waitFor({state:'hidden'})
    assert.deepEqual(errors, [])
  } finally {
    nodes.splice(0, nodes.length, ...previous)
    await page.close()
  }
}
