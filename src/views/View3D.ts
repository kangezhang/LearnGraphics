import { Scene, AmbientLight, DirectionalLight, Vector3 } from 'three'
import type { IView } from '@/views/IView'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import { RendererHost } from '@/core/renderer/RendererHost'
import { createOrbitControls } from '@/core/camera/orbitControls'
import { GizmoFactory } from '@/core/gizmos/GizmoFactory'
import type { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { BaseRelationGizmo } from '@/core/gizmos/relations/BaseRelationGizmo'
import { NodeGizmo } from '@/core/gizmos/entities/NodeGizmo'

export class View3D implements IView {
  readonly id = 'view3d'
  readonly type = '3d' as const

  private host: RendererHost | null = null
  private scene = new Scene()
  private gizmos = new Map<string, BaseGizmo | BaseRelationGizmo>()
  private factory = new GizmoFactory()

  mount(container: HTMLElement): void {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)

    this.host = new RendererHost(canvas)
    this.host.setScene(this.scene)

    const ambient = new AmbientLight(0xffffff, 0.6)
    const dir = new DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 8, 5)
    this.scene.add(ambient, dir)

    const controls = createOrbitControls(this.host.getCamera(), canvas)
    this.host.setUpdate(() => controls.update())
    this.host.start()
  }

  resize(_w: number, _h: number): void {}

  onSelectionChange(ids: string[]): void {
    this.gizmos.forEach((gizmo, id) => gizmo.setSelected(ids.includes(id)))
  }

  loadGraph(graph: SemanticGraph): void {
    // Clear existing gizmos
    this.gizmos.forEach(g => {
      g.getObjects().forEach(o => this.scene.remove(o))
      g.dispose()
    })
    this.gizmos.clear()

    // Layout nodes on a circle, inject positions into props
    const entities = graph.allEntities()
    const nodes = entities.filter(e => e.type === 'node')
    nodes.forEach((e, i) => {
      const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2
      e.props = { ...e.props, x: Math.cos(angle) * 2, y: 0, z: Math.sin(angle) * 2 }
    })

    // Create gizmos for all entities
    entities.forEach(e => {
      const gizmo = this.factory.createForEntity(e)
      if (!gizmo) return
      gizmo.getObjects().forEach(o => this.scene.add(o))
      this.gizmos.set(e.id, gizmo)
    })

    // Create gizmos for relations
    graph.allRelations().forEach(rel => {
      const src = graph.getEntity(rel.sourceId)
      const tgt = graph.getEntity(rel.targetId)
      if (!src || !tgt) return
      const sp = src.props as Record<string, number>
      const tp = tgt.props as Record<string, number>
      const srcPos = new Vector3(sp.x ?? 0, sp.y ?? 0, sp.z ?? 0)
      const tgtPos = new Vector3(tp.x ?? 0, tp.y ?? 0, tp.z ?? 0)
      const gizmo = this.factory.createForRelation(rel, srcPos, tgtPos)
      if (!gizmo) return
      gizmo.getObjects().forEach(o => this.scene.add(o))
      this.gizmos.set(rel.id, gizmo)
    })
  }

  /** Update a node gizmo's color by entity id */
  setNodeColor(id: string, color: import('three').ColorRepresentation): void {
    const gizmo = this.gizmos.get(id)
    if (gizmo instanceof NodeGizmo) gizmo.setColor(color)
  }

  dispose(): void {
    this.gizmos.forEach(g => {
      g.getObjects().forEach(o => this.scene.remove(o))
      g.dispose()
    })
    this.gizmos.clear()
    this.host?.dispose()
  }
}
