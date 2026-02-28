import { SemanticGraph, type EntityType, type SemanticEntity, type SemanticRelation } from '@/semantic/model/SemanticGraph'
import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { fromDSLTimeline } from '@/dsl/timeline/TimelineDSL'
import { AnchorResolver } from '@/semantic/anchors/AnchorResolver'
import { BindingManager, type BindingRegistry } from '@/semantic/bindings/BindingManager'
import { DSLValidator, type ValidationError } from '@/semantic/validator/DSLValidator'
import type { DSLRelation, DSLEntity, LessonDSL } from '@/semantic/compiler/dslTypes'
import { resolveRelationEndpoints } from '@/semantic/compiler/dslTypes'
import type { IProcess } from '@/semantic/processes/IProcess'
import { BFSProcess, type BFSProcessConfig } from '@/semantic/processes/BFSProcess'
import {
  GradientDescentProcess,
  type GradientDescentProcessConfig,
} from '@/semantic/processes/GradientDescentProcess'
import {
  RayIntersectionProcess,
  type RayIntersectionProcessConfig,
} from '@/semantic/processes/RayIntersectionProcess'
import { ProcessTimelineBinder } from '@/semantic/processes/ProcessTimelineBinder'

export interface CompileResult {
  graph: SemanticGraph
  timeline: TimelineRuntime
  bindings: BindingRegistry
  diagnostics: ValidationError[]
  process?: IProcess
}

export class DSLCompiler {
  private validator = new DSLValidator()
  private anchorResolver = new AnchorResolver()
  private bindingManager = new BindingManager()

  compile(dsl: LessonDSL): CompileResult {
    const diagnostics = this.validator.validate(dsl)

    const graph = this.buildGraph(dsl)
    const timeline = this.buildTimeline(dsl)
    const process = this.buildProcess(dsl, graph)
    if (process) ProcessTimelineBinder.bind(timeline, process)
    const bindings = this.bindingManager.build(dsl, graph)
    return {
      graph,
      timeline,
      bindings,
      diagnostics,
      process: process ?? undefined,
    }
  }

  private buildGraph(dsl: LessonDSL): SemanticGraph {
    const graph = new SemanticGraph()
    const entities = dsl.entities ?? []
    const relations = dsl.relations ?? []
    const entityMap = new Map(entities.map(e => [e.id, e]))

    entities.forEach(entity => {
      const compiled = this.compileEntity(entity, entityMap)
      if (compiled) graph.addEntity(compiled)
    })

    relations.forEach(relation => {
      const compiled = this.compileRelation(relation)
      if (compiled) graph.addRelation(compiled)
    })
    return graph
  }

  private buildTimeline(dsl: LessonDSL): TimelineRuntime {
    const duration = dsl.timeline?.duration ?? 10
    const loop = dsl.timeline?.loop ?? false
    const speed = dsl.timeline?.speed ?? 1
    const runtime = new TimelineRuntime({
      duration,
      loop,
      speed,
      markers: dsl.timeline?.markers,
    })

    if (dsl.timeline) {
      const serialized = fromDSLTimeline(dsl.timeline)
      runtime.applySerialized(serialized)
    }
    return runtime
  }

  private buildProcess(dsl: LessonDSL, graph: SemanticGraph): IProcess | null {
    if (!dsl.process) return null

    switch (dsl.process.type) {
      case 'bfs':
        return this.buildBFSProcess(dsl, graph)
      case 'gradient_descent':
        return this.buildGradientDescentProcess(dsl, graph)
      case 'gradient-descent':
      case 'gd':
        console.warn(`[DSL] process.type "${dsl.process.type}" is deprecated, use "gradient_descent" instead.`)
        return this.buildGradientDescentProcess(dsl, graph)
      case 'ray_intersection':
        return this.buildRayIntersectionProcess(dsl, graph)
      case 'ray-intersection':
      case 'ray_hit':
      case 'ray-hit':
        console.warn(`[DSL] process.type "${dsl.process.type}" is deprecated, use "ray_intersection" instead.`)
        return this.buildRayIntersectionProcess(dsl, graph)
      default:
        return null
    }
  }

  private buildBFSProcess(dsl: LessonDSL, graph: SemanticGraph): IProcess | null {
    if (!dsl.process) return null
    const processId = dsl.process.id ?? dsl.process.type
    const config = dsl.process.config ?? {}

    const defaultNodeIds = graph
      .allEntities()
      .filter(entity => entity.type === 'node')
      .map(entity => entity.id)

    const startNodeId = this.toNonEmptyString(config.startNodeId) ?? defaultNodeIds[0]
    if (!startNodeId) return null

    const bfsConfig: BFSProcessConfig = {
      startNodeId,
      targetNodeId: this.toNonEmptyString(config.targetNodeId),
      adjacency: this.parseAdjacency(config.adjacency) ?? this.buildAdjacencyFromGraph(graph),
    }

    const process = new BFSProcess(processId)
    process.init(bfsConfig)
    return process
  }

  private buildGradientDescentProcess(dsl: LessonDSL, graph: SemanticGraph): IProcess | null {
    if (!dsl.process) return null
    const processId = dsl.process.id ?? dsl.process.type
    const config = dsl.process.config ?? {}

    const pointEntityId =
      this.toNonEmptyString(config.pointEntityId) ??
      graph.allEntities().find(entity => entity.type === 'marker')?.id

    const pointEntity = pointEntityId ? graph.getEntity(pointEntityId) : undefined
    const fallbackStartPoint: [number, number] = [
      this.toFiniteNumber(pointEntity?.props.x) ?? 0,
      this.toFiniteNumber(pointEntity?.props.y) ?? 0,
    ]

    const gdConfig: GradientDescentProcessConfig = {
      startPoint: this.parsePoint2(config.startPoint) ?? fallbackStartPoint,
      learningRate: this.toFiniteNumber(config.learningRate) ?? 0.2,
      maxIterations: Math.max(1, Math.floor(this.toFiniteNumber(config.maxIterations) ?? this.inferStepCount(dsl, processId, 32))),
      epsilon: Math.max(1e-10, this.toFiniteNumber(config.epsilon) ?? 1e-3),
      pointEntityId,
      coefficients: this.parseQuadraticCoefficients(config.coefficients),
    }

    const process = new GradientDescentProcess(processId)
    process.init(gdConfig)
    return process
  }

  private buildRayIntersectionProcess(dsl: LessonDSL, graph: SemanticGraph): IProcess | null {
    if (!dsl.process) return null
    const processId = dsl.process.id ?? dsl.process.type
    const config = dsl.process.config ?? {}

    const rayEntityId =
      this.toNonEmptyString(config.rayEntityId) ??
      graph.allEntities().find(entity => entity.type === 'arrow')?.id
    const hitEntityId =
      this.toNonEmptyString(config.hitEntityId) ??
      graph.allEntities().find(entity => entity.type === 'marker')?.id

    const rayEntity = rayEntityId ? graph.getEntity(rayEntityId) : undefined
    const originFromEntity: [number, number, number] = [
      this.toFiniteNumber(rayEntity?.props.x) ?? 0,
      this.toFiniteNumber(rayEntity?.props.y) ?? 0,
      this.toFiniteNumber(rayEntity?.props.z) ?? 0,
    ]
    const directionFromEntity: [number, number, number] = [
      this.toFiniteNumber(rayEntity?.props.dx) ?? 1,
      this.toFiniteNumber(rayEntity?.props.dy) ?? -0.5,
      this.toFiniteNumber(rayEntity?.props.dz) ?? 0,
    ]

    const rayConfig: RayIntersectionProcessConfig = {
      origin: this.parsePoint3(config.origin) ?? originFromEntity,
      direction: this.parsePoint3(config.direction) ?? directionFromEntity,
      planeNormal: this.parsePoint3(config.planeNormal) ?? [0, 1, 0],
      planeOffset: this.toFiniteNumber(config.planeOffset) ?? 0,
      maxSteps: Math.max(1, Math.floor(this.toFiniteNumber(config.maxSteps) ?? this.inferStepCount(dsl, processId, 20))),
      maxDistance: Math.max(0.001, this.toFiniteNumber(config.maxDistance) ?? 10),
      rayEntityId,
      hitEntityId,
    }

    const process = new RayIntersectionProcess(processId)
    process.init(rayConfig)
    return process
  }

  private buildAdjacencyFromGraph(graph: SemanticGraph): Record<string, string[]> {
    const adjacency: Record<string, string[]> = {}

    for (const entity of graph.allEntities()) {
      if (entity.type === 'node') adjacency[entity.id] = []
    }

    for (const relation of graph.allRelations()) {
      if (relation.type !== 'link') continue
      if (!adjacency[relation.sourceId]) adjacency[relation.sourceId] = []
      adjacency[relation.sourceId].push(relation.targetId)
      if (!adjacency[relation.targetId]) adjacency[relation.targetId] = []
    }

    for (const nodeId of Object.keys(adjacency)) {
      adjacency[nodeId] = Array.from(new Set(adjacency[nodeId]))
    }

    return adjacency
  }

  private parseAdjacency(raw: unknown): Record<string, string[]> | null {
    if (typeof raw !== 'object' || raw === null) return null

    const adjacency: Record<string, string[]> = {}
    for (const [nodeId, neighborsRaw] of Object.entries(raw as Record<string, unknown>)) {
      if (!Array.isArray(neighborsRaw)) continue
      adjacency[nodeId] = neighborsRaw
        .map(item => (typeof item === 'string' ? item.trim() : ''))
        .filter((value): value is string => value.length > 0)
    }
    return Object.keys(adjacency).length > 0 ? adjacency : null
  }

  private parsePoint2(raw: unknown): [number, number] | null {
    if (!Array.isArray(raw) || raw.length < 2) return null
    const x = this.toFiniteNumber(raw[0])
    const y = this.toFiniteNumber(raw[1])
    if (x === undefined || y === undefined) return null
    return [x, y]
  }

  private parsePoint3(raw: unknown): [number, number, number] | null {
    if (!Array.isArray(raw) || raw.length < 3) return null
    const x = this.toFiniteNumber(raw[0])
    const y = this.toFiniteNumber(raw[1])
    const z = this.toFiniteNumber(raw[2])
    if (x === undefined || y === undefined || z === undefined) return null
    return [x, y, z]
  }

  private parseQuadraticCoefficients(raw: unknown): GradientDescentProcessConfig['coefficients'] {
    if (typeof raw !== 'object' || raw === null) return undefined
    const record = raw as Record<string, unknown>
    return {
      a: this.toFiniteNumber(record.a),
      b: this.toFiniteNumber(record.b),
      c: this.toFiniteNumber(record.c),
      d: this.toFiniteNumber(record.d),
      e: this.toFiniteNumber(record.e),
      f: this.toFiniteNumber(record.f),
    }
  }

  private inferStepCount(dsl: LessonDSL, processId: string, fallback: number): number {
    const tracks = dsl.timeline?.tracks ?? []
    for (const track of tracks) {
      if ((track.type === 'step' || track.type === 'state') && (track.processId === processId || !track.processId)) {
        if (track.type === 'step' && track.steps.length > 0) return track.steps.length
        if (track.type === 'state' && track.states.length > 0) return track.states.length
      }
    }
    return fallback
  }

  private toFiniteNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : undefined
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    return undefined
  }

  private toNonEmptyString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  private compileEntity(entity: DSLEntity, entityMap: Map<string, DSLEntity>): SemanticEntity | null {
    const mappedType = this.mapEntityType(entity.type)
    if (!mappedType) return null

    const props: Record<string, unknown> = { ...(entity.props ?? {}) }
    const reserved = new Set(['id', 'type', 'anchor', 'position', 'direction', 'label', 'color', 'props'])

    for (const [key, value] of Object.entries(entity)) {
      if (reserved.has(key)) continue
      if (props[key] === undefined) props[key] = value
    }

    if (entity.label !== undefined) props.label = entity.label
    if (entity.color !== undefined) props.color = entity.color
    if (entity.type === 'surface_field' && props.mode === undefined) {
      props.mode = 'surface'
    }

    if (Array.isArray(entity.position) && entity.position.length >= 3) {
      props.x = Number(entity.position[0] ?? 0)
      props.y = Number(entity.position[1] ?? 0)
      props.z = Number(entity.position[2] ?? 0)
    } else if (entity.anchor !== undefined) {
      const pos = this.anchorResolver.resolve(entity.anchor, { entityMap })
      props.x = pos.x
      props.y = pos.y
      props.z = pos.z
    }

    if (Array.isArray(entity.direction) && entity.direction.length >= 3) {
      props.dx = Number(entity.direction[0] ?? 0)
      props.dy = Number(entity.direction[1] ?? 0)
      props.dz = Number(entity.direction[2] ?? 0)
    }

    return {
      id: entity.id,
      type: mappedType,
      props,
    }
  }

  private compileRelation(relation: DSLRelation): SemanticRelation | null {
    const endpoints = resolveRelationEndpoints(relation)
    if (!endpoints) return null
    if (relation.from !== undefined || relation.to !== undefined) {
      console.warn(`[DSL] relation "${relation.id}": fields "from"/"to" are deprecated, use "source"/"target" instead.`)
    }
    if (relation.vectorA !== undefined || relation.vectorB !== undefined) {
      console.warn(`[DSL] relation "${relation.id}": fields "vectorA"/"vectorB" are deprecated, use "source"/"target" instead.`)
    }
    if (relation.sourceId !== undefined || relation.targetId !== undefined) {
      console.warn(`[DSL] relation "${relation.id}": fields "sourceId"/"targetId" are deprecated, use "source"/"target" instead.`)
    }
    return {
      id: relation.id,
      type: this.mapRelationType(relation.type),
      sourceId: endpoints.sourceId,
      targetId: endpoints.targetId,
      props: { ...(relation.props ?? {}) },
    }
  }

  private mapEntityType(type: string): EntityType | null {
    switch (type) {
      case 'node':
      case 'point':
      case 'line':
      case 'plane':
      case 'model':
      case 'arrow':
      case 'symbol':
      case 'label':
      case 'marker':
      case 'badge':
      case 'step_sequence':
      case 'state_overlay':
      case 'trace_trail':
      case 'scalar_field':
      case 'surface_field':
      case 'vector_field':
      case 'sample_probe':
        return type
      default:
        return null
    }
  }

  private mapRelationType(type: string): string {
    switch (type) {
      case 'edge':
      case 'link':
      case 'constraintEdge':
      case 'constraint_edge':
        return 'link'
      case 'measureDistance':
      case 'measure_distance':
        return 'measure_distance'
      case 'measureAngle':
      case 'measure_angle':
        return 'measure_angle'
      case 'projectionHelper':
      case 'projection':
        return 'projection'
      case 'intersectionMarker':
      case 'intersection':
        return 'intersection'
      default:
        return type
    }
  }
}
