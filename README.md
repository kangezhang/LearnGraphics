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
