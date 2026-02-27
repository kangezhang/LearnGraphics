# 点线面与参数化模型（Geometry Core）

## 学习目标
- 识别基础几何实体：点（`point`）、线（`line`）、面（`plane`）、模型（`model`）。
- 理解参数化驱动链路：`sliders -> bindings(expr) -> semantic props -> 3D gizmo`。
- 观察 timeline 对模型 primitive 的切换（box/sphere/cylinder/torus）。

## 场景构成
- `focus`：参数化控制的点。
- `segment`：从原点到 `focus` 的线段。
- `base-plane`：可调大小的平面片。
- `demo-model`：可切换 primitive 的模型实体。

## 交互观察点
- 拖动 `Point X/Y/Z`：点与线段端点同步变化。
- 拖动 `Plane Size`：平面宽深同步变化。
- 拖动 `Model Scale / Model Yaw / Model Opacity`：模型几何外观实时变化。
- 播放 timeline：模型 primitive 按阶段切换。

## 结论
- 该课程仅通过 DSL 定义完成点、线、面、模型与参数化联动。
- 代码层不需要为单个课程编写 Three.js 逻辑，满足声明式架构目标。
