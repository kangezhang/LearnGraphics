export type EntityType = 'node' | 'edge' | 'point' | 'arrow' | 'label' | 'marker' | 'badge' | 'step_sequence' | 'state_overlay' | 'trace_trail'

export interface SemanticEntity {
  id: string
  type: EntityType
  props: Record<string, unknown>
}

export interface SemanticRelation {
  id: string
  type: string
  sourceId: string
  targetId: string
  props: Record<string, unknown>
}

export class SemanticGraph {
  private entities = new Map<string, SemanticEntity>()
  private relations = new Map<string, SemanticRelation>()

  addEntity(entity: SemanticEntity): this {
    this.entities.set(entity.id, entity)
    return this
  }

  addRelation(relation: SemanticRelation): this {
    this.relations.set(relation.id, relation)
    return this
  }

  getEntity(id: string): SemanticEntity | undefined {
    return this.entities.get(id)
  }

  getRelation(id: string): SemanticRelation | undefined {
    return this.relations.get(id)
  }

  allEntities(): SemanticEntity[] {
    return Array.from(this.entities.values())
  }

  allRelations(): SemanticRelation[] {
    return Array.from(this.relations.values())
  }
}
