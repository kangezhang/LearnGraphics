import type { Track } from '@/timeline/runtime/Track'
import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import { StepTrack, type StepData } from '@/timeline/runtime/StepTrack'
import { StateTrack, type StateData } from '@/timeline/runtime/StateTrack'

const TIME_EPSILON = 1e-6

export interface EvaluatedPropertyValue {
  trackId: string
  targetId: string
  propName: string
  value: number | string
}

export interface EvaluatedStepValue {
  trackId: string
  active: StepData | undefined
  completed: StepData[]
}

export interface EvaluatedStateValue {
  trackId: string
  value: StateData | undefined
}

export interface TrackEvaluationResult {
  properties: EvaluatedPropertyValue[]
  steps: EvaluatedStepValue[]
  states: EvaluatedStateValue[]
}

export class TrackEvaluator {
  static evaluateAtTime(tracks: Iterable<Track>, time: number): TrackEvaluationResult {
    const result: TrackEvaluationResult = {
      properties: [],
      steps: [],
      states: [],
    }

    for (const track of tracks) {
      if (track instanceof PropertyTrack) {
        const value = track.evaluate(time)
        if (value !== undefined) {
          result.properties.push({
            trackId: track.id,
            targetId: track.targetId,
            propName: track.propName,
            value,
          })
        }
      } else if (track instanceof StepTrack) {
        result.steps.push({
          trackId: track.id,
          active: track.evaluate(time),
          completed: this.collectCompletedSteps(track, time),
        })
      } else if (track instanceof StateTrack) {
        result.states.push({
          trackId: track.id,
          value: track.evaluate(time),
        })
      }
    }

    return result
  }

  static collectCompletedSteps(track: StepTrack, time: number): StepData[] {
    return track
      .getKeyframes()
      .filter(kf => kf.time <= time + TIME_EPSILON)
      .map(kf => kf.value)
  }
}
