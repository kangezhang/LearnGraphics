import { Track } from './Track'
import { EventTrack, type TimelineEvent } from './EventTrack'
import { StepTrack } from './StepTrack'

export type PlayState = 'idle' | 'playing' | 'paused'

export interface TimelineMarker {
  time: number
  label: string
  description?: string
  color?: string
}

export interface TimelineRuntimeOptions {
  duration: number
  loop?: boolean
  speed?: number
  markers?: TimelineMarker[]
}

export type TimelineListener =
  | { type: 'tick'; handler: (time: number) => void }
  | { type: 'event'; handler: (evt: TimelineEvent) => void }
  | { type: 'stateChange'; handler: (state: PlayState) => void }
  | { type: 'end'; handler: () => void }

export class TimelineRuntime {
  private tracks = new Map<string, Track>()
  private _time = 0
  private _state: PlayState = 'idle'
  private _rafId: number | null = null
  private _lastTs: number | null = null
  private _markers: TimelineMarker[] = []

  readonly duration: number
  readonly loop: boolean
  speed: number

  private tickHandlers: Array<(time: number) => void> = []
  private eventHandlers: Array<(evt: TimelineEvent) => void> = []
  private stateHandlers: Array<(state: PlayState) => void> = []
  private endHandlers: Array<() => void> = []

  constructor(opts: TimelineRuntimeOptions) {
    this.duration = opts.duration
    this.loop = opts.loop ?? false
    this.speed = opts.speed ?? 1
    this._markers = opts.markers ? [...opts.markers].sort((a, b) => a.time - b.time) : []
  }

  // ── Marker management ─────────────────────────────────────────────────────

  addMarker(marker: TimelineMarker): void {
    this._markers.push(marker)
    this._markers.sort((a, b) => a.time - b.time)
  }

  removeMarker(time: number): void {
    this._markers = this._markers.filter(m => m.time !== time)
  }

  getMarkers(): readonly TimelineMarker[] {
    return this._markers
  }

  getTracks(): ReadonlyMap<string, Track> {
    return this.tracks
  }

  // ── Track management ──────────────────────────────────────────────────────

  addTrack(track: Track): this {
    this.tracks.set(track.id, track)
    return this
  }

  getTrack<T extends Track>(id: string): T | undefined {
    return this.tracks.get(id) as T | undefined
  }

  // ── Playback controls ─────────────────────────────────────────────────────

  play(): void {
    if (this._state === 'playing') return
    if (this._time >= this.duration) this._seekInternal(0)
    this._setState('playing')
    this._lastTs = null
    this._rafId = requestAnimationFrame(this._tick)
  }

  pause(): void {
    if (this._state !== 'playing') return
    this._cancelRaf()
    this._setState('paused')
  }

  stop(): void {
    this._cancelRaf()
    this._seekInternal(0)
    this._setState('idle')
  }

  seek(time: number): void {
    const clamped = Math.max(0, Math.min(this.duration, time))
    this._seekInternal(clamped)
    this._emitTick()
  }

  /** Advance to the next step keyframe on any StepTrack */
  stepForward(): void {
    const next = this._nearestStepTime(1)
    if (next !== undefined) this.seek(next)
  }

  /** Go back to the previous step keyframe on any StepTrack */
  stepBackward(): void {
    const prev = this._nearestStepTime(-1)
    if (prev !== undefined) this.seek(prev)
  }

  get time(): number { return this._time }
  get state(): PlayState { return this._state }
  get progress(): number { return this.duration > 0 ? this._time / this.duration : 0 }

  // ── Event subscription ────────────────────────────────────────────────────

  on(listener: TimelineListener): () => void {
    switch (listener.type) {
      case 'tick': this.tickHandlers.push(listener.handler); break
      case 'event': this.eventHandlers.push(listener.handler); break
      case 'stateChange': this.stateHandlers.push(listener.handler); break
      case 'end': this.endHandlers.push(listener.handler); break
    }
    return () => this._off(listener)
  }

  dispose(): void {
    this._cancelRaf()
    this.tickHandlers = []
    this.eventHandlers = []
    this.stateHandlers = []
    this.endHandlers = []
    this.tracks.clear()
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _tick = (ts: number): void => {
    if (this._lastTs === null) this._lastTs = ts
    const dt = ((ts - this._lastTs) / 1000) * this.speed
    this._lastTs = ts

    this._time = Math.min(this._time + dt, this.duration)
    this._emitTick()
    this._drainEvents()

    if (this._time >= this.duration) {
      if (this.loop) {
        this._seekInternal(0)
      } else {
        this._cancelRaf()
        this._setState('idle')
        this.endHandlers.forEach(h => h())
        return
      }
    }

    this._rafId = requestAnimationFrame(this._tick)
  }

  private _emitTick(): void {
    this.tickHandlers.forEach(h => h(this._time))
  }

  private _drainEvents(): void {
    this.tracks.forEach(track => {
      if (track instanceof EventTrack) {
        const evt = track.evaluate(this._time)
        if (evt) this.eventHandlers.forEach(h => h(evt))
      }
    })
  }

  private _seekInternal(time: number): void {
    this._time = time
    this.tracks.forEach(track => {
      if (track instanceof EventTrack) track.reset(time)
    })
  }

  private _setState(state: PlayState): void {
    this._state = state
    this.stateHandlers.forEach(h => h(state))
  }

  private _cancelRaf(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
    this._lastTs = null
  }

  private _nearestStepTime(dir: 1 | -1): number | undefined {
    let best: number | undefined
    this.tracks.forEach(track => {
      if (!(track instanceof StepTrack)) return
      for (const kf of track.getKeyframes()) {
        if (dir === 1 && kf.time > this._time + 1e-6) {
          if (best === undefined || kf.time < best) best = kf.time
        } else if (dir === -1 && kf.time < this._time - 1e-6) {
          if (best === undefined || kf.time > best) best = kf.time
        }
      }
    })
    return best
  }

  private _off(listener: TimelineListener): void {
    switch (listener.type) {
      case 'tick': this.tickHandlers = this.tickHandlers.filter(h => h !== listener.handler); break
      case 'event': this.eventHandlers = this.eventHandlers.filter(h => h !== listener.handler); break
      case 'stateChange': this.stateHandlers = this.stateHandlers.filter(h => h !== listener.handler); break
      case 'end': this.endHandlers = this.endHandlers.filter(h => h !== listener.handler); break
    }
  }
}
