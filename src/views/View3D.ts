import { Scene, AmbientLight, DirectionalLight, Vector2, Vector3, Raycaster, Plane } from 'three'
import type { IView } from '@/views/IView'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import { RendererHost } from '@/core/renderer/RendererHost'
import { createOrbitControls } from '@/core/camera/orbitControls'
import { GizmoFactory } from '@/core/gizmos/GizmoFactory'
import type { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { BaseRelationGizmo } from '@/core/gizmos/relations/BaseRelationGizmo'
import { NodeGizmo } from '@/core/gizmos/entities/NodeGizmo'
import { evaluateScalarAt, parseScalarFieldParams } from '@/core/gizmos/fields/scalarFieldMath'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class View3D implements IView {
  readonly id = 'view3d'
  readonly type = '3d' as const

  private host: RendererHost | null = null
  private canvas: HTMLCanvasElement | null = null
  private scene = new Scene()
  private graph: SemanticGraph | null = null
  private gizmos = new Map<string, BaseGizmo | BaseRelationGizmo>()
  private factory = new GizmoFactory()
  private pointer = new Vector2()
  private raycaster = new Raycaster()
  private groundPlane = new Plane(new Vector3(0, 1, 0), 0)

  mount(container: HTMLElement): void {
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block'
    container.appendChild(canvas)
    this.canvas = canvas

    this.host = new RendererHost(canvas)
    this.host.setScene(this.scene)

    const ambient = new AmbientLight(0xffffff, 0.6)
    const dir = new DirectionalLight(0xffffff, 1.2)
    dir.position.set(5, 8, 5)
    this.scene.add(ambient, dir)

    const controls = createOrbitControls(this.host.getCamera(), canvas)
    this.host.setUpdate(() => controls.update())
    canvas.addEventListener('pointermove', this.onPointerMove)
    this.host.start()
  }

  resize(_w: number, _h: number): void {}

  onSelectionChange(ids: string[]): void {
    this.gizmos.forEach((gizmo, id) => gizmo.setSelected(ids.includes(id)))
  }

  loadGraph(graph: SemanticGraph): void {
    this.graph = graph

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

    this.refreshProbeSamples()
  }

  /** Update a node gizmo's color by entity id */
  setNodeColor(id: string, color: import('three').ColorRepresentation): void {
    const gizmo = this.gizmos.get(id)
    if (gizmo instanceof NodeGizmo) gizmo.setColor(color)
  }

  dispose(): void {
    this.canvas?.removeEventListener('pointermove', this.onPointerMove)
    this.gizmos.forEach(g => {
      g.getObjects().forEach(o => this.scene.remove(o))
      g.dispose()
    })
    this.gizmos.clear()
    this.host?.dispose()
    this.graph = null
    this.canvas = null
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.canvas || !this.host || !this.graph) return
    const probes = this.graph.allEntities().filter(entity => entity.type === 'sample_probe')
    if (probes.length === 0) return

    const rect = this.canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1
    const y = -(((event.clientY - rect.top) / Math.max(rect.height, 1)) * 2 - 1)
    this.pointer.set(x, y)
    this.raycaster.setFromCamera(this.pointer, this.host.getCamera())

    const hit = new Vector3()
    const intersected = this.raycaster.ray.intersectPlane(this.groundPlane, hit)
    if (!intersected) return

    this.updateProbeSamples(hit.x, hit.z, true)
  }

  private refreshProbeSamples(): void {
    if (!this.graph) return
    this.updateProbeSamples(0, 0, false)
  }

  private updateProbeSamples(worldX: number, worldZ: number, forceFollowMouse: boolean): void {
    if (!this.graph) return

    const scalarFields = this.graph
      .allEntities()
      .filter(entity => entity.type === 'scalar_field')
    const firstField = scalarFields[0]
    if (!firstField) return

    const fieldById = new Map(scalarFields.map(field => [field.id, field]))
    const probes = this.graph.allEntities().filter(entity => entity.type === 'sample_probe')

    for (const probe of probes) {
      const followMouse = forceFollowMouse
        ? toBool(probe.props.followMouse, true)
        : false

      const px = followMouse ? worldX : Number(probe.props.x ?? 0)
      const pz = followMouse ? worldZ : Number(probe.props.z ?? 0)
      const fieldId = typeof probe.props.fieldId === 'string' ? probe.props.fieldId : firstField.id
      const field = fieldById.get(fieldId) ?? firstField
      const value = evaluateScalarAt(parseScalarFieldParams(field.props), px, pz)

      probe.props = {
        ...probe.props,
        x: px,
        z: pz,
        value,
      }

      this.syncEntityGizmo(probe)
    }
  }

  private syncEntityGizmo(entity: SemanticEntity): void {
    const gizmo = this.gizmos.get(entity.id)
    if (!gizmo) return
    if (!('updateFromSemantic' in gizmo)) return
    ;(gizmo as BaseGizmo).updateFromSemantic(entity)
  }
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return fallback
}
