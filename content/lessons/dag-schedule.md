# DAG 调度（System）

## 课程目标
- 理解 DAG 依赖约束下的任务调度。
- 观察串行与并行阶段的切换。

## 场景构成
- 任务节点：`taskA..taskD`。
- 依赖边：`A->B/C`，`B->D`，`C->D`。
- `worker-0`、`worker-1`：用 badge 表达时间片（timeline clips）。
- `task*-status`：任务状态从 `waiting` 到 `running/done` 的演进。

## 时间线观察点
- `0s`：队列初始化，仅 `A` 可运行。
- `2s`：`B`、`C` 并行执行。
- `4s`：依赖满足后执行 `D`。
- `6s`：全部完成。

## 关键结论
- DAG 的拓扑依赖决定可并行窗口。
- timeline clips 可直观看到资源占用与任务切换。
