import type { IView } from '@/views/IView'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'

export class InspectorView implements IView {
  readonly id = 'inspector'
  readonly type = 'inspector' as const

  private root: HTMLElement | null = null
  private graph: SemanticGraph | null = null

  mount(container: HTMLElement): void {
    this.root = document.createElement('div')
    this.root.className = 'inspector-root'
    container.appendChild(this.root)
    this.render([])
  }

  resize(_w: number, _h: number): void {}

  onSelectionChange(ids: string[]): void {
    this.render(ids)
  }

  loadGraph(graph: SemanticGraph): void {
    this.graph = graph
    this.render([])
  }

  dispose(): void {
    this.root?.remove()
  }

  private render(ids: string[]): void {
    if (!this.root) return
    if (ids.length === 0 || !this.graph) {
      this.root.innerHTML = '<p class="inspector-empty">Select a node to inspect</p>'
      return
    }

    const html = ids.map(id => {
      const entity = this.graph!.getEntity(id)
      if (!entity) return ''
      const rows = Object.entries(entity.props)
        .map(([k, v]) => `<tr><td class="prop-key">${k}</td><td class="prop-val">${v}</td></tr>`)
        .join('')
      return `
        <div class="inspector-card">
          <div class="inspector-id">${entity.id}</div>
          <div class="inspector-type">${entity.type}</div>
          <table class="prop-table">${rows}</table>
        </div>`
    }).join('')

    this.root.innerHTML = html
  }
}
