# LearnGraphics

Three.js + Vite 的声明式可视化平台原型，课程由 DSL 驱动（`src/dsl/examples/*.yaml`）。

## 开发
- `npm install`
- `npm run dev` 然后访问控制台提示的本地地址
- 在 `src/dsl/examples/` 新增一个 DSL 文件即可新增课程

## Milestone G 示例课程（跨领域）
- `vector-dot.yaml`：几何（点积投影 + 角度/距离测量）
- `bfs.yaml`：图算法（visited/frontier 逐步遍历）
- `gradient-descent.yaml`：数值（loss field + trajectory + loss curve）
- `dag-schedule.yaml`：系统（任务依赖 + timeline clips）
- `ray-intersection.yaml`：图形学（Ray-Plane 最近命中，含 `t` 与状态）
- `primitives-parametric.yaml`：基础几何（点/线/面/模型 + 参数化控制）

课程文档位于 `content/lessons/`：
- `vector-dot.md`
- `bfs.md`
- `gradient-descent.md`
- `dag-schedule.md`
- `ray-intersection.md`
- `primitives-parametric.md`

## AI 课程生成资产（Milestone I 启动）
- 结构化资产目录：`content/ai/`
- Schema：
  - `content/ai/schemas/course-request.schema.json`
  - `content/ai/schemas/course-plan.schema.json`
  - `content/ai/schemas/lesson-package.schema.json`
  - `content/ai/schemas/orchestrator-response.schema.json`
- 规则：
  - `content/ai/rules/hard-rules.json`
  - `content/ai/rules/rubric.json`
- 模板：
  - `content/ai/templates/lesson-templates.json`
  - `content/ai/templates/prompt-templates.md`
- 生命周期与迁移：
  - `content/ai/capability-aliases.json`
  - 能力卡字段：`status`（`active|deprecated|removed`）+ `replaced_by`
- 能力卡样例：`content/ai/capability-cards/`（首批 10 张）

## UI 集成：AI 创建课程（浏览器内）
- 侧栏新增 AI 输入面板（不再使用浏览器弹窗）：
  - 课程输入：标题 / 描述 / 标签
  - 更新输入：反馈文本 + `Force update`（能力快照漂移确认）
  - 设置输入：endpoint / model / apiKey / orchestratorMode / orchestratorEndpoint
- 顶部动作改为 icon 按钮（风格对齐 Timeline 控制按钮）：
  - 创建：读取课程输入并生成课程
  - 更新：读取反馈并更新当前课程
  - 设置：保存 API 配置
  - 删除：双击确认删除当前 AI 课程（内置课程不可删除）
- 数据持久化：
  - AI 课程持久化在浏览器 `localStorage`（key: `lg.ai.lessons.v1`）
  - API 配置持久化在浏览器 `localStorage`（key: `lg.ai.settings.v1`）
- 兼容策略：
  - `orchestratorMode=direct`：使用直连 LLM API；配置为空时启用本地回退生成
  - `orchestratorMode=pipeline`：调用后端编排服务（`orchestratorEndpoint` 必填），返回课程包后提取 `dsl/doc_markdown`；不再静默回退到 `direct`

## Pipeline 响应契约（前端校验）
- 前端在 `pipeline` 模式会校验固定响应结构：
  - 顶层：`request_id?`、`lesson_package`、`quality_report?`
  - `lesson_package`：必须包含 `dsl` 与 `doc_markdown`
  - `quality_report.hard_rule_pass=false` 时前端会中断落库并提示 violations

## 更新门禁与 Token 控制
- 能力漂移门禁：
  - 更新前会比较“课程基线能力快照”与“当前能力快照”
  - 快照缺失或不一致时，默认阻断更新（不触发 AI 请求）
  - 用户勾选 `Force update` 才允许继续
- Token 控制（`direct` 模式）：
  - 若现有 DSL/文档较大，更新请求会自动启用压缩上下文（结构摘要 + 样本 + 文档截断）
  - 优先减少每次更新对模型上下文的消耗，同时保留关键结构信息

## 3D 基础几何与模型能力（2026-02-27）
- 点：`point`、`marker`、`node`（已有）
- 线：`line`（新增）
- 面：`plane`（新增）
- 模型：`model`（新增，先支持常用 primitive）
- 参数化：`ui.sliders + bindings + expr` 驱动实体/关系属性（已有并扩展到 line/plane/model）
- 时间帧联动：Lesson Controls 支持“当前时间点 keyframe”写入，且可随 playhead 回显（直接映射 slider）。

## 标量场基石能力
- `scalar_field` 已支持统一模式：`mode: plane | surface | both`。
- `surface_field` 为语义别名积木：默认 `mode: surface`，用于教学场景更直观。
- 曲面相关参数：`heightScale`、`heightMode`（`normalized|centered|absolute`）、`surfaceOpacity`、`surfaceWireframe`。

## 通用符号积木（`symbol`）
- 课程可以使用统一符号实体：`type: symbol`，用于表达跨课程一致语义（如相机、光源、目标点）。
- 常用 `props.preset`：`camera`、`light`、`target`、`origin`、`ray`、`eye`、`screen`、`warning`、`info`。
- 常用属性：`position`、`color`、`label`、`props.size`（建议 `0.3~0.8`）。
- 模板入口：`src/dsl/templates/lesson-starter.yaml`（课程起步）和 `src/dsl/templates/symbol-catalog.yaml`（符号清单）。

## 关系可读性参数（可选）
- `measureAngle.props.showArms: true|false`：是否显示角度两条臂线（默认 `true`）。
- `projection.props.showProjectionLine: true|false`：是否显示 source 到投影点的垂线（默认 `true`）。
- `projection.props.showAxisLine: true|false`：是否显示投影轴短线（默认 `true`）。
- `projection.props.showRightAngle: true|false`：是否显示直角标记（默认 `true`）。

## 右侧教学区
- 右侧顶部按钮支持 `2D / Doc / Inspector` 切换。
- `2D` 显示当前课程的平面数值视图（Plot）。
- `Doc` 显示当前课程文档（按课程 id 对应 `content/lessons/<lessonId>.md`）。
- 启动时会校验文档完整性：若缺少对应文档，应用会直接报错提示缺失文件。

## 提交前文档检查
- 首次执行：`npm run setup:hooks`
- 提交时会自动执行 `check:docs-sync`：
  - 若提交中包含 `src/` 代码变更，但未同时更新文档（`README.md`、`开发路线图.md`、`架构设计方案.md`、`通用学习可视化工具.md`），提交会被阻止。

## AI 资产校验
- 执行：`npm run check:ai-assets`
- 校验项：
  - `content/ai/**/*.json` 可解析
  - 能力卡满足 schema（`content/ai/schemas/capability-card.schema.json`）
  - 能力别名满足 schema（`content/ai/schemas/capability-aliases.schema.json`）
  - `capability_id` 唯一
  - 生命周期约束（`deprecated -> replaced_by`、removed 依赖阻断）
  - `teach.*` 依赖闭包与 alias 目标合法性
  - `template_refs` 可在 `lesson-templates.json` 中找到
  - `dsl_refs` 路径存在

## 课程编排原型（course_request -> course_plan）
- 示例请求：`content/ai/examples/course-request.sample.json`
- 生成命令：
  - 输出到终端：`npm run gen:course-plan -- --request content/ai/examples/course-request.sample.json`
  - 输出到文件：`npm run gen:course-plan -- --request content/ai/examples/course-request.sample.json --out content/ai/examples/course-plan.sample.json`
- 生成器会自动校验输入和输出 schema：
  - 输入：`content/ai/schemas/course-request.schema.json`
  - 输出：`content/ai/schemas/course-plan.schema.json`

## 课程包生成原型（course_plan -> lesson_package）
- 示例输入：`content/ai/examples/course-plan.sample.json`
- 示例输出：`content/ai/examples/lesson-package.sample.json`
- 生成命令：
  - 输出到终端：`npm run gen:lesson-package -- --plan content/ai/examples/course-plan.sample.json`
  - 输出到文件：`npm run gen:lesson-package -- --plan content/ai/examples/course-plan.sample.json --request content/ai/examples/course-request.sample.json --out content/ai/examples/lesson-package.sample.json`
- 生成器会自动校验输出 schema：
  - 输出：`content/ai/schemas/lesson-package.schema.json`
  - 内置质量报告：`hard rules + rubric`（`quality_report`）

## 编排快照回归
- 回归请求：`content/ai/regression/requests/*.json`
- 校验命令：`npm run check:course-plan-snapshots`
- 更新基线：`npm run check:course-plan-snapshots -- --update`
- 用途：当能力升级/新增/移除后，自动检测 `course_plan` 行为漂移

## 课程包快照回归
- 回归请求：`content/ai/regression/requests/*.json`
- 校验命令：`npm run check:lesson-package-snapshots`
- 更新基线：`npm run check:lesson-package-snapshots -- --update`
- 用途：当能力升级/新增/移除后，自动检测 `lesson_package` 行为漂移
