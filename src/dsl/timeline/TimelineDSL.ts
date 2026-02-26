import type { SerializedTimeline, SerializedTrack, TimelineMarker } from '@/timeline/runtime/TimelineRuntime'

export interface DSLTimeline {
  duration: number
  loop?: boolean
  speed?: number
  markers?: TimelineMarker[]
  tracks?: DSLTrack[]
}

export type DSLTrack = DSLPropertyTrack | DSLEventTrack | DSLStepTrack | DSLStateTrack

export interface DSLPropertyTrack {
  id?: string
  type: 'property'
  target: string
  property: string
  keyframes: Array<{ time: number; value: number | string; easing?: string }>
}

export interface DSLEventTrack {
  id?: string
  type: 'event'
  processId?: string
  events: Array<{ time: number; action: string; params?: unknown }>
}

export interface DSLStepTrack {
  id?: string
  type: 'step'
  processId?: string
  steps: Array<{ index: number; time: number; duration?: number; label?: string; payload?: unknown }>
}

export interface DSLStateTrack {
  id?: string
  type: 'state'
  processId?: string
  states: Array<{ time: number; state: string; trigger?: string; payload?: unknown }>
}

export function toDSLTimeline(serialized: SerializedTimeline): DSLTimeline {
  return {
    duration: serialized.duration,
    loop: serialized.loop,
    speed: serialized.speed,
    markers: serialized.markers.map(m => ({ ...m })),
    tracks: serialized.tracks.map(toDSLTrack),
  }
}

export function fromDSLTimeline(dsl: DSLTimeline): SerializedTimeline {
  const tracks = (dsl.tracks ?? []).map((track, i) => fromDSLTrack(track, i))
  return {
    duration: dsl.duration,
    loop: dsl.loop ?? false,
    speed: dsl.speed ?? 1,
    markers: (dsl.markers ?? []).map(m => ({ ...m })),
    tracks,
  }
}

function toDSLTrack(track: SerializedTrack): DSLTrack {
  switch (track.type) {
    case 'property':
      return {
        id: track.id,
        type: 'property',
        target: track.targetId ?? '',
        property: track.propName ?? '',
        keyframes: track.keyframes.map(kf => ({
          time: kf.time,
          value: (kf.value as number | string) ?? 0,
          easing: kf.easing,
        })),
      }
    case 'event':
      return {
        id: track.id,
        type: 'event',
        processId: track.processId,
        events: track.keyframes.map(kf => {
          const event = toEventValue(kf.value)
          return {
            time: kf.time,
            action: event.name,
            params: event.payload,
          }
        }),
      }
    case 'step':
      return {
        id: track.id,
        type: 'step',
        processId: track.processId,
        steps: track.keyframes.map((kf, i) => {
          const value = toStepValue(kf.value)
          const next = track.keyframes[i + 1]
          return {
            index: value.index ?? i,
            time: kf.time,
            duration: next ? Math.max(0, next.time - kf.time) : 0,
            label: value.label,
            payload: value.payload,
          }
        }),
      }
    case 'state':
      return {
        id: track.id,
        type: 'state',
        processId: track.processId,
        states: track.keyframes.map(kf => {
          const value = toStateValue(kf.value)
          return {
            time: kf.time,
            state: value.state,
            trigger: value.trigger,
            payload: value.payload,
          }
        }),
      }
    default:
      return {
        id: track.id,
        type: 'event',
        events: [],
      }
  }
}

function fromDSLTrack(track: DSLTrack, index: number): SerializedTrack {
  const id = track.id ?? `${track.type}-${index + 1}`
  switch (track.type) {
    case 'property':
      return {
        id,
        type: 'property',
        targetId: track.target,
        propName: track.property,
        keyframes: track.keyframes.map(kf => ({
          time: kf.time,
          value: kf.value,
          easing: kf.easing,
        })),
      }
    case 'event':
      return {
        id,
        type: 'event',
        processId: track.processId,
        keyframes: track.events.map(evt => ({
          time: evt.time,
          value: { name: evt.action, payload: evt.params },
        })),
      }
    case 'step':
      return {
        id,
        type: 'step',
        processId: track.processId,
        keyframes: track.steps.map(step => ({
          time: step.time,
          value: {
            index: step.index,
            label: step.label,
            payload: step.payload,
          },
        })),
      }
    case 'state':
      return {
        id,
        type: 'state',
        processId: track.processId,
        keyframes: track.states.map(state => ({
          time: state.time,
          value: {
            state: state.state,
            trigger: state.trigger,
            payload: state.payload,
          },
        })),
      }
    default:
      return {
        id,
        type: 'event',
        keyframes: [],
      }
  }
}

function toEventValue(value: unknown): { name: string; payload?: unknown } {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { name?: unknown; payload?: unknown }
    if (typeof candidate.name === 'string') {
      return { name: candidate.name, payload: candidate.payload }
    }
  }
  return { name: 'event', payload: value }
}

function toStepValue(value: unknown): { index?: number; label?: string; payload?: unknown } {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { index?: unknown; label?: unknown; payload?: unknown }
    return {
      index: typeof candidate.index === 'number' ? candidate.index : undefined,
      label: typeof candidate.label === 'string' ? candidate.label : undefined,
      payload: candidate.payload,
    }
  }
  return {}
}

function toStateValue(value: unknown): { state: string; trigger?: string; payload?: unknown } {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { state?: unknown; trigger?: unknown; payload?: unknown }
    return {
      state: typeof candidate.state === 'string' ? candidate.state : 'unknown',
      trigger: typeof candidate.trigger === 'string' ? candidate.trigger : undefined,
      payload: candidate.payload,
    }
  }
  return { state: 'unknown', payload: value }
}
