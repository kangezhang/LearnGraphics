import * as THREE from 'three'
import type { SemanticRelation } from '@/semantic/model/SemanticGraph'

/**
 * Base class for relation gizmos that connect two positions in 3D space.
 * Unlike BaseGizmo (which wraps a SemanticEntity), relation gizmos are built
 * from a SemanticRelation plus resolved source/target positions.
 */
export abstract class BaseRelationGizmo {
  readonly id: string
  protected selected = false
  protected objects: THREE.Object3D[] = []

  constructor(relation: SemanticRelation) {
    this.id = relation.id
  }

  abstract build(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): THREE.Object3D[]

  abstract update(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): void

  setSelected(selected: boolean): void {
    this.selected = selected
    this.onSelectionChange(selected)
  }

  protected abstract onSelectionChange(selected: boolean): void

  getObjects(): THREE.Object3D[] {
    return this.objects
  }

  dispose(): void {
    this.objects.forEach(obj => {
      obj.traverse(child => {
        const mesh = child as THREE.Mesh
        mesh.geometry?.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose())
        } else {
          (mesh.material as THREE.Material)?.dispose()
        }
      })
    })
    this.objects = []
  }
}
