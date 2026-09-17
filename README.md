# Cmonitor 默认主题

[Cmonitor](https://github.com/ClaraCora/Cmonitor) 的内置默认主题，基于
[monitor-theme-default](https://github.com/monitor-probe/monitor-theme-default) 修改。

主题使用 React、Vite 和 shadcn/ui，提供节点实时状态、TCPing 最近 20 次延迟与丢包状态、历史图表与彩色标签。

TCPing 圆点按延迟着色：低于 100 ms 为绿色，100–199 ms 为黄色，达到 200 ms 或丢包为红色。

## 标签格式

在 Hub 后台编辑节点时填写标签，多个标签使用英文分号 `;` 分隔：

```text
二网精品; 1Gbps<green>; 21日<amber>
```

颜色写在标签末尾，格式为 `<color>`。支持的名称与
[Radix Themes Color](https://www.radix-ui.com/themes/docs/theme/color) 一致；省略颜色或名称无效时使用默认中性色。

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
