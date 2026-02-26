import type {
  IProcess,
  ProcessEvent,
  ProcessRunResult,
  ProcessSnapshot,
  ProcessState,
  ProcessStepResult,
} from './IProcess'

export interface GradientDescentProcessConfig {
  startPoint: [number, number]
  learningRate: number
  maxIterations: number
  epsilon?: number
  coefficients?: Partial<QuadraticCoefficients>
  pointEntityId?: string
}

export interface GradientDescentProcessState {
  iteration: number
  currentPoint: [number, number]
  trajectory: Array<[number, number]>
  loss: number
  gradient: [number, number]
  gradientNorm: number
}

interface GradientDescentSnapshotData {
  config: GradientDescentProcessConfig | null
  currentPoint: [number, number]
  trajectory: Array<[number, number]>
  loss: number
  gradient: [number, number]
  gradientNorm: number
  failedReason?: string
}

interface QuadraticCoefficients {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const DEFAULT_COEFFICIENTS: QuadraticCoefficients = {
  a: 1,
  b: 1,
  c: 0,
  d: 0,
  e: 0,
  f: 0,
}

export class GradientDescentProcess implements IProcess<GradientDescentProcessConfig, GradientDescentProcessState> {
  readonly id: string
  readonly type = 'gradient_descent'

  private config: GradientDescentProcessConfig | null = null
  private _state: ProcessState = 'idle'
  private _currentStep = -1
  private _totalSteps = 0
  private failedReason?: string

  private currentPoint: [number, number] = [0, 0]
  private trajectory: Array<[number, number]> = []
  private loss = 0
  private gradient: [number, number] = [0, 0]
  private gradientNorm = 0

  constructor(id = 'gradient-descent') {
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

  init(config: GradientDescentProcessConfig): void {
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

    this._totalSteps = this.config.maxIterations
    this.currentPoint = [...this.config.startPoint]
    this.trajectory = [[...this.currentPoint]]
    this.loss = this.evaluateLoss(this.currentPoint)
    this.gradient = this.evaluateGradient(this.currentPoint)
    this.gradientNorm = norm2(this.gradient)
  }

  step(): ProcessStepResult<GradientDescentProcessState> {
    if (this._state === 'failed' || this._state === 'completed') {
      return this.makeStepResult([])
    }
    if (!this.config) {
      this.fail('Process is not initialized.')
      return this.makeStepResult([{ type: 'fail', data: { reason: this.failedReason } }])
    }

    if (this._state === 'idle') this._state = 'running'
    const events: ProcessEvent[] = []
    const epsilon = this.config.epsilon ?? 1e-3

    this._currentStep += 1
    if (this._currentStep >= this.config.maxIterations) {
      this._state = 'completed'
      events.push({ type: 'complete', data: { reason: 'max_iterations' } })
      return this.makeStepResult(events)
    }

    if (this.gradientNorm <= epsilon) {
      this._state = 'completed'
      events.push({
        type: 'settle',
        entityId: this.config.pointEntityId,
        data: { point: [...this.currentPoint], loss: this.loss, gradientNorm: this.gradientNorm },
      })
      events.push({ type: 'complete', data: { reason: 'converged' } })
      return this.makeStepResult(events)
    }

    const nextPoint: [number, number] = [
      this.currentPoint[0] - this.config.learningRate * this.gradient[0],
      this.currentPoint[1] - this.config.learningRate * this.gradient[1],
    ]

    this.currentPoint = nextPoint
    this.trajectory.push([...nextPoint])
    this.loss = this.evaluateLoss(this.currentPoint)
    this.gradient = this.evaluateGradient(this.currentPoint)
    this.gradientNorm = norm2(this.gradient)

    events.push({
      type: 'iterate',
      entityId: this.config.pointEntityId,
      data: {
        point: [...this.currentPoint],
        loss: this.loss,
        gradient: [...this.gradient],
        gradientNorm: this.gradientNorm,
      },
    })

    if (this.gradientNorm <= epsilon) {
      this._state = 'completed'
      events.push({
        type: 'settle',
        entityId: this.config.pointEntityId,
        data: { point: [...this.currentPoint], loss: this.loss, gradientNorm: this.gradientNorm },
      })
      events.push({ type: 'complete', data: { reason: 'converged' } })
    } else if (this._currentStep >= this.config.maxIterations - 1) {
      this._state = 'completed'
      events.push({ type: 'complete', data: { reason: 'max_iterations' } })
    }

    return this.makeStepResult(events)
  }

  run(maxSteps = this._totalSteps || 1000): ProcessRunResult<GradientDescentProcessState> {
    const steps: Array<ProcessStepResult<GradientDescentProcessState>> = []
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
      iteration: Math.max(0, this._currentStep + 1),
      loss: this.loss,
      gradientNorm: this.gradientNorm,
      trajectoryLength: this.trajectory.length,
    }
  }

  getSnapshot(): ProcessSnapshot<GradientDescentSnapshotData> {
    return {
      state: this._state,
      currentStep: this._currentStep,
      data: {
        config: this.config ? this.cloneValue(this.config) : null,
        currentPoint: [...this.currentPoint],
        trajectory: this.trajectory.map(point => [...point] as [number, number]),
        loss: this.loss,
        gradient: [...this.gradient],
        gradientNorm: this.gradientNorm,
        failedReason: this.failedReason,
      },
    }
  }

  restoreSnapshot(snapshot: ProcessSnapshot): void {
    const data = snapshot.data as GradientDescentSnapshotData
    this._state = snapshot.state
    this._currentStep = snapshot.currentStep
    this.config = data.config ? this.normalizeConfig(data.config) : null
    this.currentPoint = [...data.currentPoint]
    this.trajectory = data.trajectory.map(point => [...point] as [number, number])
    this.loss = data.loss
    this.gradient = [...data.gradient]
    this.gradientNorm = data.gradientNorm
    this.failedReason = data.failedReason
    this._totalSteps = this.config?.maxIterations ?? this._totalSteps
  }

  private makeStepResult(events: ProcessEvent[]): ProcessStepResult<GradientDescentProcessState> {
    return {
      step: this._currentStep,
      state: {
        iteration: Math.max(0, this._currentStep + 1),
        currentPoint: [...this.currentPoint],
        trajectory: this.trajectory.map(point => [...point] as [number, number]),
        loss: this.loss,
        gradient: [...this.gradient],
        gradientNorm: this.gradientNorm,
      },
      metrics: this.getMetrics(),
      events: events.map(evt => this.cloneValue(evt)),
    }
  }

  private fail(reason: string): void {
    this._state = 'failed'
    this.failedReason = reason
  }

  private normalizeConfig(input: GradientDescentProcessConfig): GradientDescentProcessConfig {
    const startPoint: [number, number] = [
      Number(input.startPoint?.[0] ?? 0),
      Number(input.startPoint?.[1] ?? 0),
    ]
    const learningRate = finiteOr(input.learningRate, 0.1)
    const maxIterations = Math.max(1, Math.floor(finiteOr(input.maxIterations, 50)))
    const epsilon = Math.max(1e-10, finiteOr(input.epsilon, 1e-3))

    return {
      ...input,
      startPoint,
      learningRate,
      maxIterations,
      epsilon,
      coefficients: this.normalizeCoefficients(input.coefficients),
      pointEntityId: typeof input.pointEntityId === 'string' ? input.pointEntityId : undefined,
    }
  }

  private normalizeCoefficients(input: Partial<QuadraticCoefficients> | undefined): QuadraticCoefficients {
    return {
      a: finiteOr(input?.a, DEFAULT_COEFFICIENTS.a),
      b: finiteOr(input?.b, DEFAULT_COEFFICIENTS.b),
      c: finiteOr(input?.c, DEFAULT_COEFFICIENTS.c),
      d: finiteOr(input?.d, DEFAULT_COEFFICIENTS.d),
      e: finiteOr(input?.e, DEFAULT_COEFFICIENTS.e),
      f: finiteOr(input?.f, DEFAULT_COEFFICIENTS.f),
    }
  }

  private evaluateLoss(point: [number, number]): number {
    const coeff = this.normalizeCoefficients(this.config?.coefficients)
    const [x, y] = point
    return coeff.a * x * x + coeff.b * y * y + coeff.c * x * y + coeff.d * x + coeff.e * y + coeff.f
  }

  private evaluateGradient(point: [number, number]): [number, number] {
    const coeff = this.normalizeCoefficients(this.config?.coefficients)
    const [x, y] = point
    return [
      2 * coeff.a * x + coeff.c * y + coeff.d,
      2 * coeff.b * y + coeff.c * x + coeff.e,
    ]
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

function norm2(value: [number, number]): number {
  return Math.sqrt(value[0] * value[0] + value[1] * value[1])
}

function finiteOr(value: unknown, fallback: number): number {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(candidate) ? candidate : fallback
}
