import type {
  IProcess,
  ProcessEvent,
  ProcessRunResult,
  ProcessSnapshot,
  ProcessState,
  ProcessStepResult,
} from './IProcess'

export interface BFSProcessConfig {
  startNodeId: string
  targetNodeId?: string
  adjacency: Record<string, string[]>
}

export interface BFSProcessState {
  currentNode?: string
  visited: string[]
  frontier: string[]
  path: string[]
  depth: number
}

interface BFSProcessSnapshotData {
  config: BFSProcessConfig | null
  frontier: string[]
  visited: string[]
  depthByNode: Array<[string, number]>
  parentByNode: Array<[string, string | null]>
  traversalOrder: string[]
  terminalPath: string[]
  totalSteps: number
  failedReason?: string
}

const MAX_RUN_STEPS = 10000

export class BFSProcess implements IProcess<BFSProcessConfig, BFSProcessState> {
  readonly id: string
  readonly type = 'bfs'

  private config: BFSProcessConfig | null = null
  private _state: ProcessState = 'idle'
  private _currentStep = -1
  private _totalSteps = 0

  private frontier: string[] = []
  private visited = new Set<string>()
  private depthByNode = new Map<string, number>()
  private parentByNode = new Map<string, string | null>()
  private traversalOrder: string[] = []
  private terminalPath: string[] = []
  private failedReason?: string

  constructor(id = 'bfs') {
    this.id = id
  }

  get state(): ProcessState {
    return this._state
  }

  get currentStep(): number {
    return this._currentStep
  }

  get totalSteps(): number {
    return this._totalSteps
  }

  init(config: BFSProcessConfig): void {
    this.config = this.normalizeConfig(config)
    this.reset()
  }

  reset(): void {
    this._state = 'idle'
    this._currentStep = -1
    this._totalSteps = 0
    this.failedReason = undefined

    this.frontier = []
    this.visited.clear()
    this.depthByNode.clear()
    this.parentByNode.clear()
    this.traversalOrder = []
    this.terminalPath = []

    if (!this.config) {
      this.fail('Process is not initialized.')
      return
    }

    const startNode = this.config.startNodeId
    if (!startNode) {
      this.fail('Missing startNodeId.')
      return
    }

    this.frontier.push(startNode)
    this.depthByNode.set(startNode, 0)
    this.parentByNode.set(startNode, null)
    this._totalSteps = this.computeReachableCount(startNode)
  }

  step(): ProcessStepResult<BFSProcessState> {
    if (this._state === 'failed' || this._state === 'completed') {
      return this.makeStepResult(undefined, [])
    }
    if (!this.config) {
      this.fail('Process is not initialized.')
      return this.makeStepResult(undefined, [{ type: 'fail', data: { reason: this.failedReason } }])
    }

    if (this._state === 'idle') this._state = 'running'
    this.pruneFrontier()

    if (this.frontier.length === 0) {
      this._state = 'completed'
      return this.makeStepResult(undefined, [{ type: 'complete', data: { reason: 'frontier_exhausted' } }])
    }

    const currentNode = this.frontier.shift() as string
    this.visited.add(currentNode)
    this.traversalOrder.push(currentNode)
    this._currentStep += 1

    const depth = this.depthByNode.get(currentNode) ?? 0
    const events: ProcessEvent[] = [
      {
        type: 'visit',
        entityId: currentNode,
        data: { depth, step: this._currentStep },
      },
    ]

    if (this.config.targetNodeId && currentNode === this.config.targetNodeId) {
      this.terminalPath = this.reconstructPath(currentNode)
      this.frontier = []
      this._state = 'completed'
      events.push({
        type: 'hit',
        entityId: currentNode,
        data: { path: [...this.terminalPath], step: this._currentStep },
      })
      events.push({ type: 'complete', data: { reason: 'target_found' } })
      return this.makeStepResult(currentNode, events)
    }

    const neighbors = this.config.adjacency[currentNode] ?? []
    for (const next of neighbors) {
      if (this.visited.has(next) || this.frontier.includes(next)) continue
      this.frontier.push(next)
      if (!this.depthByNode.has(next)) this.depthByNode.set(next, depth + 1)
      if (!this.parentByNode.has(next)) this.parentByNode.set(next, currentNode)
      events.push({
        type: 'expand',
        entityId: next,
        data: { from: currentNode, depth: depth + 1 },
      })
    }

    this.pruneFrontier()
    if (this.frontier.length === 0) {
      this._state = 'completed'
      events.push({ type: 'complete', data: { reason: 'frontier_exhausted' } })
    }

    return this.makeStepResult(currentNode, events)
  }

  run(maxSteps = MAX_RUN_STEPS): ProcessRunResult<BFSProcessState> {
    const steps: Array<ProcessStepResult<BFSProcessState>> = []
    let iterations = 0

    while (this._state !== 'completed' && this._state !== 'failed') {
      if (iterations >= maxSteps) {
        this.fail(`Exceeded max run steps (${maxSteps}).`)
        break
      }
      const result = this.step()
      if (result.step >= 0) steps.push(result)
      iterations += 1
    }

    return {
      state: this._state,
      steps,
      metrics: this.getMetrics(),
      failedReason: this.failedReason,
    }
  }

  getMetrics(): Record<string, number> {
    let depth = 0
    for (const node of this.visited) {
      depth = Math.max(depth, this.depthByNode.get(node) ?? 0)
    }
    return {
      visitedCount: this.visited.size,
      frontierSize: this.frontier.length,
      depth,
      pathLength: this.resolvePath().length,
    }
  }

  getSnapshot(): ProcessSnapshot<BFSProcessSnapshotData> {
    return {
      state: this._state,
      currentStep: this._currentStep,
      data: {
        config: this.config ? this.cloneValue(this.config) : null,
        frontier: [...this.frontier],
        visited: Array.from(this.visited),
        depthByNode: Array.from(this.depthByNode.entries()),
        parentByNode: Array.from(this.parentByNode.entries()),
        traversalOrder: [...this.traversalOrder],
        terminalPath: [...this.terminalPath],
        totalSteps: this._totalSteps,
        failedReason: this.failedReason,
      },
    }
  }

  restoreSnapshot(snapshot: ProcessSnapshot): void {
    const data = snapshot.data as BFSProcessSnapshotData

    this._state = snapshot.state
    this._currentStep = snapshot.currentStep
    this.config = data.config ? this.normalizeConfig(data.config) : null
    this.frontier = [...data.frontier]
    this.visited = new Set(data.visited)
    this.depthByNode = new Map(data.depthByNode)
    this.parentByNode = new Map(data.parentByNode)
    this.traversalOrder = [...data.traversalOrder]
    this.terminalPath = [...data.terminalPath]
    this._totalSteps = data.totalSteps
    this.failedReason = data.failedReason
  }

  private fail(reason: string): void {
    this._state = 'failed'
    this.failedReason = reason
  }

  private pruneFrontier(): void {
    while (this.frontier.length > 0 && this.visited.has(this.frontier[0])) {
      this.frontier.shift()
    }
  }

  private makeStepResult(currentNode: string | undefined, events: ProcessEvent[]): ProcessStepResult<BFSProcessState> {
    return {
      step: this._currentStep,
      state: this.resolveState(currentNode),
      metrics: this.getMetrics(),
      events: events.map(evt => this.cloneValue(evt)),
    }
  }

  private resolveState(currentNode: string | undefined): BFSProcessState {
    const depth = currentNode ? (this.depthByNode.get(currentNode) ?? 0) : 0
    return {
      currentNode,
      visited: Array.from(this.visited),
      frontier: [...this.frontier],
      path: this.resolvePath(),
      depth,
    }
  }

  private resolvePath(): string[] {
    if (this.terminalPath.length > 0) return [...this.terminalPath]
    return [...this.traversalOrder]
  }

  private reconstructPath(targetNodeId: string): string[] {
    const path: string[] = []
    const seen = new Set<string>()
    let cursor: string | null | undefined = targetNodeId
    while (cursor && !seen.has(cursor)) {
      path.push(cursor)
      seen.add(cursor)
      cursor = this.parentByNode.get(cursor) ?? null
    }
    path.reverse()
    return path
  }

  private computeReachableCount(startNodeId: string): number {
    if (!this.config) return 0
    const reached = new Set<string>()
    const queue: string[] = [startNodeId]

    while (queue.length > 0) {
      const node = queue.shift() as string
      if (reached.has(node)) continue
      reached.add(node)
      const nextNodes = this.config.adjacency[node] ?? []
      for (const next of nextNodes) {
        if (!reached.has(next)) queue.push(next)
      }
    }
    return reached.size
  }

  private normalizeConfig(input: BFSProcessConfig): BFSProcessConfig {
    const adjacency: Record<string, string[]> = {}

    for (const [nodeId, rawNeighbors] of Object.entries(input.adjacency ?? {})) {
      adjacency[nodeId] = Array.from(new Set((rawNeighbors ?? []).map(String)))
    }

    for (const neighbors of Object.values(adjacency)) {
      for (const neighbor of neighbors) {
        if (!adjacency[neighbor]) adjacency[neighbor] = []
      }
    }

    if (!adjacency[input.startNodeId]) adjacency[input.startNodeId] = []

    return {
      startNodeId: input.startNodeId,
      targetNodeId: input.targetNodeId,
      adjacency,
    }
  }

  private cloneValue<T>(value: T): T {
    if (value === null || value === undefined) return value
    if (typeof value !== 'object') return value

    if (typeof structuredClone === 'function') {
      try {
        return structuredClone(value)
      } catch {
        // fall through
      }
    }
    return JSON.parse(JSON.stringify(value)) as T
  }
}
