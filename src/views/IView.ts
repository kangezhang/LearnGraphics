import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'

export interface IView {
  readonly id: string
  readonly type: '3d' | 'graph' | 'inspector' | 'plot'
  mount(container: HTMLElement): void
  resize(w: number, h: number): void
  onSelectionChange(ids: string[]): void
  loadGraph(graph: SemanticGraph): void
  loadTimeline?(runtime: TimelineRuntime | null): void
  onTimelineTick?(time: number): void
  dispose(): void
}
