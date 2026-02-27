import { Track } from './Track'
import { EventTrack, type TimelineEvent } from './EventTrack'
import { StepTrack } from './StepTrack'
import { PropertyTrack } from './PropertyTrack'
import { StateTrack } from './StateTrack'
import { TrackEvaluator, type TrackEvaluationResult } from '@/timeline/tracks/TrackEvaluator'

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
  autoPauseAtMarkers?: boolean
  markerPauseMs?: number
  skipInitialMarkerPause?: boolean
}

export interface SerializedTrack {
  id: string
  type: 'property' | 'event' | 'step' | 'state'
  targetId?: string
  propName?: string
  processId?: string
  keyframes: Array<{ time: number; value: unknown; easing?: string }>
}

export interface SerializedTimeline {
  duration: number
  speed: number
  loop: boolean
  markers: TimelineMarker[]
  tracks: SerializedTrack[]
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
  private _duration: number
  private _loop: boolean
  private _autoPauseAtMarkers: boolean
  private _markerPauseMs: number
  private _skipInitialMarkerPause: boolean
  private _pausedMarkerTimes = new Set<number>()
  private _resumeTimer: number | null = null

  speed: number

  private tickHandlers: Array<(time: number) => void> = []
  private eventHandlers: Array<(evt: TimelineEvent) => void> = []
  private stateHandlers: Array<(state: PlayState) => void> = []
  private endHandlers: Array<() => void> = []

  constructor(opts: TimelineRuntimeOptions) {
    this._duration = Math.max(0, opts.duration)
    this._loop = opts.loop ?? false
    this.speed = opts.speed ?? 1
    this._markers = opts.markers ? [...opts.markers].sort((a, b) => a.time - b.time) : []
    this._autoPauseAtMarkers = opts.autoPauseAtMarkers ?? true
    this._markerPauseMs = Math.max(0, opts.markerPauseMs ?? 700)
    this._skipInitialMarkerPause = opts.skipInitialMarkerPause ?? true
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

  configureMarkerAutoPause(opts: {
    enabled?: boolean
    pauseMs?: number
    skipInitialMarkerPause?: boolean
  }): void {
    if (typeof opts.enabled === 'boolean') this._autoPauseAtMarkers = opts.enabled
    if (typeof opts.pauseMs === 'number' && Number.isFinite(opts.pauseMs)) {
      this._markerPauseMs = Math.max(0, opts.pauseMs)
    }
    if (typeof opts.skipInitialMarkerPause === 'boolean') {
      this._skipInitialMarkerPause = opts.skipInitialMarkerPause
    }
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

  evaluateAt(time: number = this._time): TrackEvaluationResult {
    return TrackEvaluator.evaluateAtTime(this.tracks.values(), time)
  }

  clearTracks(): void {
    this.tracks.clear()
  }

  serialize(): SerializedTimeline {
    const tracks: SerializedTrack[] = []
    this.tracks.forEach(track => {
      if (track instanceof PropertyTrack) {
        tracks.push({
          id: track.id,
          type: 'property',
          targetId: track.targetId,
          propName: track.propName,
          keyframes: track.getKeyframes().map(kf => ({
            time: kf.time,
            value: this.cloneValue(kf.value),
            easing: kf.easing,
          })),
        })
      } else if (track instanceof EventTrack) {
        tracks.push({
          id: track.id,
          type: 'event',
          processId: track.processId,
          keyframes: track.getKeyframes().map(kf => ({
            time: kf.time,
            value: this.cloneValue(kf.value),
            easing: kf.easing,
          })),
        })
      } else if (track instanceof StepTrack) {
        tracks.push({
          id: track.id,
          type: 'step',
          processId: track.processId,
          keyframes: track.getKeyframes().map(kf => ({
            time: kf.time,
            value: this.cloneValue(kf.value),
            easing: kf.easing,
          })),
        })
      } else if (track instanceof StateTrack) {
        tracks.push({
          id: track.id,
          type: 'state',
          processId: track.processId,
          keyframes: track.getKeyframes().map(kf => ({
            time: kf.time,
            value: this.cloneValue(kf.value),
            easing: kf.easing,
          })),
        })
      }
    })

    return {
      duration: this.duration,
      speed: this.speed,
      loop: this.loop,
      markers: this._markers.map(m => ({ ...m })),
      tracks,
    }
  }

  applySerialized(data: SerializedTimeline): void {
    this._duration = Math.max(0, data.duration)
    this._loop = data.loop
    this.speed = data.speed
    this._markers = data.markers.map(m => ({ ...m })).sort((a, b) => a.time - b.time)
    this.clearTracks()

    for (const trackData of data.tracks) {
      const track = this.createTrackFromSerialized(trackData)
      if (!track) continue
      this.addTrack(track)
    }
    this.seek(0)
  }

  // ── Playback controls ─────────────────────────────────────────────────────

  play(): void {
    if (this._state === 'playing') return
    this._clearResumeTimer()
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
    this._clearResumeTimer()
    this._cancelRaf()
    this._seekInternal(0)
    this._setState('idle')
  }

  seek(time: number): void {
    const clamped = Math.max(0, Math.min(this.duration, time))
    if (clamped < this._time - 1e-6) {
      this._pausedMarkerTimes = new Set(
        this._markers
          .filter(marker => marker.time <= clamped + 1e-6)
          .map(marker => marker.time)
      )
    }
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
  get duration(): number { return this._duration }
  get loop(): boolean { return this._loop }

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
    this._clearResumeTimer()
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
    const prevTime = this._time
    const dt = ((ts - this._lastTs) / 1000) * this.speed
    this._lastTs = ts

    const nextTime = Math.min(prevTime + dt, this.duration)
    const pauseMarker = this._findPauseMarkerBetween(prevTime, nextTime)
    this._time = pauseMarker?.time ?? nextTime
    this._emitTick()
    this._drainEvents()

    if (pauseMarker) {
      this._pausedMarkerTimes.add(pauseMarker.time)
      this._cancelRaf()
      this._setState('paused')
      if (this._markerPauseMs > 0) {
        const markerTime = pauseMarker.time
        this._resumeTimer = window.setTimeout(() => {
          this._resumeTimer = null
          if (this._state === 'paused' && Math.abs(this._time - markerTime) <= 1e-6) {
            this.play()
          }
        }, this._markerPauseMs)
      }
      return
    }

    if (this._time >= this.duration) {
      if (this.loop) {
        this._seekInternal(0)
        this._pausedMarkerTimes.clear()
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
        while (true) {
          const evt = track.evaluate(this._time)
          if (!evt) break
          this.eventHandlers.forEach(h => h(evt))
        }
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

  private _findPauseMarkerBetween(fromTime: number, toTime: number): TimelineMarker | null {
    if (!this._autoPauseAtMarkers || this._markers.length === 0) return null
    if (toTime <= fromTime + 1e-6) return null
    for (const marker of this._markers) {
      if (this._skipInitialMarkerPause && marker.time <= 1e-6) continue
      if (this._pausedMarkerTimes.has(marker.time)) continue
      if (marker.time > fromTime + 1e-6 && marker.time <= toTime + 1e-6) {
        return marker
      }
    }
    return null
  }

  private _clearResumeTimer(): void {
    if (this._resumeTimer !== null) {
      window.clearTimeout(this._resumeTimer)
      this._resumeTimer = null
    }
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

  private createTrackFromSerialized(data: SerializedTrack): Track | null {
    switch (data.type) {
      case 'property': {
        const targetId = data.targetId ?? ''
        const propName = data.propName ?? ''
        const track = new PropertyTrack(data.id, targetId, propName)
        data.keyframes.forEach(kf => {
          track.addKeyframe({
            time: kf.time,
            value: (kf.value as number | string) ?? 0,
            easing: this.toPropertyEasing(kf.easing),
          })
        })
        return track
      }
      case 'event': {
        const track = new EventTrack(data.id, data.processId)
        data.keyframes.forEach(kf => {
          track.addKeyframe({
            time: kf.time,
            value: this.toTimelineEvent(this.cloneValue(kf.value)),
          })
        })
        return track
      }
      case 'step': {
        const track = new StepTrack(data.id, data.processId)
        data.keyframes.forEach(kf => track.addKeyframe({ time: kf.time, value: this.cloneValue(kf.value) as never }))
        return track
      }
      case 'state': {
        const track = new StateTrack(data.id, data.processId)
        data.keyframes.forEach(kf => track.addKeyframe({ time: kf.time, value: this.cloneValue(kf.value) as never }))
        return track
      }
      default:
        return null
    }
  }

  private toPropertyEasing(raw: string | undefined): 'linear' | 'step' | 'ease-in' | 'ease-out' | 'ease-in-out' {
    switch (raw) {
      case 'step':
      case 'ease-in':
      case 'ease-out':
      case 'ease-in-out':
      case 'linear':
        return raw
      default:
        return 'linear'
    }
  }

  private toTimelineEvent(value: unknown): TimelineEvent {
    if (typeof value === 'object' && value !== null && 'name' in value) {
      const candidate = value as { name?: unknown; payload?: unknown }
      if (typeof candidate.name === 'string') {
        return {
          name: candidate.name,
          payload: candidate.payload,
        }
      }
    }
    return {
      name: 'event',
      payload: value,
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
    try {
      return JSON.parse(JSON.stringify(value)) as T
    } catch {
      return value
    }
  }
}
