# Protocol Course Studio

基于 [Protocol Explorer 原站](https://protocol-explorer-alpha.vercel.app/) 的公开前端快照，建立可维护的课程制作流程。保留原 39 课、原 SVG/字体/样式与交互，新增第一节自有课程：**HTTP 缓存与条件请求**。

首课有 6 步、9 条教学报文，讲解首次 200、本地缓存命中、ETag / If-None-Match、无正文的 304、内容变化后的 200，以及 no-cache、no-store、离线验证的边界。提供英文和简体中文；其他原有语言选项继续保留，新课未翻译内容回退到英文。

## Docker 本地部署

安装并启动 Docker Desktop（Windows 使用 Linux 容器），在包含 `compose.yaml` 的源码仓库目录执行：

```sh
docker compose up -d --build --wait
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)，搜索 **HTTP Cache**。构建由 Node 24 容器完成，运行时由 Nginx 提供静态网页，本机无需安装 Node.js 或 Python。首次构建需要联网下载基础镜像和 npm 依赖；原站课程、语言与字体直接使用仓库内保存的资源。

```sh
docker compose ps           # 查看运行状态
docker compose logs -f web  # 查看日志，Ctrl+C 退出日志查看
docker compose stop        # 停止
docker compose start       # 再次启动
docker compose down        # 删除本项目容器和网络
```

更新源码后再次执行 `docker compose up -d --build --wait`。默认端口只绑定本机；如需改为 8080，在 PowerShell 中执行：

```powershell
$env:PORT = "8080"
docker compose up -d --build --wait
```

镜像采用多阶段构建，运行层仅保留生成的网站文件。容器使用非 root 用户、只读文件系统和临时 `/tmp`，包含首页健康检查。缺失模块保持返回 404，`.mjs` 按 JavaScript 类型提供。

## 开发与验证

使用 Node.js 24.11 及以上版本（低于 25）：

```sh
npm ci --cache /tmp/protocol-course-npm-cache
npm run dev
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)，在协议列表末尾或搜索中选择 **HTTP Cache**。修改课程后刷新页面。原始资源与完整语言文件已经保存在项目中，日常开发和构建不需要访问原站。

```sh
npm test
npm run build
npm run preview -- --port 4174
```

浏览器测试需要 Chromium，默认 `/usr/bin/chromium`，也可设置 `CHROMIUM_PATH`。其他环境先运行 `npx playwright install chromium`，再将 `CHROMIUM_PATH` 指向安装的浏览器。`npm test` 自动启动临时本地服务，验证数据、协议、原 24 项浏览器断言与新课交互；新结果写入 `artifacts/`。`build` 生成 `dist/`，没有自动发布操作。

## 持续新增课程

1. 阅读 [课程制作流程](docs/course-authoring.md)，先检查已有课程覆盖和协议标准，写教学 brief。
2. 从 [课程模板](app/templates/course.mjs) 复制到 `app/src/courses/<id>.mjs`，定义讲解、拓扑、事件和报文。
3. 在 [统一注册入口](app/src/courses/registry.mjs) 加入描述符，提供翻译并执行 `npm run courses:check`。
4. 补充课程协议与浏览器检查，运行测试和构建。可调用 [项目 Skill](.agents/skills/protocol-course-authoring/SKILL.md) 执行同一流程。

首课实现见 [http-cache.mjs](app/src/courses/http-cache.mjs)，教学目标与异常情况见 [课程 brief](app/src/courses/http-cache.brief.json)。原版接入点、22 项 AST 桥接和升级边界见 [运行适配层说明](docs/runtime-adapter.md)。

本次[验证记录](docs/validation.json)：25 项单元测试、53 项课程浏览器断言（原 24 + 新课 29）通过；静态构建及 21 种语言切换通过。9 帧实际检查器字节已核对长度、IPv4/TCP 校验和与 HTTP 头部/正文边界。

## 来源与基线

[原分析报告](protocol-analysis/report.html)、39 课目录、原始资源、工具核验和历史测试结果均保留。`npm run baseline:check` 校验 54 个历史文件的哈希；新的测试结果不会覆盖它们。

原站视觉与界面设计来自 Dilum Sanjaya，页面保留其署名。运行适配层由固定生产包生成，未声称恢复作者原始源码。新增课程是确定性的教学脚本，报文检查器使用原编码器生成字节，不实现真实缓存后端。
