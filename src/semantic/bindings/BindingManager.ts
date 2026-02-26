import type { LessonDSL } from '@/semantic/compiler/dslTypes'
import { resolveRelationEndpoints } from '@/semantic/compiler/dslTypes'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'

export type ViewType = '3d' | 'graph' | 'inspector' | 'plot'

export interface BindingEntry {
  semanticId: string
  semanticKind: 'entity' | 'relation'
  viewTypes: ViewType[]
  targetObjectId: string
}

export interface BindingRegistry {
  bySemanticId: Map<string, BindingEntry[]>
  all: BindingEntry[]
}

export class BindingManager {
  build(dsl: LessonDSL, graph: SemanticGraph): BindingRegistry {
    const availableViews = this.resolveViews(dsl)
    const entries: BindingEntry[] = []
    const bySemanticId = new Map<string, BindingEntry[]>()

    for (const entity of graph.allEntities()) {
      const viewTypes = this.pickEntityViews(entity.type, availableViews)
      const entry: BindingEntry = {
        semanticId: entity.id,
        semanticKind: 'entity',
        viewTypes,
        targetObjectId: entity.id,
      }
      entries.push(entry)
      pushMap(bySemanticId, entity.id, entry)
    }

    for (const relation of dsl.relations ?? []) {
      const endpoints = resolveRelationEndpoints(relation)
      if (!endpoints) continue
      const entry: BindingEntry = {
        semanticId: relation.id,
        semanticKind: 'relation',
        viewTypes: this.pickRelationViews(relation.type, availableViews),
        targetObjectId: relation.id,
      }
      entries.push(entry)
      pushMap(bySemanticId, relation.id, entry)
      pushMap(bySemanticId, endpoints.sourceId, entry)
      pushMap(bySemanticId, endpoints.targetId, entry)
    }

    return { bySemanticId, all: entries }
  }

  private resolveViews(dsl: LessonDSL): Set<ViewType> {
    const resolved = new Set<ViewType>()
    for (const view of dsl.views ?? []) {
      const type = view.type
      if (type === '3d' || type === 'graph' || type === 'inspector' || type === 'plot') {
        resolved.add(type)
      }
    }
    if (resolved.size === 0) {
      resolved.add('3d')
      resolved.add('graph')
      resolved.add('inspector')
    }
    return resolved
  }

  private pickEntityViews(entityType: string, available: Set<ViewType>): ViewType[] {
    const graphLike = entityType === 'node' || entityType === 'edge'
    const targets: ViewType[] = []
    if (available.has('3d')) targets.push('3d')
    if (graphLike && available.has('graph')) targets.push('graph')
    if (available.has('inspector')) targets.push('inspector')
    if (entityType === 'badge' && available.has('plot')) targets.push('plot')
    return dedupe(targets)
  }

  private pickRelationViews(relationType: string, available: Set<ViewType>): ViewType[] {
    const targets: ViewType[] = []
    if (available.has('3d')) targets.push('3d')
    if ((relationType === 'link' || relationType === 'edge') && available.has('graph')) targets.push('graph')
    if (available.has('inspector')) targets.push('inspector')
    return dedupe(targets)
  }
}

function pushMap(map: Map<string, BindingEntry[]>, key: string, value: BindingEntry): void {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

function dedupe(values: ViewType[]): ViewType[] {
  return Array.from(new Set(values))
}
