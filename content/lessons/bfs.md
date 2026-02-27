# BFS 分层遍历（Graph Algorithm）

## 课程目标
- 理解 BFS 的层序扩展机制。
- 区分 `visited` 与 `frontier` 的语义。

## 场景构成
- 图节点：`A..F`。
- 图边：`A->B/C`，`B->D/E`，`C->F`。
- `visited-badge`、`frontier-badge`、`active-badge`：运行状态指标。
- `process: bfs`：由起点 `A` 逐步扩展至目标 `F`。

## 时间线观察点
- `0s`：访问 `A`，frontier 扩展到 `B,C`。
- `2.4s`：第二层节点进入处理区间。
- `6.0s`：访问到 `F`，遍历完成。

## 关键结论
- BFS 按“距离起点的层数”推进。
- `frontier` 表示待访问队列，`visited` 表示已确认访问集合。
