import type { DSLTimeline } from '@/dsl/timeline/TimelineDSL'

export interface LessonMetaDSL {
  id: string
  title: string
  tags?: string[]
  level?: string
  order?: number
}

export interface DSLEntity {
  id: string
  type: string
  anchor?: string | [number, number, number]
  position?: [number, number, number]
  direction?: string | [number, number, number]
  label?: string
  color?: string
  props?: Record<string, unknown>
  [key: string]: unknown
}

export interface DSLRelation {
  id: string
  type: string
  source?: string
  target?: string
  from?: string
  to?: string
  vectorA?: string
  vectorB?: string
  sourceId?: string
  targetId?: string
  props?: Record<string, unknown>
  [key: string]: unknown
}

export interface DSLUIBinding {
  id?: string
  target: string
  targetKind?: 'entity' | 'relation'
  property: string
  expr?: string
  value?: number | string | boolean
}

export interface DSLUISlider {
  id: string
  label: string
  min: number
  max: number
  step?: number
  value: number
  bindings?: DSLUIBinding[]
}

export type DSLViewType = '3d' | 'graph' | 'inspector' | 'plot'

export interface DSLView {
  id: string
  type: DSLViewType
  camera?: Record<string, unknown>
  overlays?: string[]
  [key: string]: unknown
}

export interface DSLUIConfig {
  constants?: Record<string, number | string | boolean>
  sliders?: DSLUISlider[]
  bindings?: DSLUIBinding[]
}

export interface LessonDSL {
  meta: LessonMetaDSL
  entities?: DSLEntity[]
  relations?: DSLRelation[]
  process?: {
    id?: string
    type: string
    config?: Record<string, unknown>
    [key: string]: unknown
  }
  views?: DSLView[]
  ui?: DSLUIConfig
  timeline?: DSLTimeline
}

export function resolveRelationEndpoints(rel: DSLRelation): { sourceId: string; targetId: string } | null {
  const sourceId = firstString(rel.source, rel.from, rel.vectorA, rel.sourceId)
  const targetId = firstString(rel.target, rel.to, rel.vectorB, rel.targetId)
  if (!sourceId || !targetId) return null
  return { sourceId, targetId }
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value
  }
  return null
}
