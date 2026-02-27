import type { IView } from '@/views/IView'
import type { SelectionStore } from '@/semantic/SelectionStore'
import { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import type { BindingRegistry } from '@/semantic/bindings/BindingManager'

export class ViewManager {
  private views = new Map<string, IView>()
  private unsubscribe: (() => void) | null = null
  private timelineUnsubscribe: (() => void) | null = null
  private timeline: TimelineRuntime | null = null

  constructor(selection: SelectionStore) {
    this.unsubscribe = selection.on(ids => {
      this.views.forEach(v => v.onSelectionChange(ids))
    })
  }

  register(view: IView, container: HTMLElement): void {
    view.mount(container)
    this.views.set(view.id, view)
    if (this.timeline) {
      view.loadTimeline?.(this.timeline)
      view.onTimelineTick?.(this.timeline.time)
    }
  }

  loadGraph(graph: SemanticGraph, bindings?: BindingRegistry): void {
    if (!bindings) {
      this.views.forEach(v => v.loadGraph(graph))
      return
    }

    this.views.forEach(view => {
      view.loadGraph(this.buildScopedGraph(graph, bindings, view.type))
    })
  }

  loadTimeline(timeline: TimelineRuntime | null): void {
    this.timelineUnsubscribe?.()
    this.timelineUnsubscribe = null
    this.timeline = timeline

    this.views.forEach(view => view.loadTimeline?.(timeline))
    if (!timeline) {
      this.views.forEach(view => view.onTimelineTick?.(0))
      return
    }

    this.views.forEach(view => view.onTimelineTick?.(timeline.time))
    this.timelineUnsubscribe = timeline.on({
      type: 'tick',
      handler: (time) => {
        this.views.forEach(view => view.onTimelineTick?.(time))
      },
    })
  }

  notifyGraphMutation(changedEntityIds: string[]): void {
    if (changedEntityIds.length === 0) return
    this.views.forEach(view => view.onGraphMutation?.(changedEntityIds))
  }

  resize(viewId: string, w: number, h: number): void {
    this.views.get(viewId)?.resize(w, h)
  }

  dispose(): void {
    this.unsubscribe?.()
    this.timelineUnsubscribe?.()
    this.views.forEach(v => v.dispose())
    this.views.clear()
  }

  private buildScopedGraph(
    graph: SemanticGraph,
    bindings: BindingRegistry,
    viewType: IView['type']
  ): SemanticGraph {
    const scoped = new SemanticGraph()
    const includedEntityIds = new Set<string>()

    for (const entity of graph.allEntities()) {
      if (!this.isEntityVisible(entity.id, bindings, viewType)) continue
      scoped.addEntity(entity)
      includedEntityIds.add(entity.id)
    }

    for (const relation of graph.allRelations()) {
      if (!this.isRelationVisible(relation.id, bindings, viewType)) continue

      const source = graph.getEntity(relation.sourceId)
      const target = graph.getEntity(relation.targetId)
      if (source && !includedEntityIds.has(source.id)) {
        scoped.addEntity(source)
        includedEntityIds.add(source.id)
      }
      if (target && !includedEntityIds.has(target.id)) {
        scoped.addEntity(target)
        includedEntityIds.add(target.id)
      }
      if (includedEntityIds.has(relation.sourceId) && includedEntityIds.has(relation.targetId)) {
        scoped.addRelation(relation)
      }
    }

    return scoped
  }

  private isEntityVisible(entityId: string, bindings: BindingRegistry, viewType: IView['type']): boolean {
    const entries = bindings.bySemanticId.get(entityId) ?? []
    return entries.some(entry => (
      entry.semanticKind === 'entity'
      && entry.semanticId === entityId
      && entry.viewTypes.includes(viewType)
    ))
  }

  private isRelationVisible(relationId: string, bindings: BindingRegistry, viewType: IView['type']): boolean {
    const entries = bindings.bySemanticId.get(relationId) ?? []
    return entries.some(entry => (
      entry.semanticKind === 'relation'
      && entry.semanticId === relationId
      && entry.viewTypes.includes(viewType)
    ))
  }
}
