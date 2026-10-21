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
- **布局**：默认左右并排（1 × 2）。布局下拉框位于**会话标题栏右侧的工具区**（Agent Team、费用、导出那一排），只在分屏视图激活时出现，不再占用内容区顶部一整条。
- **默认落位**：开启分屏时，当前会话会自动进入左上/左侧第一个空窗格，打开即可直接输入。
- **焦点跟随**：当会话面板切换到已经显示在窗格里的会话（例如标题栏的子代理切换器打开子会话 B）时，分屏网格会把这个会话所在的窗格设为焦点。
- **放入会话**：从左侧会话列表把会话行**拖进**任意窗格，或点窗格标题打开搜索选择器（拖动时目标窗格高亮）。选择器里子代理会话按母会话分组收拢，点母会话行右侧箭头展开/收起；搜索时自动展开匹配项，子代理行带「子代理」标签。
- **每个窗格**：独立的记录、输入框、草稿、运行状态与附件栏；标题栏可切换/关闭窗格，运行中的窗格标题左侧有状态点。
- **composer 处理**：当当前会话出现在窗格里时，底部主输入框会临时隐藏，由窗格里的 composer 接管输入；进入/退出这种状态时都会做一次确定性的 composer 重挂（主面板先挂、窗格后挂），保证可见窗格的 composer 持有唯一的 Lexical 编辑根。另有看门狗检测「窗格里能显示字、draft 却是空」的失配（对 IME 输入有保护），自动重挂并把已输入文字写回 draft，不会出现文字发不出去。
- **拖拽上传附件**：分屏期间拖入窗格的文件由插件统一路由到鼠标所在会话，**每个文件只上传一次**——宿主会为每个已挂载的 composer 各装一份 document 级上传入口，当前会话同时有主面板和窗格两份，若交给宿主会把同一文件上传两次。文件夹拖拽仍回退到宿主默认处理（路径引用）。**子代理会话按宿主设计不接受附件**（一次性子代理是只读 composer，可续子代理在发送时会被宿主拒绝），拖文件到子代理窗格时插件会忽略，并在分屏区域下方弹出居中提示条「子代理会话不支持附件」，不会产生失败的上传。分屏期间不再弹出全屏的“拖入上传”遮罩（宿主实现会为每个已挂载 composer 各渲染一层全屏遮罩，多窗格会叠层甚至卡住），改用窗格高亮提示落点；松开鼠标后照常上传。
- **顶部信息栏完整保留**：标题、Agent Team、模式、费用、导出、右侧栏开关等照常可用。

## 实现 / How it works

- 在 `conversation.view` 列表槽注册视图 `split-view`（`label` 走 locale，`order: 20`）；布局下拉框注册在
  `conversation.session.header.utilities`，只在分屏激活时渲染。
- 视图本身负责：把当前会话放进第一个空窗格、测量视图区域矩形、把矩形发布给 `shell.overlay` 里的网格。
- 窗格网格注册在 `shell.overlay`（帧级浮层，位于 `conversation.content` 工厂之外），按测量出的矩形精确覆盖视图区域；因此每个窗格都能安全地渲染 `conversation.content` 工厂的 `embedded` 变体（渲染器禁止在同一个工厂实例内递归渲染该工厂）。
- 分屏期间在 document 捕获阶段拦截文件拖拽的 `dragenter`，关闭宿主按 composer 逐个渲染的全屏上传遮罩（`dragover` / `drop` 不拦截，上传链路保持原样）。
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
