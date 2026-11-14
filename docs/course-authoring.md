# 课程制作流程

本项目在已保存的 Protocol Explorer 公开生产快照上新增独立课程，复用原站的 DOM、SVG、样式、播放器和报文检查器。它不是作者原始源码仓库的恢复，也不通过真实网络报文驱动教学。

现有 39 课、原始资源和 24 项浏览器断言保留在 `protocol-analysis/`。课程目录见 [course-catalog.json](../protocol-analysis/derived/course-catalog.json)，实现证据见 [分析报告](../protocol-analysis/report.html)。开发适配层见 [runtime-adapter.md](runtime-adapter.md)。

## 1. 开始前建立基线

使用 Node.js 24，安装根目录锁文件中的依赖。保留 `protocol-analysis/` 及其测试结果，新的截图、协议字节检查和浏览器结果写入 `artifacts/`。

```sh
npm ci --cache /tmp/protocol-course-npm-cache
npm run baseline:check
npm run assets:check
npm run assets:sync
npm run prepare:runtime
```

`baseline:check` 核对历史分析资料；`assets:check` 只校验已保存的资源，日常开发不需要访问原站；`assets:sync` 在资源缺失时根据原站显式引用补齐文件；`prepare:runtime` 从绑定 SHA-256 的原始主包生成运行适配层。遇到哈希不匹配时，应核对变更来源和接入点，不要只更新哈希来跳过检查。已有完整资源时不必执行同步。

不要手改 `app/src/vendor/original-runtime.mjs`。重新生成会覆盖该文件；课程、翻译和验证规则应放在自有模块中。

## 2. 先选教学目标，再写报文

先检查 39 课目录及邻近主题的实际步骤。新主题应补足知识缺口，或明确深入现有课程未展开的部分，而不是只换名称复制课程。优先选择能复用既有节点、路线和报文编码器的第一版。

每课先写一份 brief，可以保存在课程元数据与对应说明中。至少说明：

| 内容 | 要写清的决定 |
| --- | --- |
| 学习对象与目标 | 学完后能够解释或检查的具体行为 |
| 与已有课程的差别 | 现有哪一课讲到哪里，本课补哪一层 |
| 标准依据 | RFC/标准的准确章节及链接；区分 MUST、SHOULD、MAY |
| 拓扑与观察点 | 设备 ID、IP、端口、路线、模拟延迟和观察位置 |
| 分步过程 | 每一步的前置状态、解释、事件和预期结果 |
| 关键报文 | 方向、模拟发送时间、字段、长度和成功/异常分支 |
| 范围与省略 | 哪些行为被简化；哪些没有模拟 |
| 验证方法 | 应出现的列表行、字段字节、播放与交互行为 |

首课 `http-cache` 以 HTTP 缓存和条件请求为主题：新鲜响应的本地复用、`ETag` / `If-None-Match`、无正文的 304、资源变化后的 200，以及 `no-cache`、`no-store`、离线时的 `must-revalidate` 边界。它有 6 个步骤、9 条教学报文，其中 3 条 TCP 握手和 6 条 HTTP 报文；本地缓存命中用 note 表示，不虚构网络包。

该课的课程数据和标准链接位于 [http-cache.mjs](../app/src/courses/http-cache.mjs)，选题与范围见 [课程 brief](../app/src/courses/http-cache.brief.json)。时间、缓存状态和报文是确定性的教学脚本；静态开发服务器并未实现真实浏览器缓存后端。

## 3. 从模板建立独立课程

```sh
cp app/templates/course.mjs app/src/courses/my-topic.mjs
```

模板的 import 按复制后的 `app/src/courses/` 位置编写。修改 ID、名称、标准依据、讲解、端点和事件；不要直接注册仍带有 `replace-me` 的示例。

一个课程描述符包含：

```js
export default {
  lesson,        // 原版播放器和界面使用的数据
  navigation,    // id、name、full、group
  translations,  // { zh: { strings: { 英文原文: 中文翻译 } } }
  meta,          // 学习目标、标准、假设及测试预期
};
```

`lesson` 应具备 `id/name/title/layer/nodes/latency/legend/overview/outro/start/steps`。步骤应提供 `title/desc/detail/facts/events`，总结提供 `title/desc/text/facts`。OSI layer 使用 1–7；导航 group 复用 `core`、`application`、`security`。

事件沿用原版的 `show`、`camera`、`packet`、`stream`、`note`、`label`、`type-url`、`render`。播放器会插入初始 focus。每一步都应有能够解释本地或网络行为的事件；没有网络传输的步骤可用 note，不要添加假的 packet。

### 拓扑与模拟时间

- `nodes`、packet 的 `from/to` 和 note 的设备必须使用现有设备 ID。首课复用 `client/router/internet/web`。
- `start.frame` 及事件 frame 必须存在于适配层暴露的 frame 集合，且 frame 关联设备中至少有一个属于本课；例如本课可以使用 `client`、`local`、`path`、`full`，不能使用与本课设备无交集的 `bgp`。
- 每对收发端点必须有 `latency`，例如 `{ 'client-web': 0.017 }`。原版时序图和 TCP 交付模型都依赖它。
- `row.time` 是课程模拟发送时间，不是播放时钟。时序布局会压缩长等待；网络粒子的时长取决于图上距离和教学节奏。
- `labels` 只能替换已有设备的标注，不能添加设备、端点或路线。

需要新设备、路线或报文编码器时，先记录原版接入证据，再扩展运行适配层和 capabilities，补对应验证。不要在课程文件中绕开检查或伪造不存在的支持。

### 字节、列表与讲解必须一致

[helpers.mjs](../app/src/authoring/helpers.mjs) 提供 `httpMessage`、`tcpPacket`、`tcpHandshake` 和 `asciiBytes`。

```js
const message = httpMessage({
  startLine: 'HTTP/1.1 200 OK',
  headers: ['Content-Length: 3', 'Content-Type: text/plain'],
  body: 'OK\n',
});
```

HTTP 行以 CRLF 编码，空行结束头部，正文按原样追加。此 helper 的 wire 文本限定 ASCII；中文讲解应放在翻译表中。`Content-Length` 按正文的字节数填写；304 不得带正文。

`row` 同时承载列表与检查器的输入：`time/src/dst/proto/info/len/wire`。`wire` 不因界面语言切换而变化。报文字节中的未知密文、随机值和文件内容应保留未知，不要填入看似真实的随机数据。现有检查器通过字段偏移实现 hex/ASCII 联动，不是导入真实抓包的解析器。

当前 TCP authoring helper 面向无时间戳、单段的既有 Ethernet/IPv4/TCP 场景：SYN 头部 32 字节、后续 TCP 头部 20 字节，以太帧至少 60 字节。单个 TCP 载荷最多 1460 字节，包含 HTTP 头部和正文，超过即拒绝；不只是限制正文大小。Linux 时间戳、SACK、不同链路或分段课程需要专门的长度策略和字节检查，不能直接沿用这些常量。

## 4. 注册、翻译与校验

在 [registry.mjs](../app/src/courses/registry.mjs) 新增一个描述符 import，并加入 `customCourses`：

```js
import myTopic from './my-topic.mjs';
export const customCourses = [httpCache, myTopic];
```

注册发生在原版加载语言和创建 DOM 之前。注册器先校验整个批次，再修改原课程表与导航，拒绝重复 ID。导航数量、分组、学习进度和搜索由注册后的数组派生，无需另写第 40、41 课的计数。

课程使用英文规范文本作为翻译键；中文词条可放到 `app/src/locales/<id>.zh.mjs` 并从课程文件导入。首课即采用此方式。保留已有 21 种语言的选择与原语言包；原语言包已有字符串优先，缺少键时才查询自有课程词条，没有自有翻译的语言沿用英文回退。翻译解释、标题、payload 和注释，不翻译协议 wire 字节。相同英文键在不同课程中应保持一致含义与翻译。

```sh
npm run courses:check
```

根据校验输出修复结构、设备、路线、延迟、时间、长度、元数据或翻译问题。校验器与 capabilities 是维护合同：设备、路线、frame、frame 对应设备和 payload 编码分派均从固定原包 AST 提取；未知协议分支或 payload 不能靠随意写一个对象通过。扩展能力后同步更新它们，并保留拒绝无效课程的测试。

课程注册后不要原地修改已播放对象的 `steps` 或 `wire`。检查器按课程对象缓存编码结果；开发编辑后应重新加载页面，生成新的课程对象和播放器。

## 5. 验证、构建与交付

```sh
npm run dev
# 另一个终端
npm test
npm run build
npm run verify:build
npm run preview -- --port 4174
```

`dev` 和 `preview` 默认使用本地 4173 端口；同时运行时，示例将 preview 改到 4174。浏览器测试和构建验证会自行启动临时端口服务，不依赖正在运行的 dev。测试需要 Chromium，默认路径 `/usr/bin/chromium`，其他安装位置通过 `CHROMIUM_PATH` 指定。现有脚本的实际行为与参数以根目录 [package.json](../package.json) 为准。

保留原来的 24 项浏览器断言，并对本地扩展应用重新执行；不要覆盖历史截图或 `protocol-analysis/research/browser-evidence.json`。新课需要验证：

1. 原 39 课仍可发现；新课在导航、搜索、计数、OSI 和解释栏中一致显示。
2. 切换课程、网络/时序视图、播放、暂停、恢复、逐事件步进、调速、重播及 reset。
3. 跳步重建状态；点击报文暂停播放；列表和时序图选中同一报文。
4. 字段与 hex/ASCII 双向高亮；协议层、长度、正文及校验和符合已编码内容。
5. 中文切换、无翻译时的英文回退、原 SVG/字体/主题和手机布局。
6. 新课特有的标准要求和异常情况；例如本地缓存命中不增加报文，304 没有正文，ETag 变化后返回新正文。

测试结果以本次 `artifacts/` 中的实际证据为准。不能因为能渲染页面就宣称协议过程正确，也不能因为符合标准就跳过播放和交互检查。更新课程时同步修改元数据、测试预期和说明。

`build` 生成静态交付目录，`verify:build` 从 `dist/` 启动临时服务，验证原 CSS、课程数量、全部语言加载和资源/JavaScript 错误；`preview` 用于本地查看。当前阶段完成课程工作流和第一课；正式部署属于后续工作，不由上述命令自动发布。

### 首课已跑通的验证基线

2026-11-13 完成下列验证。它们是首课制作流程固化的依据；修改课程或适配层后仍应重新执行，而不是把历史结果当作本次结果。

| 验证层 | 实际结果 | 证据 |
| --- | --- | --- |
| 历史分析文件 | 54 个文件哈希未变 | `npm run baseline:check` |
| 原有浏览器回归 | 24/24 通过 | [baseline evidence](../artifacts/baseline/research/browser-evidence.json) |
| 首课浏览器回归 | 29/29 通过；无 JavaScript 错误 | [http-cache evidence](../artifacts/http-cache/browser-evidence.json) |
| Node 单元测试 | 25/25 通过，含模板经当前校验与注册合同验证 | `npm run test:unit` |
| 实际检查器字节 | UI 提取的 9 帧均为已知字节；帧长正确；IPv4/TCP 独立校验和通过；6 条 HTTP 载荷逐字节符合 CRLF 与正文预期；304 正文为 0 字节 | [http-cache evidence](../artifacts/http-cache/browser-evidence.json) |
| 静态构建 | `npm run build` 成功 | `dist/` |
| 构建浏览器检查 | 4/4 通过；21 种语言逐一切换成功，包含 Arabic/Hebrew RTL、French 下的新课英文回退和自有中文；CSS 与原始哈希相同；无失败资源或 JavaScript 错误 | [build evidence](../artifacts/build/build-evidence.json) |

原有与新课合计 53 项浏览器断言；构建验证另计 4 项。上述检查确认这份教学脚本和界面能够工作，不表示实现了真实浏览器缓存后端或完整通用协议栈。

## 完成一课的记录

提交或交付前记录选题依据、改动文件、标准章节、保留的基线、新增断言、实际测试结果和已知教学简化。首课完整验证后，以它作为后续课程的可运行参考；[项目 Skill](../.agents/skills/protocol-course-authoring/SKILL.md) 提供同一流程的执行指引。
