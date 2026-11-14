"""Build an offline, evidence-linked technical report from the recorded snapshot."""
from pathlib import Path
import hashlib
import html
import json
from datetime import datetime, timezone, timedelta

ROOT = Path(__file__).resolve().parent.parent
read_json = lambda name: json.loads((ROOT / name).read_text())
catalog = read_json('derived/course-catalog.json')
tools = read_json('research/tool-verification.json')
browser = read_json('research/browser-evidence.json')
esc = html.escape

def source(line, label):
    return f'<a href="derived/source-view.html#L{line}">{esc(label)} · L{line}</a>'

source_text = (ROOT / 'derived/index.pretty.js').read_text()
source_lines = '\n'.join(f'<span id="L{i}"><a href="#L{i}">{i:5}</a> {esc(line)}</span>' for i, line in enumerate(source_text.splitlines(), 1))
(ROOT / 'derived/source-view.html').write_text('''<!doctype html><html lang="en"><meta charset="utf-8"><title>Protocol Explorer · formatted public bundle</title><style>body{margin:20px;background:#f6f8fc;color:#18243b}pre{font:13px/1.55 monospace}span{display:block;scroll-margin-top:25px}span:target{background:#fff1aa}a{color:#7b87a2;text-decoration:none}</style><p>Public production bundle, formatted with js-beautify 2.0.3. Minified identifiers are preserved; line numbers belong to this analysis copy.</p><pre>''' + source_lines + '</pre></html>')

repo_rows = []
versions = {'j4k0xb/webcrack': ('2.16.0', '已安装并运行；unminify 控制流；本次关闭动态去混淆与拆包'), 'beautifier/js-beautify': ('2.0.3', '已安装并运行；格式化 JS/CSS，保留压缩符号，作为行号基准'), 'babel/babel': ('8.1.2', '已安装 parser/traverse/generator；实际用 parser 定位声明与提取范围'), 'microsoft/playwright': ('环境预装', '已实际运行；浏览器交互、截图、网络记录'), 'pionxzh/wakaru': ('1.16.0', '已核实未安装；可选启发式拆分 Vite/Rollup，不能当原始模块证据')}
for repo in tools['github']:
    name = repo.get('full_name')
    if name in versions:
        version, purpose = versions[name]
        repo_rows.append(f'<tr><td><a href="{repo["html_url"]}">{esc(name)}</a></td><td>{repo["stargazers_count"]:,}</td><td>{version}</td><td>{purpose}</td><td><a href="{repo["api_url"]}">GitHub API</a></td></tr>')

course_rows = ''.join(f'<tr><td><code>{x["id"]}</code></td><td>{esc(x["name"])}</td><td>{x["group"]}</td><td>{x["stepCount"]}</td><td>{x["eventCount"]}</td><td>{x["packetCount"]}</td><td>{source(x["source"]["line"],x["sourceSymbol"])}</td></tr>' for x in catalog['courses'])
checks = ''.join(f'<li><span class="ok">通过</span> {esc(x["name"])}</li>' for x in browser['checks'])
recorded = datetime.fromisoformat(browser['recordedAt'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M UTC+8')
raw = ROOT / 'raw/index-CNPseYOQ.js'
manifest = []
for file in sorted((ROOT / 'raw').rglob('*')):
    if file.is_file():
        manifest.append({'file': str(file.relative_to(ROOT)), 'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()})
(ROOT / 'research/asset-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')

body = f'''
<header><p class="eyebrow">PUBLIC FRONTEND / ORIGINAL SITE / TECHNICAL NOTES</p><h1>Protocol Explorer 公开前端实现分析</h1>
<p class="lead">核心制作方法是：把协议教学过程写成声明式事件，再由同一播放器协调网络 SVG、时序 SVG、步骤解释和报文检查器。</p>
<p>以 <a href="https://protocol-explorer-alpha.vercel.app/">原版网站</a> 的公开生产资源和实际交互为依据。核验时间：{recorded}。本文不是作者源码仓库或原始 TypeScript 的恢复。</p></header>
<nav><a href="#tools">工具核实与安装</a><a href="#data">课程数据</a><a href="#engine">播放器</a><a href="#svg">SVG 动画</a><a href="#sequence">时序图</a><a href="#inspector">报文检查器</a><a href="#recipe">复用配方</a><a href="#evidence">验证与文件</a></nav>

<section><h2>已核实的整体结构</h2>
<p>入口使用 Vite 模块预加载辅助代码；主包以原生 DOM 模板、事件委托和 SVG DOM 操作构建界面。在所检视主包中，没有发现 React、Mermaid 或 Canvas 绘图调用的证据。代码里的 <code>canvas</code> 属性是响应式基准宽度。</p>
<div class="flow"><b>课程注册表<br><code>_s / Ts</code></b><span>→</span><b>步骤与事件<br><code>VS / run / apply</code></b><span>→</span><b>网络 SVG · 时序 SVG<br>解释栏 · 报文列表</b><span>→</span><b>报文选择<br>协议编码器 · 字节视图</b></div>
<p>证据：{source(15685,'原生 DOM 入口')}、{source(9378,'课程注册表')}、{source(15566,'共享播放器')}、{source(15796,'统一状态分发')}。</p>
<figure><img src="screenshots/original-http-initial.png" alt="原版 HTTP 网络视图" loading="lazy"><figcaption>原版 HTTP 全览，1440 × 1000；截图未重绘页面。</figcaption></figure>
</section>

<section id="tools"><h2>1. 先核实工具，再安装固定版本</h2>
<p>Star 数来自 2026-11-13 的官方 GitHub API 快照；下列仓库核实时均未归档。逆向工具、格式化工具、AST 工具与浏览器验证工具分别承担不同工作，不能把高 Star 都当作“反混淆能力”。</p>
<div class="scroll"><table><thead><tr><th>官方仓库</th><th>Star</th><th>版本</th><th>本次用途与状态</th><th>核验源</th></tr></thead><tbody>{''.join(repo_rows)}</tbody></table></div>
<p>本次已实际执行 webcrack 与 js-beautify；Babel AST 用于声明定位和课程摘要提取。webcrack 的拆包支持不能保证恢复此 Vite 产物的作者模块边界；本次采用 <code>--no-deobfuscate --no-unpack</code>，只做可读化。输出中的符号名仍是生产压缩名。详情见 <a href="research/tool-verification.json">工具核验元数据</a>、<a href="package-lock.json">安装锁文件</a>、<a href="research/installation.json">安装与运行记录</a>。</p>
<pre>npm ci --cache /tmp/protocol-analysis-npm-cache
npm run analyze:format
npm run analyze:unminify
npm run analyze:courses</pre>
</section>

<section id="data"><h2>2. 课程是主包中的数据对象</h2>
<div class="stats"><div><b>{catalog['courseCount']}</b><span>课程</span></div><div><b>{catalog['totalSteps']}</b><span>步骤</span></div><div><b>{catalog['totalEvents']}</b><span>步骤内事件</span></div><div><b>{catalog['totalPackets']}</b><span>教学报文条目</span></div></div>
<p><code>_s[id]</code> 注册完整英文课程，<code>Ts</code> 决定导航顺序及分组：core 11、application 19、security 9。当前 39 课共同出现 <code>id/name/title/layer/nodes/latency/legend/overview/outro/start/steps</code>；部分课程另有 <code>labels/links/lifelines/seenOn</code>。这是观测到的数据结构，并非发现了正式 schema 校验器。</p>
<p>步骤事件有 8 种：<code>type-url</code> 5、<code>show</code> 60、<code>packet</code> 520、<code>camera</code> 8、<code>render</code> 3、<code>note</code> 57、<code>stream</code> 14、<code>label</code> 4。14 个 stream 含 37 个包，所以 520 + 37 = 557 条。671 不包含播放器另行注入的初始 focus；557 也不等于真实 TCP 分段或物理网络帧总数。</p>
<pre>// 制作时可以采用的简化结构；名称和类型是本文归纳
Lesson = {{ id, nodes, latency, start, steps: [{{ title, events }}] }}
PacketEvent = {{ type: "packet", from, to, color, label, payload,
                quick?, lost?, locked?, row }}
row = {{ time, src, dst, proto, info, len, wire }}
// row 描述列表；wire 描述检查器要编码的协议结构。</pre>
<p>HTTP 的 5 步依次讲请求准备、DNS、TCP、HTTP 交换和渲染，列表只有 7 条；响应条目可代表 9 个 TCP 分段。共有工厂辅助生成 packet、端口描述、TCP 包装和握手。学习进度通过 localStorage 保存。证据：{source(42,'报文工厂 l')}、{source(76,'握手 he')}、{source(245,'HTTP O0')}、{source(9378,'注册 _s')}、{source(9419,'导航 Ts')}、{source(9657,'进度 Ym')}、{source(12126,'报文展平 Vr')}。</p>
<p>已观察的 HTTP、HTTPS、TCP、DNSSEC、QUIC、IPv6、Wi-Fi 切换与中文加载流量没有课程 fetch/XHR API；结合主包内完整课程对象，可确认这些课程直接从前端数据读取。中文等语言以独立动态 import chunk 按需加载。</p>
<details><summary>展开完整 39 课的结构统计</summary><div class="scroll"><table><thead><tr><th>ID</th><th>名称</th><th>组别</th><th>步骤</th><th>事件</th><th>教学报文</th><th>源码定位</th></tr></thead><tbody>{course_rows}</tbody></table></div></details>
<p><a href="derived/course-catalog.json">课程摘要 JSON</a> 没有导出整套教学正文。<a href="scripts/extract-courses.mjs">提取脚本</a> 使用 Babel AST 选取已检查的声明前缀，在限定执行时间的 VM 中重放初始化与两条分段循环。脚本绑定原始包和格式化包的 SHA-256；它只适用于这份已审核快照。<code>node:vm</code> 不是处理任意不可信新代码的安全边界。</p>
</section>

<section id="engine"><h2>3. 播放器把多种视图维持在同一状态</h2>
<p><code>VS()</code> 先添加初始 focus，再平铺 <code>steps[].events</code> 并保留 step 编号。它维护当前和下一个事件索引、playing、取消令牌；向界面派生 <code>started/done/activeStep/steps/packets/labels/notes</code>。报文状态是 current、past、future。<code>queueMicrotask</code> 合并同步阶段的多次通知。</p>
<p>网络模式执行 <code>run(event)</code> 动画；时序模式应用 <code>apply(event)</code> 的持久结果再按教学节奏等待。跳步先取消旧动画，重放前序事件的 apply 恢复状态，再继续播放。课程切换会 dispose 旧播放器，避免过期异步回调写入新课。</p>
<p>计时采用共享的暂停与倍率状态、统一计时辅助和取消令牌：每个 <code>nt()</code> 调用独立累计 <code>elapsed += delta × speed</code>，WAAPI Animation 各自计时，并受登记集合控制暂停和 playbackRate。不能称为只有一个时钟对象。常规网络事件间隔 450ms、步骤间隔 1100ms；时序模式为 260ms、650ms，另有 quick 节奏。证据：{source(11731,'yn 动画控制')}、{source(11761,'nt 计时辅助')}、{source(15549,'GS 教学间隔')}、{source(15566,'VS 播放器')}、{source(15802,'ic 课程切换')}。</p>
</section>

<section id="svg"><h2>4. SVG 设备、路线和粒子可以分别制作</h2>
<p>设备用 30° 等轴投影把盒体面、矩形、圆和连线组合成路由器、交换机、笔记本、服务器与云；无需三维引擎。平面投影为 <code>X = originX + (x−y) cos(π/6)</code>、<code>Y = originY + (x+y)/2 − z</code>。场景分为网格、lanes、pulse、nodes、packet、note 等层。</p>
<p>路线表存各有向边的端点坐标；端点对再映射为多段路径，例如 client→web 经过 router 和 internet。粒子沿每段做线性插值 <code>P(p) = A + p(B−A)</code>；尾迹按 10、20、30 SVG 单位偏移。普通速度为 0.21 SVG 单位/ms，quick 为其 2.4 倍，普通逐跳再停 140ms。</p>
<p>粒子由 halo、主圆、拖尾、标签、payload 和可选锁图标组成。并发 stream 按间隔启动，链路高亮通过引用计数维持；丢包在经过 internet 的段落中途消失并显示叉号。摄像机对节点包围盒计算 viewBox，再做缓动插值。</p>
<p>网络动画的持续时间来自图上路程与教学参数，不能当成真实 RTT 或课程时间戳的按比例播放。证据：{source(10905,'Tn 等轴投影')}、{source(10930,'pt 盒体')}、{source(11214,'oa 边表')}、{source(11242,'tw 路由表')}、{source(11557,'bw SVG 分层')}、{source(15306,'E0 粒子')}、{source(15383,'pc 沿路线移动')}。</p>
</section>

<section id="sequence"><h2>5. 时序图是自定义 SVG 布局器</h2>
<p><code>Rw()</code> 从同一批 packet/stream 数据建立发送与到达事件。发送时间取 <code>row.time</code>，到达时间为发送时间加课程端点对 <code>latency</code>；它们都是预设的模拟数据。lifeline 来自实际端点和可选课程顺序。</p>
<p>纵轴是混合时间轴：相邻模拟时间差超过 0.25 秒时插入 58px 的断轴波纹；较小时间差按 <code>max(9, 3000 × Δt)</code> 增加高度，再叠加发送间距、步骤标题和注释留白。因此既不是等距列表，也不是严格线性的时间比例图。</p>
<p>箭头从发送点连到到达点，以斜率展示延迟；标签沿箭头旋转并保持正向可读。<code>Kw()</code> 实测文字宽度，尝试多个箭头位置，用分离轴定理（SAT）避开注释、叉号和其他标签；没有完全无碰撞位置时选择重叠最少的候选。</p>
<p>绘线动画通过 stroke-dasharray/dashoffset 完成，常规 620ms、quick 320ms；stream 箭头相隔 160ms。表头独立保持水平滚动对齐，ResizeObserver 触发布局更新，最新报文自动滚入视口。箭头与报文列表共享同一个 packet index，点击打开同一检查器。证据：{source(11625,'Rw 时间布局')}、{source(11797,'qw 箭头')}、{source(11866,'Kw 标签避让')}、{source(11937,'Mu SVG')}、{source(11977,'Ii 绘线动画')}、{source(12054,'Ql 显隐与滚动')}。</p>
<figure><img src="screenshots/original-http-sequence.png" alt="原版 HTTP 时序图" loading="lazy"><figcaption>原版 HTTP 时序全览，与网络视图共享 7 条教学报文。</figcaption></figure>
</section>

<section id="inspector"><h2>6. 报文检查器是带字段偏移的教学编码器</h2>
<p>调用链是 <code>PS/ES 表格 → a0 暂停播放 → iS.open → Gu 缓存 → Xg.frame → Wu/Vu → 字段树 + hex + ASCII</code>。时序图的点击也进入 a0。Gu 按课程缓存生成结果，数据来自 <code>row.wire</code>，没有从浏览器读取真实网络报文。</p>
<p>最值得复用的是 <code>R.field()</code>：在写入字节的同时，记录字段名称、值、说明和半开偏移区间 <code>[from,to)</code>。<code>Rr()</code> 合并协议层时统一换算全局偏移，因此字段树和字节数组天然对应。</p>
<pre>// 可复用的概念配方；不是作者原始类的恢复
begin = writer.length
encodeField(writer, value)
fields.push({{ name, value, from: begin, to: writer.length }})
// 合并一层时，对该层字段 from/to 加上 layerBase。
// hover 字段 → 高亮整个区间；hover 字节 → 找最小覆盖字段。</pre>
<p>hex 每行 16 字节，旁边是 ASCII。字段悬停会同时点亮两列；字节悬停查找覆盖它的最小字段。未知随机数、密文、文件内容保留为 <code>null</code>，显示 <code>··</code>；示例值另外标识。分层宽度条设置最小视觉宽度，不能据其宽度直接读字节比例。</p>
<p>编码器不只输出静态文字：它维护教学连接的 TCP SEQ/ACK、SYN/FIN 序号、乱序区间、SACK 与部分选项；对可知数据计算 IPv4、TCP、UDP、ICMP 等校验和，遇未知字节时保留未知。这里的校验对象是生成字节，未进行外部全协议抓包验证。</p>
<p>实现边界：TCP 载荷上限固定为 1460，带时间戳时为 1448，不应推断为完整的协商 MSS 网络栈；一条多段消息只展示首个 TCP 段，界面会说明总消息与分段数。以太帧补到 60 字节，但字节数组没有生成网卡附加的 4 字节 FCS。在已检视代码与界面中未发现 PCAP 导入、复制或导出实现。</p>
<p>证据：{source(8828,'R 字段写入器')}、{source(8852,'pn 校验和')}、{source(13980,'TCP 首段')}、{source(14054,'Xg.frame')}、{source(14288,'Gu 缓存')}、{source(14408,'nS hex')}、{source(14459,'fr 联动高亮')}、{source(14483,'iS 检查器')}、{source(14887,'ES 点击委托')}、{source(15783,'a0 统一入口')}。</p>
<figure><img src="screenshots/original-http-inspector.png" alt="原版报文检查器与十六进制字节联动" loading="lazy"><figcaption>原版 DNS 查询检查器；字段范围同时高亮 hex 与 ASCII。</figcaption></figure>
</section>

<section id="recipe"><h2>7. 可复用的制作顺序</h2>
<p>下面是根据原版机制整理的实现建议，不表示恢复了作者目录或原始模块名。</p>
<ol class="recipe">
<li><b>先做一课完整的数据。</b> 从 HTTP 的 DNS、TCP、请求、响应入手；同时写步骤解释、列表行、模拟时间和 wire 描述，避免四处维护相互矛盾的副本。</li>
<li><b>把 event 设计成小指令。</b> 区分持久结果 apply 与播放过程 run；每条事件保留 step，每个 packet 分配稳定序号，让列表、图形与检查器共享选择。</li>
<li><b>先实现取消、暂停、重放。</b> 管理共享倍率和暂停状态；所有异步任务检查取消令牌。跳步用 apply 重建前序状态，新课 dispose 旧播放器。</li>
<li><b>SVG 先做静态拓扑，再做运动。</b> 把设备积木、节点坐标、边、路线、粒子、相机分别实现；先验证路径端点，再添加拖尾、脉冲、掉包与并发流。</li>
<li><b>时序图从相同 packet 派生。</b> 先画 lifeline 与发送/到达箭头，再加步骤标题、长等待断轴、标签测量避让、同步滚动；明确区分模拟时间和教学播放时长。</li>
<li><b>检查器先解决字节偏移。</b> 写字段时记范围，合并层时加偏移；保留未知字节。先实现 Ethernet/IPv4/UDP/DNS，再加入 TCP 和其他编码器。</li>
<li><b>最后接入解释、检索、翻译和偏好。</b> 课程本体与界面词条分离，翻译包按需加载；进度、主题、速度保存于本地，避免影响协议数据。</li>
<li><b>用原版行为逐项核验。</b> 至少检查 reset 后全览、逐事件播放、跳步重建、视图切换、点击暂停、双向字节高亮、中文与手机布局。</li>
</ol>
<pre>// 建议的新项目模块划分
lessons/        课程脚本、端点、时间与报文定义
engine/         事件队列、apply/run、取消令牌、倍率状态
network/        等轴设备、坐标、路径、SVG 粒子与相机
sequence/       时间布局、标签避让、SVG 绘线与滚动
wire/           字节写入器、协议编码器、校验和、字段偏移
ui/             导航、解释、报文表、检查器、语言与偏好</pre>
<p>响应式原版采用 1440/1100/900/640 等断点及设计宽度缩放，手机为堆叠布局和侧栏抽屉。原版 reduced-motion 覆盖了部分 UI 和时序动画，但网络粒子的 rAF 没有统一关闭分支。新实现若要求全面减少动态效果，需要额外补齐这项策略。证据：{source(15701,'YS 布局配置')}、<a href="research/animation-findings.json">动画详细证据与限制</a>。</p>
</section>

<section id="evidence"><h2>8. 验证范围、证据和复跑方式</h2>
<p>浏览器对原站做了 {len(browser['checks'])} 项断言，全部通过，未观察到 JavaScript 错误。除 HTTP 联动，还抽查 HTTPS、TCP、DNSSEC、QUIC、IPv6、Wi-Fi 的最后一条报文可生成检查器字节。手机检查使用 390 × 844，中文切换实测加载独立语言资源。</p>
<details><summary>查看全部浏览器断言</summary><ul class="checks">{checks}</ul></details>
<p>环境中的 Chromium 首次直连遇到代理证书信任错误；验证脚本使用 Playwright APIRequestContext，通过环境代理与受信任 CA 获取原站 HTTPS 响应，再将响应原样交给浏览器。没有关闭 TLS 校验，没有改写网页脚本、样式或业务数据。<a href="research/browser-evidence.json">网络证据</a> 记录资源状态、大小、SHA-256、样本与断言。</p>
<p>主包 {raw.stat().st_size:,} 字节，SHA-256 为 <code class="digest">{hashlib.sha256(raw.read_bytes()).hexdigest()}</code>。主包未带 sourceMappingURL；对对应 .js.map 的公开请求返回 403，本次未取得 source map。所有源码行号指向 js-beautify 2.0.3 生成的分析副本，不能据此声称恢复原始文件、变量名或目录结构。</p>
<pre>npm run analyze:format
npm run analyze:unminify
npm run analyze:courses
npm run verify:browser    # 需 Playwright、/usr/bin/chromium 和可访问原站的网络
npm run report
python -m http.server 8000 --directory .
# 打开 http://localhost:8000/report.html</pre>
<p>Playwright 是当前环境预装能力，没有被加入项目锁文件；新环境需自行准备 Playwright 与 Chromium。浏览器脚本访问在线原站，若原站部署更新，动态资源或断言可能变化；当前源码提取脚本会在快照哈希变化时停止。</p>
<div class="files"><a href="research/course-findings.json">课程证据</a><a href="research/animation-findings.json">SVG 与时序证据</a><a href="research/inspector-findings.json">检查器证据</a><a href="derived/course-catalog.json">39 课摘要</a><a href="research/asset-manifest.json">资源哈希清单</a><a href="scripts/inspect-original.cjs">浏览器验证脚本</a><a href="derived/index.webcrack.js">webcrack 输出</a><a href="derived/styles.pretty.css">格式化 CSS</a></div>
<details><summary>中文与手机截图</summary><figure><img src="screenshots/original-zh.png" alt="原版中文界面" loading="lazy"></figure><figure><img class="phone" src="screenshots/original-phone.png" alt="原版手机布局" loading="lazy"></figure></details>
</section><footer>证据来自原站公开资源；机制解释与复用建议已区分。完整课程正文与真实抓包不作为本报告交付物。</footer>
'''

css = '''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f3f6fa;color:#18243b;font:16px/1.85 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1140px;margin:auto;padding:42px 30px 70px}header{padding:36px 40px;background:#142b50;color:#fff;border-radius:18px}header a{color:#a6d7ff}.eyebrow{font:12px/1.6 monospace;letter-spacing:.13em;color:#9dcaeb}h1{font-size:34px;line-height:1.4;margin:14px 0}h2{font-size:24px;line-height:1.5;margin:0 0 18px}.lead{font-size:21px;line-height:1.7;color:#e0effc}section{background:#fff;border:1px solid #dbe3ed;border-radius:14px;margin:24px 0;padding:30px 34px;scroll-margin-top:16px}p{margin:14px 0}a{color:#175fae;text-underline-offset:3px}nav,.files{display:flex;gap:10px 20px;flex-wrap:wrap;padding:20px 8px;font-size:14px}code,pre{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}code{overflow-wrap:anywhere;background:#edf2f7;padding:2px 5px;border-radius:4px;font-size:.88em}pre{background:#102039;color:#e4ecf5;padding:20px;border-radius:9px;overflow:auto;font-size:13px;line-height:1.8}table{border-collapse:collapse;width:100%;font-size:14px;line-height:1.65}th,td{padding:11px 12px;border-bottom:1px solid #e1e7ef;text-align:left;vertical-align:top}th{background:#edf3fa}.scroll{overflow:auto}details{margin:20px 0}summary{cursor:pointer;color:#175fae;font-weight:600}img{max-width:100%;height:auto;display:block;border:1px solid #dbe3ed;border-radius:8px}figure{margin:26px 0 10px}figcaption{font-size:13px;color:#5b6880;margin-top:9px}.phone{max-width:390px}.flow{display:flex;align-items:center;justify-content:space-between;gap:8px;background:#f2f7fd;padding:18px;border-radius:8px;font-size:13px;line-height:1.8;text-align:center}.flow b{flex:1}.stats{display:flex;gap:20px;margin:20px 0}.stats div{background:#eff5fc;border-radius:8px;padding:15px 20px;flex:1}.stats b{display:block;font-size:29px;color:#16497f}.stats span{font-size:13px;color:#526782}.recipe li{padding:5px 0 9px}.checks{font-size:13px}.checks li{margin:6px 0}.ok{color:#16714c;font-weight:bold;margin-right:8px}.digest{overflow-wrap:anywhere}footer{color:#67738a;font-size:13px;padding:20px 10px}@media(max-width:700px){main{padding:14px}header{padding:24px}h1{font-size:27px}.lead{font-size:18px}section{padding:24px 18px}.stats{gap:6px}.stats div{padding:10px}.stats b{font-size:23px}.stats span{font-size:11px}.flow{flex-direction:column}.flow>span{transform:rotate(90deg)}}@media print{body{background:#fff}main{max-width:none;padding:0}section{break-inside:avoid}nav{display:none}details{display:block}img{max-height:550px;object-fit:contain}a{color:inherit}}'''
output = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Protocol Explorer · 公开前端实现分析</title><style>' + css + '</style></head><body><main>' + body + '</main></body></html>'
(ROOT / 'report.html').write_text(output)
print(f'Built report.html with {catalog["courseCount"]} courses, {len(browser["checks"])} browser checks and line-linked source view.')
