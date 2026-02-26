import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { EventTrack, type TimelineEvent } from '@/timeline/runtime/EventTrack'
import { StepTrack, type StepData } from '@/timeline/runtime/StepTrack'
import { StateTrack, type StateData } from '@/timeline/runtime/StateTrack'
import type { IProcess, ProcessRunResult, ProcessStepResult } from './IProcess'

export interface ProcessTimelineBindingResult {
  processId: string
  stepTrackIds: string[]
  stateTrackIds: string[]
  eventTrackIds: string[]
  generatedSteps: number
}

export class ProcessTimelineBinder {
  static bind(runtime: TimelineRuntime, process: IProcess): ProcessTimelineBindingResult {
    const tracks = Array.from(runtime.getTracks().values())
    const stepTracks = tracks.filter(
      (track): track is StepTrack => track instanceof StepTrack && this.matchesProcess(track.processId, process, true)
    )
    const stateTracks = tracks.filter(
      (track): track is StateTrack => track instanceof StateTrack && this.matchesProcess(track.processId, process, true)
    )
    const eventTracks = tracks.filter(
      (track): track is EventTrack => track instanceof EventTrack && this.matchesProcess(track.processId, process, false)
    )

    process.reset()
    const runResult = process.run()

    for (const track of stepTracks) {
      this.bindStepTrack(track, runResult, runtime.duration)
    }
    for (const track of stateTracks) {
      this.bindStateTrack(track, runResult, runtime.duration)
    }

    const eventTimeRefs = this.resolveReferenceTimes(
      stepTracks,
      stateTracks,
      Math.max(runResult.steps.length, 1),
      runtime.duration
    )

    for (const track of eventTracks) {
      this.bindEventTrack(track, process, runResult, runtime.duration, eventTimeRefs)
    }

    process.reset()

    return {
      processId: process.id,
      stepTrackIds: stepTracks.map(track => track.id),
      stateTrackIds: stateTracks.map(track => track.id),
      eventTrackIds: eventTracks.map(track => track.id),
      generatedSteps: runResult.steps.length,
    }
  }

  private static bindStepTrack(
    track: StepTrack,
    runResult: ProcessRunResult,
    duration: number
  ): void {
    const steps = runResult.steps
    const times = this.resolveTimes(
      track.getKeyframes().map(kf => kf.time),
      steps.length,
      duration
    )

    track.clearKeyframes()
    for (let i = 0; i < steps.length; i++) {
      const result = steps[i]
      const nodeId = this.extractNodeId(result.state)
      const value: StepData = {
        index: i,
        label: this.resolveStepLabel(result, i),
        payload: {
          nodeId,
          state: this.cloneValue(result.state),
          metrics: this.cloneValue(result.metrics),
          events: this.cloneValue(result.events),
        },
      }
      track.addKeyframe({ time: times[i], value })
    }
  }

  private static bindStateTrack(
    track: StateTrack,
    runResult: ProcessRunResult,
    duration: number
  ): void {
    const steps = runResult.steps
    const count = Math.max(steps.length, 1)
    const times = this.resolveTimes(
      track.getKeyframes().map(kf => kf.time),
      count,
      duration
    )

    track.clearKeyframes()

    if (steps.length === 0) {
      const value: StateData = {
        state: runResult.state,
        trigger: 'process',
        payload: {
          metrics: this.cloneValue(runResult.metrics),
          failedReason: runResult.failedReason,
        },
      }
      track.addKeyframe({ time: times[0] ?? 0, value })
      return
    }

    const lastIndex = steps.length - 1
    for (let i = 0; i < steps.length; i++) {
      const result = steps[i]
      const value: StateData = {
        state: this.resolveStateName(result, runResult, i, lastIndex),
        trigger: result.events[0]?.type,
        payload: {
          step: result.step,
          state: this.cloneValue(result.state),
          metrics: this.cloneValue(result.metrics),
          events: this.cloneValue(result.events),
          processState: i === lastIndex ? runResult.state : 'running',
          failedReason: i === lastIndex ? runResult.failedReason : undefined,
        },
      }
      track.addKeyframe({ time: times[i], value })
    }
  }

  private static bindEventTrack(
    track: EventTrack,
    process: IProcess,
    runResult: ProcessRunResult,
    duration: number,
    referenceTimes: number[]
  ): void {
    const steps = runResult.steps
    const count = Math.max(steps.length, 1)
    const existingTimes = track.getKeyframes().map(kf => kf.time)
    const stepTimes = referenceTimes.length === count
      ? referenceTimes.map(time => clamp(time, 0, duration))
      : this.resolveTimes(existingTimes, count, duration)
    const firstTime = stepTimes[0] ?? 0
    const finalTime = stepTimes[stepTimes.length - 1] ?? duration

    track.clearKeyframes()
    track.addKeyframe({
      time: firstTime,
      value: {
        name: 'process_state',
        payload: {
          processId: process.id,
          state: 'running',
        },
      },
    })

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]
      const time = stepTimes[i] ?? firstTime
      for (const evt of step.events) {
        const value: TimelineEvent = {
          name: evt.type,
          payload: {
            processId: process.id,
            processType: process.type,
            step: step.step,
            entityId: evt.entityId,
            data: this.cloneValue(evt.data),
            state: this.cloneValue(step.state),
            metrics: this.cloneValue(step.metrics),
          },
        }
        track.addKeyframe({ time, value })
      }
    }

    track.addKeyframe({
      time: finalTime,
      value: {
        name: 'process_state',
        payload: {
          processId: process.id,
          state: runResult.state,
          failedReason: runResult.failedReason,
          metrics: this.cloneValue(runResult.metrics),
        },
      },
    })
  }

  private static matchesProcess(trackProcessId: string | undefined, process: IProcess, allowUnbound: boolean): boolean {
    if (!trackProcessId) return allowUnbound
    return trackProcessId === process.id || trackProcessId === process.type
  }

  private static resolveReferenceTimes(
    stepTracks: StepTrack[],
    stateTracks: StateTrack[],
    count: number,
    duration: number
  ): number[] {
    const fromStep = this.findMatchingTimes(stepTracks.map(track => track.getKeyframes().map(kf => kf.time)), count, duration)
    if (fromStep.length === count) return fromStep

    const fromState = this.findMatchingTimes(stateTracks.map(track => track.getKeyframes().map(kf => kf.time)), count, duration)
    if (fromState.length === count) return fromState

    return []
  }

  private static findMatchingTimes(candidates: number[][], count: number, duration: number): number[] {
    for (const times of candidates) {
      if (times.length === count) return times.map(time => clamp(time, 0, duration))
    }
    for (const times of candidates) {
      if (times.length > 0) return this.resolveTimes(times, count, duration)
    }
    return []
  }

  private static resolveTimes(existing: number[], count: number, duration: number): number[] {
    if (count <= 0) return []

    const sorted = [...existing].sort((a, b) => a - b)
    if (sorted.length === count) {
      return sorted.map(time => clamp(time, 0, duration))
    }

    if (count === 1) {
      return [clamp(sorted[0] ?? 0, 0, duration)]
    }

    if (sorted.length >= 2) {
      const start = clamp(sorted[0], 0, duration)
      const end = clamp(sorted[sorted.length - 1], 0, duration)
      return this.uniformTimes(count, start, end)
    }

    return this.uniformTimes(count, 0, Math.max(duration, 0))
  }

  private static uniformTimes(count: number, start: number, end: number): number[] {
    if (count <= 1) return [start]
    const times: number[] = []
    for (let i = 0; i < count; i++) {
      const alpha = i / (count - 1)
      times.push(start + (end - start) * alpha)
    }
    return times
  }

  private static resolveStepLabel(step: ProcessStepResult, index: number): string {
    const nodeId = this.extractNodeId(step.state)
    if (nodeId) return nodeId

    if (typeof step.state === 'object' && step.state !== null) {
      const record = step.state as Record<string, unknown>
      if (typeof record.label === 'string' && record.label.length > 0) return record.label
    }
    return `S${index + 1}`
  }

  private static extractNodeId(state: unknown): string | undefined {
    if (typeof state !== 'object' || state === null) return undefined
    const record = state as Record<string, unknown>
    if (typeof record.currentNode === 'string') return record.currentNode
    if (typeof record.nodeId === 'string') return record.nodeId
    return undefined
  }

  private static resolveStateName(
    step: ProcessStepResult,
    runResult: ProcessRunResult,
    index: number,
    lastIndex: number
  ): string {
    if (step.events.some(evt => evt.type === 'fail')) return 'failed'
    if (step.events.some(evt => evt.type === 'hit')) return 'hit'
    if (index === lastIndex) return runResult.state
    return 'running'
  }

  private static cloneValue<T>(value: T): T {
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
