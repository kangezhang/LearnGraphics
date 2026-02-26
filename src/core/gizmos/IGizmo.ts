import type * as THREE from 'three'
import type { SemanticEntity, SemanticRelation } from '@/semantic/model/SemanticGraph'

export interface IGizmo {
  readonly id: string
  build(entity: SemanticEntity): THREE.Object3D[]
  updateFromSemantic(entity: SemanticEntity): void
  setSelected(selected: boolean): void
  getObjects(): THREE.Object3D[]
  dispose(): void
}

export interface IRelationGizmo {
  readonly id: string
  build(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): THREE.Object3D[]
  update(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): void
  setSelected(selected: boolean): void
  getObjects(): THREE.Object3D[]
  dispose(): void
}
