export type TrackType = 'property' | 'event' | 'step' | 'state'

export interface Keyframe<T = unknown> {
  time: number
  value: T
  easing?: 'linear' | 'step' | 'ease-in' | 'ease-out' | 'ease-in-out'
}

export abstract class Track<T = unknown> {
  readonly id: string
  readonly type: TrackType
  protected keyframes: Keyframe<T>[] = []

  constructor(id: string, type: TrackType) {
    this.id = id
    this.type = type
  }

  addKeyframe(kf: Keyframe<T>): this {
    this.keyframes.push(kf)
    this.keyframes.sort((a, b) => a.time - b.time)
    return this
  }

  removeKeyframe(time: number): this {
    this.keyframes = this.keyframes.filter(k => k.time !== time)
    return this
  }

  getKeyframes(): Keyframe<T>[] {
    return this.keyframes
  }

  clearKeyframes(): this {
    this.keyframes = []
    return this
  }

  /** Evaluate the track at a given time, returns the computed value */
  abstract evaluate(time: number): T | undefined

  protected findSurrounding(time: number): [Keyframe<T> | null, Keyframe<T> | null] {
    let prev: Keyframe<T> | null = null
    let next: Keyframe<T> | null = null
    for (const kf of this.keyframes) {
      if (kf.time <= time) prev = kf
      else if (next === null) next = kf
    }
    return [prev, next]
  }
}
