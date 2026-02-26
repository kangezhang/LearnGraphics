import type {
  IProcess,
  ProcessEvent,
  ProcessRunResult,
  ProcessSnapshot,
  ProcessState,
  ProcessStepResult,
} from './IProcess'

export interface RayIntersectionProcessConfig {
  origin: [number, number, number]
  direction: [number, number, number]
  planeNormal?: [number, number, number]
  planeOffset?: number
  maxSteps?: number
  maxDistance?: number
  rayEntityId?: string
  hitEntityId?: string
}

export interface RayIntersectionProcessState {
  status: 'tracing' | 'hit' | 'miss'
  t: number
  point: [number, number, number]
  progress: number
}

interface RayIntersectionSnapshotData {
  config: RayIntersectionProcessConfig | null
  hasHit: boolean
  hitT: number | null
  hitPoint: [number, number, number] | null
  currentT: number
  currentPoint: [number, number, number]
  failedReason?: string
}

const EPSILON = 1e-8

export class RayIntersectionProcess implements IProcess<RayIntersectionProcessConfig, RayIntersectionProcessState> {
  readonly id: string
  readonly type = 'ray_intersection'

  private config: RayIntersectionProcessConfig | null = null
  private _state: ProcessState = 'idle'
  private _currentStep = -1
  private _totalSteps = 0
  private failedReason?: string

  private hasHit = false
  private hitT: number | null = null
  private hitPoint: [number, number, number] | null = null
  private currentT = 0
  private currentPoint: [number, number, number] = [0, 0, 0]

  constructor(id = 'ray-intersection') {
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

  init(config: RayIntersectionProcessConfig): void {
    this.config = this.normalizeConfig(config)
    this.reset()
  }

  reset(): void {
    this._state = 'idle'
    this._currentStep = -1
    this.failedReason = undefined

    if (!this.config) {
      this.fail('Process is not initialized.')
      return
    }

    this._totalSteps = Math.max(1, this.config.maxSteps ?? 20)
    this.currentT = 0
    this.currentPoint = [...this.config.origin]

    const hit = this.computeIntersection(this.config)
    this.hasHit = hit.hasHit
    this.hitT = hit.t
    this.hitPoint = hit.point
  }

  step(): ProcessStepResult<RayIntersectionProcessState> {
    if (this._state === 'failed' || this._state === 'completed') {
      return this.makeStepResult([])
    }
    if (!this.config) {
      this.fail('Process is not initialized.')
      return this.makeStepResult([{ type: 'fail', data: { reason: this.failedReason } }])
    }

    if (this._state === 'idle') this._state = 'running'
    this._currentStep += 1

    if (this._currentStep >= this._totalSteps) {
      this._state = 'completed'
      return this.makeStepResult([{ type: 'complete', data: { reason: 'max_steps' } }])
    }

    const progress = (this._currentStep + 1) / this._totalSteps
    const distance = this.hasHit && this.hitT !== null
      ? this.hitT
      : (this.config.maxDistance ?? 10)

    this.currentT = Math.max(0, distance * progress)
    this.currentPoint = add(this.config.origin, scale(this.config.direction, this.currentT))

    const events: ProcessEvent[] = [
      {
        type: 'trace',
        entityId: this.config.rayEntityId,
        data: {
          t: this.currentT,
          point: [...this.currentPoint],
          progress,
        },
      },
    ]

    if (progress >= 1) {
      this._state = 'completed'
      if (this.hasHit && this.hitPoint && this.hitT !== null) {
        this.currentT = this.hitT
        this.currentPoint = [...this.hitPoint]
        events.push({
          type: 'hit',
          entityId: this.config.hitEntityId,
          data: {
            t: this.hitT,
            point: [...this.hitPoint],
          },
        })
      } else {
        events.push({
          type: 'miss',
          entityId: this.config.rayEntityId,
          data: {
            maxDistance: this.config.maxDistance ?? 10,
          },
        })
      }
      events.push({ type: 'complete', data: { reason: this.hasHit ? 'hit' : 'miss' } })
    }

    return this.makeStepResult(events)
  }

  run(maxSteps = this._totalSteps || 1000): ProcessRunResult<RayIntersectionProcessState> {
    const steps: Array<ProcessStepResult<RayIntersectionProcessState>> = []
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
    return {
      step: Math.max(0, this._currentStep + 1),
      totalSteps: this._totalSteps,
      progress: this._totalSteps > 0 ? Math.min(1, Math.max(0, (this._currentStep + 1) / this._totalSteps)) : 0,
      hitCount: this.hasHit ? 1 : 0,
      closestT: this.hitT ?? Number.POSITIVE_INFINITY,
    }
  }

  getSnapshot(): ProcessSnapshot<RayIntersectionSnapshotData> {
    return {
      state: this._state,
      currentStep: this._currentStep,
      data: {
        config: this.config ? this.cloneValue(this.config) : null,
        hasHit: this.hasHit,
        hitT: this.hitT,
        hitPoint: this.hitPoint ? [...this.hitPoint] : null,
        currentT: this.currentT,
        currentPoint: [...this.currentPoint],
        failedReason: this.failedReason,
      },
    }
  }

  restoreSnapshot(snapshot: ProcessSnapshot): void {
    const data = snapshot.data as RayIntersectionSnapshotData
    this._state = snapshot.state
    this._currentStep = snapshot.currentStep
    this.config = data.config ? this.normalizeConfig(data.config) : null
    this.hasHit = data.hasHit
    this.hitT = data.hitT
    this.hitPoint = data.hitPoint ? [...data.hitPoint] : null
    this.currentT = data.currentT
    this.currentPoint = [...data.currentPoint]
    this.failedReason = data.failedReason
    this._totalSteps = this.config?.maxSteps ?? this._totalSteps
  }

  private makeStepResult(events: ProcessEvent[]): ProcessStepResult<RayIntersectionProcessState> {
    return {
      step: this._currentStep,
      state: {
        status: this.resolveStatus(),
        t: this.currentT,
        point: [...this.currentPoint],
        progress: this._totalSteps > 0 ? Math.min(1, Math.max(0, (this._currentStep + 1) / this._totalSteps)) : 0,
      },
      metrics: this.getMetrics(),
      events: events.map(evt => this.cloneValue(evt)),
    }
  }

  private resolveStatus(): 'tracing' | 'hit' | 'miss' {
    if (this._state !== 'completed') return 'tracing'
    return this.hasHit ? 'hit' : 'miss'
  }

  private computeIntersection(config: RayIntersectionProcessConfig): {
    hasHit: boolean
    t: number | null
    point: [number, number, number] | null
  } {
    const normal = normalize(config.planeNormal ?? [0, 1, 0])
    const denom = dot(normal, config.direction)
    if (Math.abs(denom) <= EPSILON) {
      return { hasHit: false, t: null, point: null }
    }

    const numer = -(dot(normal, config.origin) + (config.planeOffset ?? 0))
    const t = numer / denom
    if (!Number.isFinite(t) || t < 0) {
      return { hasHit: false, t: null, point: null }
    }
    return {
      hasHit: true,
      t,
      point: add(config.origin, scale(config.direction, t)),
    }
  }

  private normalizeConfig(input: RayIntersectionProcessConfig): RayIntersectionProcessConfig {
    const direction = normalize(input.direction)
    return {
      ...input,
      origin: vector3(input.origin),
      direction,
      planeNormal: normalize(input.planeNormal ?? [0, 1, 0]),
      planeOffset: finiteOr(input.planeOffset, 0),
      maxSteps: Math.max(1, Math.floor(finiteOr(input.maxSteps, 20))),
      maxDistance: Math.max(0.001, finiteOr(input.maxDistance, 10)),
    }
  }

  private fail(reason: string): void {
    this._state = 'failed'
    this.failedReason = reason
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

function vector3(value: [number, number, number]): [number, number, number] {
  return [finiteOr(value[0], 0), finiteOr(value[1], 0), finiteOr(value[2], 0)]
}

function dot(a: [number, number, number], b: [number, number, number]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function scale(a: [number, number, number], s: number): [number, number, number] {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(dot(v, v))
  if (!Number.isFinite(len) || len <= EPSILON) return [0, 1, 0]
  return [v[0] / len, v[1] / len, v[2] / len]
}

function finiteOr(value: unknown, fallback: number): number {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(candidate) ? candidate : fallback
}
