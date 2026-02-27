import type { IView } from '@/views/IView'
import type { SemanticGraph, SemanticEntity, SemanticRelation } from '@/semantic/model/SemanticGraph'

interface NodeLayout {
  entity: SemanticEntity
  x: number
  y: number
}

export class GraphView implements IView {
  readonly id = 'graphview'
  readonly type = 'graph' as const

  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private nodes: NodeLayout[] = []
  private relations: SemanticRelation[] = []
  private selected = new Set<string>()
  private graph: SemanticGraph | null = null

  mount(container: HTMLElement): void {
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')
    this.resize(container.clientWidth, container.clientHeight)
    this.canvas.addEventListener('click', this.onClick)
  }

  resize(w: number, h: number): void {
    if (!this.canvas) return
    this.canvas.width = w
    this.canvas.height = h
    if (this.graph) this.layout(w, h)
    this.draw()
  }

  onSelectionChange(ids: string[]): void {
    this.selected = new Set(ids)
    this.draw()
  }

  onTimelineTick(_time: number): void {
    this.draw()
  }

  loadGraph(graph: SemanticGraph): void {
    this.graph = graph
    this.relations = graph.allRelations()
    const w = this.canvas?.width ?? 400
    const h = this.canvas?.height ?? 300
    this.layout(w, h)
    this.draw()
  }

  dispose(): void {
    this.canvas?.removeEventListener('click', this.onClick)
  }

  private layout(w: number, h: number): void {
    if (!this.graph) return
    const entities = this.graph.allEntities().filter(e => e.type === 'node')
    const cx = w / 2, cy = h / 2
    const r = Math.min(w, h) * 0.35
    this.nodes = entities.map((e, i) => {
      const angle = (i / Math.max(entities.length, 1)) * Math.PI * 2 - Math.PI / 2
      return { entity: e, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r }
    })
  }

  private draw(): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#0f1116'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const nodeMap = new Map(this.nodes.map(n => [n.entity.id, n]))

    // draw edges
    ctx.strokeStyle = '#4a5568'
    ctx.lineWidth = 1.5
    for (const rel of this.relations) {
      const src = nodeMap.get(rel.sourceId)
      const tgt = nodeMap.get(rel.targetId)
      if (!src || !tgt) continue
      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.stroke()
    }

    // draw nodes
    for (const n of this.nodes) {
      const sel = this.selected.has(n.entity.id)
      ctx.beginPath()
      ctx.arc(n.x, n.y, 14, 0, Math.PI * 2)
      ctx.fillStyle = sel ? '#4488ff' : '#3a7bd5'
      ctx.fill()
      if (sel) {
        ctx.strokeStyle = '#88bbff'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      const label = String(n.entity.props.label ?? n.entity.id)
      ctx.fillStyle = '#e2e8f0'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(label, n.x, n.y + 26)
    }
  }

  private onClick = (e: MouseEvent): void => {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    for (const n of this.nodes) {
      const dx = mx - n.x, dy = my - n.y
      if (dx * dx + dy * dy <= 14 * 14) {
        // dispatch custom event so Shell can forward to SelectionStore
        this.canvas.dispatchEvent(new CustomEvent('entity-click', {
          bubbles: true,
          detail: { id: n.entity.id }
        }))
        return
      }
    }
  }
}
