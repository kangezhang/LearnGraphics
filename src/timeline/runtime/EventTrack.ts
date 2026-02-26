import { Track } from './Track'

export interface TimelineEvent {
  name: string
  payload?: unknown
}

/** Fires discrete events at specific times */
export class EventTrack extends Track<TimelineEvent> {
  private fired = new Set<number>()

  constructor(id: string) {
    super(id, 'event')
  }

  evaluate(time: number): TimelineEvent | undefined {
    // returns the most recent unfired event at or before time
    for (const kf of this.keyframes) {
      if (kf.time <= time && !this.fired.has(kf.time)) {
        this.fired.add(kf.time)
        return kf.value
      }
    }
    return undefined
  }

  /** Reset fired state (called on seek/stop) */
  reset(upToTime = 0): void {
    this.fired.clear()
    // re-mark events before upToTime as already fired so they don't re-trigger
    for (const kf of this.keyframes) {
      if (kf.time < upToTime) this.fired.add(kf.time)
    }
  }
}
