import { Track } from './Track'

export interface TimelineEvent {
  name: string
  payload?: unknown
}

/** Fires discrete events at specific times */
export class EventTrack extends Track<TimelineEvent> {
  readonly processId?: string
  private fired = new Set<string>()

  constructor(id: string, processId?: string) {
    super(id, 'event')
    this.processId = processId
  }

  evaluate(time: number): TimelineEvent | undefined {
    // returns the next unfired event at or before time
    for (let i = 0; i < this.keyframes.length; i++) {
      const kf = this.keyframes[i]
      const key = `${kf.time}:${i}`
      if (kf.time <= time && !this.fired.has(key)) {
        this.fired.add(key)
        return kf.value
      }
    }
    return undefined
  }

  /** Reset fired state (called on seek/stop) */
  reset(upToTime = 0): void {
    this.fired.clear()
    // re-mark events before upToTime as already fired so they don't re-trigger
    for (let i = 0; i < this.keyframes.length; i++) {
      const kf = this.keyframes[i]
      if (kf.time < upToTime) this.fired.add(`${kf.time}:${i}`)
    }
  }
}
