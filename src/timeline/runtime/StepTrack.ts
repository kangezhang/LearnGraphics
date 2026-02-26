import { Track } from './Track'

export interface StepData {
  index: number
  label?: string
  payload?: unknown
}

/** Discrete step track — each keyframe is one step */
export class StepTrack extends Track<StepData> {
  readonly processId?: string

  constructor(id: string, processId?: string) {
    super(id, 'step')
    this.processId = processId
  }

  get totalSteps(): number {
    return this.keyframes.length
  }

  /** Returns the active step at the given time */
  evaluate(time: number): StepData | undefined {
    if (this.keyframes.length === 0) return undefined
    const [prev] = this.findSurrounding(time)
    return prev?.value ?? this.keyframes[0].value
  }

  /** Returns the time of step at index */
  timeOfStep(index: number): number | undefined {
    return this.keyframes[index]?.time
  }
}
