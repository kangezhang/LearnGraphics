import type { SemanticGraph } from '@/semantic/model/SemanticGraph'

export interface IView {
  readonly id: string
  readonly type: '3d' | 'graph' | 'inspector'
  mount(container: HTMLElement): void
  resize(w: number, h: number): void
  onSelectionChange(ids: string[]): void
  loadGraph(graph: SemanticGraph): void
  dispose(): void
}
