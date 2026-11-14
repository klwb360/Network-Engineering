# 原版运行适配层

## 边界与来源

本项目保留原站公开生产产物，并通过很小的 AST 定位变更接入自有课程。它没有恢复作者的原始文件、变量名或模块边界，也没有重新实现播放器、SVG 或检查器。

| 资料 | 作用 |
| --- | --- |
| `protocol-analysis/raw/index-CNPseYOQ.js` | 固定原始 JS，不编辑、不自动更新 |
| `protocol-analysis/raw/index-CwjpA-vk.css` | 固定原 CSS；本地副本保持逐字节一致 |
| `protocol-analysis/derived/index.pretty.js` | 仅用于阅读和源码行号证据 |
| `protocol-analysis/research/` | 原始课程、工具、截图和测试证据 |
| `app/src/vendor/original-runtime.mjs` | 可重建的运行产物，不手改 |
| `app/runtime-provenance.json` | 原包哈希、插入范围、原因及语言引用 |
| `app/vendor-asset-manifest.json` | 公开资源 URL、发现来源、大小和 SHA-256 |

原主包 SHA-256：

```text
19e285d11f5fa0b1411ec94aaea6cd04531872e8322bb8a46c80e4f92e262834
```

## 生成方式

[prepare-runtime.mjs](../scripts/prepare-runtime.mjs) 使用 Babel parser 读取原包，在确认哈希和 AST 形状后进行定位替换。当前有 22 项 AST 定位变更：

1. 将 20 个相对动态语言 import 指向 `/assets/` 下的原始文件。
2. 在原版顶层 `await ry()` 前调用 `installCourses()`，传入 `_s`、`Ts`，以及从原 AST 派生的 `nodes/routes/frames/frameNodes/payloadKinds` capabilities。设备、路线和 frame 来自 `ye/tw/gh`；frame 的设备映射来自 `gh` 数组，payload 分派来自 `zw` 的实际分支。
3. 在字符串翻译函数 `S()` 的输入检查之后，先确认原语言字符串表缺少该键，再查询自有课程词条。自有词条命中时复用原版占位参数替换；原语言包已有词条保持优先，其他情况继续原版字典、模式匹配和英文回退。

此外，生成文件前缀会导入课程注册与翻译函数。AST 定位变更和模块导入前缀分别记录，不应把前缀算作第 23 项 AST 替换。

```sh
npm run prepare:runtime
```

输出再次经过语法解析。哈希、翻译入口形状、启动边界或语言 import 数量变化时会失败；升级原站快照需要重新审计，而不是机械修改常量。

## 运行路径

```text
app/src/main.mjs
  → vendor/original-runtime.mjs
    → courses/registry.mjs
      → 各独立课程、helper、翻译与元数据
    → 启动前校验并注册
    → 原版语言加载、DOM 构造、播放器与 SVG
```

原版 `_s` 是课程对象表，`Ts` 是导航数组。它们在首次 DOM 构造前加入自有课程，仍由原版函数派生导航、分组数、进度条和搜索内容。当前新课使用既有 group；新增 group 需要同时扩展原版分组 UI 与标签，不能只改课程字段。

原版 `VS()` 协调事件队列和多个面板；`_S()` 负责网络动画的 run/apply；时序图从同一批报文派生布局；`Gu()` / `Xg` 从 wire 生成检查器字节。网络粒子、时序几何和教学播放使用不同的时间尺度，不应当作真实网络计时器。

## 资源覆盖与懒加载

[sync-public-assets.mjs](../scripts/sync-public-assets.mjs) 仅解析原始 HTML、JS import、Vite 显式预加载列表、CSS `url()` 和 webmanifest 图标。不猜测路径，不抓取未引用的资源，不执行下载的代码。

当前清单包含 54 个文件：20 个语言模块覆盖 21 种语言（英语内置）、一个共享模块、24 个字体、原 CSS，以及 8 个根路径图标/manifest/分享图片。现有文件按清单校验 SHA-256；网络请求继承环境代理和 CA，失败时显式终止，不关闭 TLS 校验。

`app/public/` 作为静态根覆盖资源。运行模块移至自有源码目录后，绝对语言 import 仍能找到同一资源，原预加载路径和 CSS 字体路径也保持有效。资源清单和课程源码应一起维护；不要通过删掉语言选项来掩盖缺失文件。

## 扩展边界

- 新课程应使用独立描述符和统一注册器，不直接向压缩包追加课程正文。
- `capabilities` 必须来自实际运行能力。新设备、路线、frame 或 codec 需有原实现接入证据、明确适配点及对应测试。
- 设备标签与设备 ID 不同；labels 不能创造 SVG 图形或路径。
- 已知 frame 也可能与当前课程的设备无交集。校验会检查 `frameNodes`，避免对空设备集合计算无效 viewBox；不能只验证 frame 名称存在。
- TCP/UDP 中的 data 还需命中已支持的 payload 编码分派。只提供合法的传输层键，并不意味着任意内部对象可被原检查器编码。
- 端点对缺失 latency 会使时序图和报文交付失败，应在启动前拒绝。
- 检查器按课程对象缓存整课编码结果；不要在热运行中原地修改同一个课程对象。
- 自有 TCP helper 只支持单个不超过 1460 字节的载荷；超限会拒绝。原编码器能演示分段，不等于该 helper 已正确计算多段消息的列表长度，扩展前应新增独立的分段策略。
- 原版 reduced-motion 只覆盖部分动画；保留原风格不等于已经解决全部可访问性问题。若扩展此策略，需单独验证网络和时序两个模式。
- 原版以太帧字节不含网卡附加的 FCS；部分加密、随机和文件内容以未知字节表示。不要把教学字节交付物称为完整抓包。

## 保留基线与升级方法

`protocol-analysis/` 是只读历史基线。原来的 `inspect-original.cjs` 会写回原分析目录，因此本地回归使用独立测试副本，并将新结果写到 `artifacts/`。原 24 项断言和新课断言应共同通过；构建前还应检查历史资料哈希。

升级快照时，先在新的分析工作目录重新收集公开资源和源码证据；核对注册、翻译、播放器、SVG、报文 codec 与启动顺序，再更新生成脚本、基线和资源清单。保留前一版证据并解释变化；未知快照不能直接作为可信输入执行。完成可比较的回归后再采用新快照。

当前使用原生 ES modules 和静态开发服务器；没有为了新增课程引入 React 或新的 Vite 构建层。构建是静态文件生成与拷贝，正式部署留待后续发布任务处理。

首课已验证 24 项原回归、29 项新课浏览器断言和 25 项 Node 单元测试。`npm run build` 成功后，再运行 `npm run verify:build`：从 `dist/` 检查 40 课、CSS 原始哈希、全部 21 种语言及失败资源/JavaScript 错误。首次固化时 4 项构建断言全部通过；详细记录见 [制作流程中的验证基线](course-authoring.md#首课已跑通的验证基线) 与 `artifacts/build/build-evidence.json`。
