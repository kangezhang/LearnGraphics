export type ProcessState = 'idle' | 'running' | 'paused' | 'completed' | 'failed'

export interface ProcessEvent {
  type: string
  entityId?: string
  data?: unknown
}

export interface ProcessStepResult<TState = unknown> {
  step: number
  state: TState
  metrics: Record<string, number>
  events: ProcessEvent[]
}

export interface ProcessRunResult<TState = unknown> {
  state: ProcessState
  steps: Array<ProcessStepResult<TState>>
  metrics: Record<string, number>
  failedReason?: string
}

export interface ProcessSnapshot<TData = unknown> {
  state: ProcessState
  currentStep: number
  data: TData
}

export interface IProcess<TConfig = unknown, TState = unknown> {
  readonly id: string
  readonly type: string
  readonly state: ProcessState
  readonly currentStep: number
  readonly totalSteps: number

  init(config: TConfig): void
  step(): ProcessStepResult<TState>
  run(maxSteps?: number): ProcessRunResult<TState>
  reset(): void

  getMetrics(): Record<string, number>
  getSnapshot(): ProcessSnapshot
  restoreSnapshot(snapshot: ProcessSnapshot): void
}
