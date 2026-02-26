import type { IView } from '@/views/IView'
import type { SelectionStore } from '@/semantic/SelectionStore'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'

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

  loadGraph(graph: SemanticGraph): void {
    this.views.forEach(v => v.loadGraph(graph))
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

  resize(viewId: string, w: number, h: number): void {
    this.views.get(viewId)?.resize(w, h)
  }

  dispose(): void {
    this.unsubscribe?.()
    this.timelineUnsubscribe?.()
    this.views.forEach(v => v.dispose())
    this.views.clear()
  }
}
