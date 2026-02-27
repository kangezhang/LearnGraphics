import type { IView } from '@/views/IView'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'

export class InspectorView implements IView {
  readonly id = 'inspector'
  readonly type = 'inspector' as const

  private root: HTMLElement | null = null
  private graph: SemanticGraph | null = null
  private selectedIds: string[] = []

  mount(container: HTMLElement): void {
    this.root = document.createElement('div')
    this.root.className = 'inspector-root'
    container.appendChild(this.root)
    this.render([])
  }

  resize(_w: number, _h: number): void {}

  onSelectionChange(ids: string[]): void {
    this.selectedIds = [...ids]
    this.render(this.selectedIds)
  }

  loadGraph(graph: SemanticGraph): void {
    this.graph = graph
    this.render(this.selectedIds)
  }

  onTimelineTick(_time: number): void {
    this.render(this.selectedIds)
  }

  onGraphMutation(_changedEntityIds: string[]): void {
    this.render(this.selectedIds)
  }

  dispose(): void {
    this.root?.remove()
  }

  private render(ids: string[]): void {
    if (!this.root) return
    this.root.textContent = ''
    if (ids.length === 0 || !this.graph) {
      const empty = document.createElement('p')
      empty.className = 'inspector-empty'
      empty.textContent = 'Select a node to inspect'
      this.root.appendChild(empty)
      return
    }

    for (const id of ids) {
      const entity = this.graph.getEntity(id)
      if (!entity) continue

      const card = document.createElement('div')
      card.className = 'inspector-card'

      const idEl = document.createElement('div')
      idEl.className = 'inspector-id'
      idEl.textContent = entity.id

      const typeEl = document.createElement('div')
      typeEl.className = 'inspector-type'
      typeEl.textContent = entity.type

      const table = document.createElement('table')
      table.className = 'prop-table'

      for (const [key, rawValue] of Object.entries(entity.props)) {
        const tr = document.createElement('tr')
        const keyTd = document.createElement('td')
        keyTd.className = 'prop-key'
        keyTd.textContent = key
        const valTd = document.createElement('td')
        valTd.className = 'prop-val'
        valTd.textContent = formatPropValue(rawValue)
        tr.append(keyTd, valTd)
        table.appendChild(tr)
      }

      card.append(idEl, typeEl, table)
      this.root.appendChild(card)
    }
  }
}

function formatPropValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '[object]'
    }
  }
  return String(value)
}
