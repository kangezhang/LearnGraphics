import {
  Scene,
  AmbientLight,
  DirectionalLight,
  Vector2,
  Vector3,
  Raycaster,
  Plane,
  Group,
  AxesHelper,
  GridHelper,
  Material,
  LineBasicMaterial,
} from 'three'
import type { IView } from '@/views/IView'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import { RendererHost } from '@/core/renderer/RendererHost'
import { createOrbitControls } from '@/core/camera/orbitControls'
import { GizmoFactory } from '@/core/gizmos/GizmoFactory'
import type { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { BaseRelationGizmo } from '@/core/gizmos/relations/BaseRelationGizmo'
import { NodeGizmo } from '@/core/gizmos/entities/NodeGizmo'
import { evaluateScalarAt, parseScalarFieldParams } from '@/core/gizmos/fields/scalarFieldMath'
import { evaluateVectorAt, parseVectorFieldParams } from '@/core/gizmos/fields/vectorFieldMath'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'

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
  private timeline: TimelineRuntime | null = null
  private coordinateFrameGroup = new Group()
  private coordinateFrameVisible = true

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
    this.buildCoordinateFrame()
    this.scene.add(this.coordinateFrameGroup)
    this.coordinateFrameGroup.visible = this.coordinateFrameVisible

    const controls = createOrbitControls(this.host.getCamera(), canvas)
    this.host.setUpdate(() => controls.update())
    canvas.addEventListener('pointermove', this.onPointerMove)
    this.host.start()
  }

  resize(w: number, h: number): void {
    this.host?.resize(w, h)
  }

  onSelectionChange(ids: string[]): void {
    this.gizmos.forEach((gizmo, id) => gizmo.setSelected(ids.includes(id)))
  }

  loadTimeline(runtime: TimelineRuntime | null): void {
    this.timeline = runtime
  }

  onTimelineTick(time: number): void {
    if (!this.timeline || !this.graph) return
    const evalResult = this.timeline.evaluateAt(time)
    const changedEntityIds = new Set<string>()

    for (const prop of evalResult.properties) {
      const entity = this.graph.getEntity(prop.targetId)
      if (!entity) continue
      setPathValue(entity.props, prop.propName, prop.value)
      applySemanticProperty(entity, prop.propName, prop.value)
      changedEntityIds.add(entity.id)
    }

    this.applyEntityChanges(changedEntityIds)
  }

  onGraphMutation(changedEntityIds: string[]): void {
    this.applyEntityChanges(new Set(changedEntityIds))
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

  refreshAllVisuals(): void {
    if (!this.graph) return
    const changedEntityIds = new Set(this.graph.allEntities().map(entity => entity.id))
    this.applyEntityChanges(changedEntityIds)
  }

  setCoordinateFrameVisible(visible: boolean): void {
    this.coordinateFrameVisible = visible
    this.coordinateFrameGroup.visible = visible
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
      .filter(entity => entity.type === 'scalar_field' || entity.type === 'surface_field')
    const vectorFields = this.graph
      .allEntities()
      .filter(entity => entity.type === 'vector_field')
    const firstScalarField = scalarFields[0]
    const firstVectorField = vectorFields[0]
    if (!firstScalarField && !firstVectorField) return

    const scalarById = new Map(scalarFields.map(field => [field.id, field]))
    const vectorById = new Map(vectorFields.map(field => [field.id, field]))
    const probes = this.graph.allEntities().filter(entity => entity.type === 'sample_probe')

    for (const probe of probes) {
      const followMouse = forceFollowMouse
        ? toBool(probe.props.followMouse, true)
        : false

      const px = followMouse ? worldX : Number(probe.props.x ?? 0)
      const pz = followMouse ? worldZ : Number(probe.props.z ?? 0)
      const fieldId = typeof probe.props.fieldId === 'string' ? probe.props.fieldId : undefined
      const scalarField = fieldId ? scalarById.get(fieldId) : undefined
      const vectorField = fieldId ? vectorById.get(fieldId) : undefined

      let value = 0
      let vx = 0
      let vz = 0

      if (scalarField || (!vectorField && firstScalarField)) {
        const field = scalarField ?? firstScalarField
        if (!field) continue
        value = evaluateScalarAt(parseScalarFieldParams(field.props), px, pz)
      } else {
        const field = vectorField ?? firstVectorField
        if (!field) continue
        const sample = evaluateVectorAt(parseVectorFieldParams(field.props), px, pz)
        value = sample.magnitude
        vx = sample.vx
        vz = sample.vz
      }

      probe.props = {
        ...probe.props,
        x: px,
        z: pz,
        value,
        vx,
        vz,
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

  private syncRelationGizmos(changedEntityIds: Set<string>): void {
    if (!this.graph) return

    for (const relation of this.graph.allRelations()) {
      if (!changedEntityIds.has(relation.sourceId) && !changedEntityIds.has(relation.targetId)) continue
      const source = this.graph.getEntity(relation.sourceId)
      const target = this.graph.getEntity(relation.targetId)
      if (!source || !target) continue

      const sourcePos = toVector3(source.props)
      const targetPos = toVector3(target.props)
      const gizmo = this.gizmos.get(relation.id)
      if (!gizmo) continue

      if ('update' in gizmo && typeof (gizmo as { update?: unknown }).update === 'function') {
        ;(gizmo as {
          update: (relation: import('@/semantic/model/SemanticGraph').SemanticRelation, sourcePos: Vector3, targetPos: Vector3) => void
        }).update(relation, sourcePos, targetPos)
        continue
      }

      if (relation.type === 'link' && 'updateFromSemantic' in gizmo) {
        const linkEntity: SemanticEntity = {
          id: relation.id,
          type: 'node',
          props: {
            x0: sourcePos.x, y0: sourcePos.y, z0: sourcePos.z,
            x1: targetPos.x, y1: targetPos.y, z1: targetPos.z,
          },
        }
        ;(gizmo as BaseGizmo).updateFromSemantic(linkEntity)
      }
    }
  }

  private applyEntityChanges(changedEntityIds: Set<string>): void {
    if (!this.graph || changedEntityIds.size === 0) return

    for (const entityId of changedEntityIds) {
      const entity = this.graph.getEntity(entityId)
      if (!entity) continue
      this.syncEntityGizmo(entity)
    }
    this.syncRelationGizmos(changedEntityIds)
  }

  private buildCoordinateFrame(): void {
    this.coordinateFrameGroup.clear()

    // Keep the world frame visible but subdued so it does not compete with lesson gizmos.
    const axes = new AxesHelper(1.6)
    axes.renderOrder = 1
    axes.position.set(0, 0.001, 0)
    const axesMaterials = Array.isArray(axes.material)
      ? axes.material
      : [axes.material]
    for (const mat of axesMaterials) {
      const axisMat = mat as LineBasicMaterial & { opacity?: number; transparent?: boolean; depthWrite?: boolean }
      axisMat.transparent = true
      axisMat.opacity = 0.34
      axisMat.depthWrite = false
      axisMat.color.multiplyScalar(0.72)
    }
    this.coordinateFrameGroup.add(axes)

    const grid = new GridHelper(8, 8, 0x2a3855, 0x1a2335)
    grid.position.set(0, -0.001, 0)
    grid.renderOrder = 0
    const materials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material]
    for (const mat of materials) {
      const transparentMat = mat as Material & { opacity?: number; transparent?: boolean; depthWrite?: boolean }
      transparentMat.transparent = true
      transparentMat.opacity = 0.2
      transparentMat.depthWrite = false
    }
    this.coordinateFrameGroup.add(grid)
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

function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').map(segment => segment.trim()).filter(Boolean)
  if (parts.length === 0) return

  let current: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const next = current[key]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

function toVector3(props: Record<string, unknown>): Vector3 {
  return new Vector3(
    Number(props.x ?? 0),
    Number(props.y ?? 0),
    Number(props.z ?? 0)
  )
}

function applySemanticProperty(entity: SemanticEntity, path: string, value: unknown): void {
  if (entity.type === 'arrow' && path === 'rotation.z') {
    const angle = Number(value)
    if (!Number.isFinite(angle)) return

    const props = entity.props
    const rawBase = props.baseDirection
    const base = Array.isArray(rawBase) && rawBase.length >= 3
      ? [Number(rawBase[0]), Number(rawBase[1]), Number(rawBase[2])]
      : [Number(props.dx ?? 1), Number(props.dy ?? 0), Number(props.dz ?? 0)]
    props.baseDirection = base

    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    props.dx = base[0] * cos - base[1] * sin
    props.dy = base[0] * sin + base[1] * cos
    props.dz = base[2]
  }
}
