# dsh-split-view

[![npm version](https://img.shields.io/npm/v/@wxysskd/dsh-split-view.svg)](https://www.npmjs.com/package/@wxysskd/dsh-split-view)
[![license](https://img.shields.io/npm/l/@wxysskd/dsh-split-view.svg)](./LICENSE)

DeepSeek Harness 分屏插件：在一个会话视图里并排查看/操作多个实时会话（左右并排、上下、田字格、六宫格、九宫格），左侧会话可直接拖进窗格。

A split-screen Conversation View for DeepSeek Harness: arrange several live Sessions side by
side, stacked, in a 2 × 2 grid, or in a 3 × 3 grid — and drag Session rows from the sidebar
straight into a pane.

## 安装 / Install

### 插件市场 (推荐)

在 DSH Desktop 打开 **Plugins → Discover**，添加市场索引：

```
https://aobakaolengmian.github.io/dsh-projects/market/index.json
```

然后在卡片里安装 **Split View**（安装的是 `@wxysskd/dsh-split-view` 的最新发布版本）。安装完按提示重启一次。

### npm / CLI

```bash
# 直接安装到当前 profile
npx @deepseek-ai/dsh plugin-manager install-bundle @wxysskd/dsh-split-view
```

或者用 Agent 工具：

```
plugin_manager install_bundle target="@wxysskd/dsh-split-view"
```

手动安装：`npm install @wxysskd/dsh-split-view`，把 `@wxysskd/dsh-split-view` 加入 profile 的
`package.json` → `dsh.profile.bundles`，并在 `cordis.patch.yml` 里保留包内 `cordis.patch.yml` 提供的
`split-view` 行（插件以 bundle 形式提供自己的 patch）。

## 使用 / Usage

- **入口**：会话标题栏的视图标签行里有「分屏」标签（与 Chat、Trajectory 并列）。切到它即进入分屏；切回 Chat 即退出。视图选择随会话持久化。
- **默认布局**：左右并排（1 × 2），可在工具栏切换单屏 / 上下 / 田字格 / 三列 / 3×2 / 九宫格。
- **默认落位**：开启分屏时，当前会话会自动进入左上/左侧第一个空窗格，打开即可直接输入。
- **放入会话**：从左侧会话列表把会话行**拖进**任意窗格，或点窗格标题打开搜索选择器（拖动时目标窗格高亮）。选择器里子代理会话按母会话分组收拢，点母会话行右侧箭头展开/收起；搜索时自动展开匹配项，子代理行带「子代理」标签。
- **每个窗格**：独立的记录、输入框、草稿、运行状态与附件栏；标题栏可切换/关闭窗格，运行中的窗格标题左侧有状态点。
- **composer 处理**：当当前会话出现在窗格里时，底部主输入框会临时隐藏，由窗格里的 composer 接管输入；退出分屏（切回 Chat）时底部 composer 会被干净重建并保留草稿，不会重影或发不出字。
- **拖拽上传附件**：文件只会进入鼠标所在的窗格，其它输入框误收的附件会被立即撤回并去重。
- **顶部信息栏完整保留**：标题、Agent Team、模式、费用、导出、右侧栏开关等照常可用。

## 实现 / How it works

- 在 `conversation.view` 列表槽注册视图 `split-view`（`label` 走 locale，`order: 20`）。
- 视图本身负责：把当前会话放进第一个空窗格、测量视图区域矩形、把矩形发布给 `shell.overlay` 里的网格。
- 窗格网格注册在 `shell.overlay`（帧级浮层，位于 `conversation.content` 工厂之外），按测量出的矩形精确覆盖视图区域；因此每个窗格都能安全地渲染 `conversation.content` 工厂的 `embedded` 变体（渲染器禁止在同一个工厂实例内递归渲染该工厂）。
- 当当前会话位于窗格中时，通过一条只在分屏期间启用的样式隐藏**底部** composer 座位（`[data-composer-seat]:not([data-split-view] *)`），让窗格 composer 独占唯一的可编辑 Lexical 根；退出分屏时临时遮蔽 `conversation.composer.bar`（priority -1，约 120ms，带 2s 看门狗）强制 InputBar 卸载重建，把 editor 根重新绑回底部 composer，草稿保留。
- 会话引用通过 `ctx.sessions.retain(id, { source: 'splitView' })` 持有，视图卸载即释放。
- 只使用 `--dsw-*` 主题变量；不导入任何 Harness Client 包；CSS 全部限定在 `dshsv-` 前缀下。

## 与其它插件的隔离 / Isolation

- 只使用增量席位：`conversation.view` 的 id `split-view`、`shell.overlay` 的 id `split-view-grid`、9 个作者命名空间的窗格插槽 `@wxysskd/dsh-split-view/pane.N`。
- 不添加中央面板、标题栏按钮、会话行按钮或侧边栏底部按钮；不改动任何内置 occupant。
- 本地存储键 `@wxysskd/dsh-split-view/v2`；会话引用来源 `splitView`，不与核心或其它插件共用计数。
- CSS 仅在 `dshsv-` 前缀类下，只引用 `--dsw-*` 变量；不写 `html/body/:root`。
- 只在会话选择器打开期间挂 Escape 监听；不注册全局快捷键；不向 `document.body` 追加节点。

## 兼容性 / Compatibility

DeepSeek Harness 0.2.1-rc.2 桌面端（会话视图槽、`conversation.content` 工厂的 `embedded` 变体、
Session 作用域本地插槽、`shell.overlay` 帧级浮层）。桌面端与浏览器 Web GUI 均可使用。

## 开发 / Development

```bash
git clone https://github.com/aobakaolengmian/dsh-split-view.git
cd dsh-split-view
# 在 DSH profile 里 link 到本目录，然后重启桌面端；开发期 HMR 会热更新 client.js
npm link
```

- `client.js` 是浏览器半（纯 JS bundle，无需构建）。
- `index.js` 是 Host 半（无行为，只提供 bundle 入口）。
- `locale/{zh,en}.json`、`icon.svg`、`cordis.patch.yml` 随包发布。

## License

[MIT](./LICENSE)
