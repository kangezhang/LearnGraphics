import { Track } from './Track'

export interface StateData {
  state: string
  trigger?: string
  payload?: unknown
}

/** Discrete state timeline; each keyframe represents a process state change. */
export class StateTrack extends Track<StateData> {
  readonly processId?: string

  constructor(id: string, processId?: string) {
    super(id, 'state')
    this.processId = processId
  }

  evaluate(time: number): StateData | undefined {
    if (this.keyframes.length === 0) return undefined
    const [prev] = this.findSurrounding(time)
    return prev?.value ?? this.keyframes[0].value
  }
}
