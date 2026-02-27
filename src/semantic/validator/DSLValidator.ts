import type { DSLEntity, DSLRelation, LessonDSL } from '@/semantic/compiler/dslTypes'
import { resolveRelationEndpoints } from '@/semantic/compiler/dslTypes'

export interface ValidationError {
  type: 'error' | 'warning'
  code: 'MISSING_REFERENCE' | 'INVALID_ANCHOR' | 'TYPE_MISMATCH' | 'CIRCULAR_DEPENDENCY' | 'INVALID_SCHEMA'
  message: string
  location: string
  suggestion?: string
}

const ANCHOR_FUNCTIONS = new Set(['center', 'camera', 'intersection', 'closest_point', 'project'])
const ENTITY_TYPES = new Set([
  'node',
  'edge',
  'point',
  'line',
  'plane',
  'model',
  'arrow',
  'symbol',
  'label',
  'marker',
  'badge',
  'step_sequence',
  'state_overlay',
  'trace_trail',
  'scalar_field',
  'surface_field',
  'vector_field',
  'sample_probe',
])

export class DSLValidator {
  validate(dsl: LessonDSL): ValidationError[] {
    const errors: ValidationError[] = []
    const entities = dsl.entities ?? []
    const relations = dsl.relations ?? []
    const entityMap = new Map<string, DSLEntity>()
    const entityIds = new Set(entities.map(entity => entity.id))

    if (!dsl.meta || !dsl.meta.id || !dsl.meta.title) {
      errors.push({
        type: 'error',
        code: 'INVALID_SCHEMA',
        message: 'meta.id and meta.title are required.',
        location: 'meta',
        suggestion: 'Provide non-empty strings for meta.id and meta.title.',
      })
    }

    entities.forEach((entity, i) => {
      if (!ENTITY_TYPES.has(entity.type)) {
        errors.push({
          type: 'error',
          code: 'INVALID_SCHEMA',
          message: `Unknown entity type "${entity.type}".`,
          location: `entities[${i}].type`,
          suggestion: `Use one of: ${Array.from(ENTITY_TYPES).join(', ')}.`,
        })
      }
      if (entityMap.has(entity.id)) {
        errors.push({
          type: 'error',
          code: 'INVALID_SCHEMA',
          message: `Duplicate entity id "${entity.id}".`,
          location: `entities[${i}].id`,
          suggestion: 'Use unique IDs for all entities.',
        })
      } else {
        entityMap.set(entity.id, entity)
      }
      this.validateAnchor(entity.anchor, `entities[${i}].anchor`, entityIds, errors)
      this.validateAnchor(entity.direction, `entities[${i}].direction`, entityIds, errors)
    })

    relations.forEach((rel, i) => this.validateRelation(rel, i, entityMap, errors))
    this.validateCycles(entities, errors)
    return errors
  }

  private validateAnchor(
    anchor: unknown,
    location: string,
    entityIds: Set<string>,
    errors: ValidationError[]
  ): void {
    if (typeof anchor !== 'string') return
    const text = anchor.trim()
    if (text.length === 0) return
    if (ANCHOR_FUNCTIONS.has(text)) return

    const call = parseCall(text)
    if (call) {
      if (!ANCHOR_FUNCTIONS.has(call.name)) {
        errors.push({
          type: 'error',
          code: 'INVALID_ANCHOR',
          message: `Unknown anchor function: "${call.name}".`,
          location,
          suggestion: 'Available functions: center, camera, intersection, closest_point, project.',
        })
        return
      }

      const expectedArgs = expectedAnchorArity(call.name)
      if (expectedArgs > 0 && call.args.length !== expectedArgs) {
        errors.push({
          type: 'error',
          code: 'INVALID_ANCHOR',
          message: `Anchor function "${call.name}" expects ${expectedArgs} arguments, got ${call.args.length}.`,
          location,
          suggestion: `Use "${call.name}(${new Array(expectedArgs).fill('...').join(', ')})".`,
        })
      }

      for (const arg of call.args) {
        if (looksLikeId(arg) && !entityIds.has(arg)) {
          errors.push({
            type: 'error',
            code: 'INVALID_ANCHOR',
            message: `Unknown anchor reference "${arg}".`,
            location,
            suggestion: `Available entities: ${Array.from(entityIds).join(', ') || '(none)'}`,
          })
        }
      }
      return
    }

    if (looksLikeId(text)) {
      if (entityIds.has(text)) return
      errors.push({
        type: 'error',
        code: 'INVALID_ANCHOR',
        message: `Unknown anchor reference "${text}".`,
        location,
        suggestion: `Available entities: ${Array.from(entityIds).join(', ') || '(none)'}`,
      })
      return
    }

    errors.push({
      type: 'error',
      code: 'INVALID_ANCHOR',
      message: `Malformed anchor expression: "${text}".`,
      location,
      suggestion: 'Use center/camera, entity id, or function calls like project(a, b).',
    })
  }

  private validateRelation(
    relation: DSLRelation,
    index: number,
    entityMap: Map<string, DSLEntity>,
    errors: ValidationError[]
  ): void {
    const endpoints = resolveRelationEndpoints(relation)
    if (!endpoints) {
      errors.push({
        type: 'error',
        code: 'MISSING_REFERENCE',
        message: `Relation "${relation.id}" is missing source/target references.`,
        location: `relations[${index}]`,
        suggestion: 'Provide source/target, from/to, or vectorA/vectorB.',
      })
      return
    }

    if (!entityMap.has(endpoints.sourceId)) {
      errors.push({
        type: 'error',
        code: 'MISSING_REFERENCE',
        message: `Entity "${endpoints.sourceId}" not found.`,
        location: `relations[${index}]`,
        suggestion: `Available entities: ${Array.from(entityMap.keys()).join(', ') || '(none)'}`,
      })
    }
    if (!entityMap.has(endpoints.targetId)) {
      errors.push({
        type: 'error',
        code: 'MISSING_REFERENCE',
        message: `Entity "${endpoints.targetId}" not found.`,
        location: `relations[${index}]`,
        suggestion: `Available entities: ${Array.from(entityMap.keys()).join(', ') || '(none)'}`,
      })
    }

    const source = entityMap.get(endpoints.sourceId)
    const target = entityMap.get(endpoints.targetId)
    if (!source || !target) return

    if (relation.type === 'measureAngle' || relation.type === 'measure_angle') {
      const isVectorLike = (t: string): boolean => t === 'arrow' || t === 'node'
      if (!isVectorLike(source.type) || !isVectorLike(target.type)) {
        errors.push({
          type: 'error',
          code: 'TYPE_MISMATCH',
          message: `measureAngle expects vector-like entities, got "${source.type}" and "${target.type}".`,
          location: `relations[${index}]`,
          suggestion: 'Use arrow or node entities for angle measurement.',
        })
      }
    }
  }

  private validateCycles(entities: DSLEntity[], errors: ValidationError[]): void {
    const ids = new Set(entities.map(e => e.id))
    const graph = new Map<string, string[]>()
    for (const e of entities) {
      const refs = new Set<string>()
      collectRefs(e.anchor, refs)
      collectRefs(e.direction, refs)
      const edges = Array.from(refs).filter(ref => ids.has(ref) && ref !== e.id)
      graph.set(e.id, edges)
    }

    const visiting = new Set<string>()
    const visited = new Set<string>()

    const dfs = (node: string): boolean => {
      if (visiting.has(node)) return true
      if (visited.has(node)) return false
      visiting.add(node)
      const next = graph.get(node) ?? []
      for (const n of next) {
        if (dfs(n)) return true
      }
      visiting.delete(node)
      visited.add(node)
      return false
    }

    for (const node of graph.keys()) {
      if (dfs(node)) {
        errors.push({
          type: 'error',
          code: 'CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected near "${node}".`,
          location: 'entities',
          suggestion: 'Remove cycles in anchor/direction expressions.',
        })
        return
      }
    }
  }
}

function parseCall(input: string): { name: string; args: string[] } | null {
  const m = input.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/)
  if (!m) return null
  const [, name, argsText] = m
  const args = argsText
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return { name, args }
}

function collectRefs(value: unknown, out: Set<string>): void {
  if (typeof value !== 'string') return
  const text = value.trim()
  if (text.length === 0) return
  const call = parseCall(text)
  if (call) {
    for (const arg of call.args) {
      if (looksLikeId(arg)) out.add(arg)
    }
    return
  }
  if (looksLikeId(text) && !ANCHOR_FUNCTIONS.has(text)) out.add(text)
}

function looksLikeId(token: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(token)
}

function expectedAnchorArity(name: string): number {
  switch (name) {
    case 'project':
      return 2
    case 'closest_point':
      return 3
    case 'intersection':
      return 4
    default:
      return 0
  }
}
