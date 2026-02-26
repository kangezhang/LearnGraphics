import type { DSLTimeline } from '@/dsl/timeline/TimelineDSL'

export interface DSLPatch {
  op: 'add' | 'remove' | 'replace' | 'move'
  path: string
  value?: unknown
}

export function buildTimelineReplacePatch(timeline: DSLTimeline): DSLPatch[] {
  return [
    {
      op: 'replace',
      path: '/timeline',
      value: timeline,
    },
  ]
}
