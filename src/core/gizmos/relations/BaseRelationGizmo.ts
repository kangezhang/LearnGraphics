import * as THREE from 'three'
import type { SemanticRelation } from '@/semantic/model/SemanticGraph'
import type { IRelationGizmo } from '@/core/gizmos/IGizmo'

/**
 * Base class for relation gizmos that connect two positions in 3D space.
 * Unlike BaseGizmo (which wraps a SemanticEntity), relation gizmos are built
 * from a SemanticRelation plus resolved source/target positions.
 */
export abstract class BaseRelationGizmo implements IRelationGizmo {
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

  protected configureOverlayObjects(objects: THREE.Object3D[], renderOrder = 50): void {
    for (const object of objects) {
      this.configureOverlayObject(object, renderOrder)
    }
  }

  protected configureOverlayObject(object: THREE.Object3D, renderOrder = 50): void {
    object.renderOrder = renderOrder
    object.traverse(node => {
      const holder = node as { material?: THREE.Material | THREE.Material[] }
      const material = holder.material
      if (!material) return
      if (Array.isArray(material)) {
        material.forEach(mat => this.configureOverlayMaterial(mat))
      } else {
        this.configureOverlayMaterial(material)
      }
    })
  }

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

  private configureOverlayMaterial(material: THREE.Material): void {
    const overlay = material as THREE.Material & {
      depthWrite?: boolean
      depthTest?: boolean
      transparent?: boolean
      polygonOffset?: boolean
      polygonOffsetFactor?: number
      polygonOffsetUnits?: number
      needsUpdate?: boolean
    }
    overlay.depthWrite = false
    overlay.depthTest = true
    overlay.transparent = true
    overlay.polygonOffset = true
    overlay.polygonOffsetFactor = -0.5
    overlay.polygonOffsetUnits = -1
    overlay.needsUpdate = true
  }
}
