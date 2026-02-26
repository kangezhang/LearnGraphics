import type { IView } from '@/views/IView'
import type { SelectionStore } from '@/semantic/SelectionStore'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'

export class ViewManager {
  private views = new Map<string, IView>()
  private unsubscribe: (() => void) | null = null

  constructor(selection: SelectionStore) {
    this.unsubscribe = selection.on(ids => {
      this.views.forEach(v => v.onSelectionChange(ids))
    })
  }

  register(view: IView, container: HTMLElement): void {
    view.mount(container)
    this.views.set(view.id, view)
  }

  loadGraph(graph: SemanticGraph): void {
    this.views.forEach(v => v.loadGraph(graph))
  }

  resize(viewId: string, w: number, h: number): void {
    this.views.get(viewId)?.resize(w, h)
  }

  dispose(): void {
    this.unsubscribe?.()
    this.views.forEach(v => v.dispose())
    this.views.clear()
  }
}
