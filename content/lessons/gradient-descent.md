# 梯度下降（Numeric Iteration）

## 课程目标
- 理解“沿负梯度方向下降”。
- 同步观察参数轨迹与损失曲线变化。

## 场景构成
- `loss-field`：`surface_field` 积木，支持 `mode: both`（底图 + 3D 曲面）。
- `grad-field`：梯度向量场。
- `point`：当前参数点 `theta`。
- `trajectory`：参数迭代轨迹（step sequence）。
- `loss-badge` 与 `loss` 轨道：损失值随时间下降。

## 时间线观察点
- `0s`：初始点，loss 较高。
- `2s/4s/6s`：参数点逐步逼近极小值区域。
- `8s`：收敛到低损失区。

## 关键结论
- 学习率决定下降速度与稳定性。
- 轨迹与 loss 曲线共同验证优化过程是否有效。
