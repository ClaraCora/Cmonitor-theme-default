# Cmonitor 默认主题

[Cmonitor](https://github.com/ClaraCora/Cmonitor) 的内置默认主题，基于
[monitor-theme-default](https://github.com/monitor-probe/monitor-theme-default) 修改。

主题使用 React、Vite 和 shadcn/ui，提供节点实时状态、TCPing 最近 20 次延迟与丢包状态、历史图表与彩色标签。

首页的节点地图按国家和地区汇总公开节点。点击地图上的地区或标记可筛选节点，再点一次可取消。首页筛选条中的地区按钮支持键盘操作，并与地图所选地区同步。大屏在右侧默认展开，较小屏幕可在筛选条下方打开。底图随主题分发，未标注地区的节点只计入数量。

地图下方显示 Hub 所在时区最近七个完整自然日的流量。绿色是上传，橙色是下载，柱顶显示每日合计。选择日期可读到三项数值。选中地区后，图表随地图和首页地区筛选同步。没有记录的日期显示「—」，只收到部分节点记录时会标明统计范围。此功能需要 Hub 1.10.0 或更高版本。

TCPing 圆点按延迟着色：低于 100 ms 为绿色，100–199 ms 为黄色，达到 200 ms 或丢包为红色。

节点详情页的延迟图表为每个探测分配固定颜色，卡片显示窗口平均延迟、丢包率与平均波动；部分丢包的
时段在曲线上以红色圆环标记，全部丢包的时段在图表底部以红点标记。

顶部的剩余价值按 `单期价格 × 剩余时长 ÷ 计费周期时长` 估算，统一换算为 CNY 合计显示。
外币汇率使用 [Currency API](https://github.com/fawazahmed0/exchange-api) 的每日数据，通过 jsDelivr 获取，
失败时切换备用源；只请求公开汇率，不发送节点数据。浏览器缓存 6 小时，获取失败时可沿用
7 天以内的缓存并显示提示；没有可用汇率时显示重试入口，不展示不完整的合计。卡片注明汇率日期。
计费周期使用到期日前一个完整日历周期，与 Hub 的按月续费规则一致；
已过期节点计为零，永久、一次性、未设置有效价格或到期日的节点不计入。

## 标签格式

在 Hub 后台编辑节点时填写标签，多个标签使用英文分号 `;` 分隔：

```text
二网精品; 1Gbps<green>; 21日<amber>
```

颜色写在标签末尾，格式为 `<color>`。支持的名称与
[Radix Themes Color](https://www.radix-ui.com/themes/docs/theme/color) 一致；省略颜色或名称无效时使用默认中性色。

Hub 1.6.0 与主题 1.3.0 起可在后台「设置 → 预设筛选标签」配置多个标签：每行一个，或用中英文分号分隔，例如 `游走;主力;备用`。
最多 12 个，每个最多 32 个字符；自动去除空项、首尾空格和重复项，保留填写顺序。原有单标签配置继续生效。
状态页在国别按钮最左侧依次显示每个标签及对应公开节点数量，按完整标签文字匹配，忽略有效颜色后缀；留空隐藏全部预设。
标签与国别单选切换，可叠加节点状态筛选；URL 保留筛选，详情返回后仍生效。公开页不再提供名称或标签搜索。

## 开发

启动一个 Hub 实例：

```bash
monitor-hub --listen 127.0.0.1:9911 --db /tmp/monitor.db --site http://127.0.0.1:9911
```

启动开发服务器，Vite 会把 `/api` 与 WebSocket 代理到 Hub：

```bash
npm ci
npm run dev
```

构建产物位于 `dist/`。提交前运行 `npm run build && npm run lint && npm test`。

## 主题包

Release 中的 `theme.tar.gz` 可直接安装到 Hub 的主题目录：

```text
<themes-dir>/default/
├── theme.json
├── preview.png
└── dist/
    └── index.html
```

主题使用 `/api/nodes` 和 `/api/ws` 获取节点、实时指标、最新 TCPing 与标签，使用
`/api/nodes/{id}/metrics` 获取历史指标和延迟记录。

## 许可

MIT
