import type * as THREE from 'three'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import type { IGizmo } from './IGizmo'

export abstract class BaseGizmo implements IGizmo {
  readonly id: string
  protected selected = false
  protected objects: THREE.Object3D[] = []

  constructor(entity: SemanticEntity) {
    this.id = entity.id
  }

  abstract build(entity: SemanticEntity): THREE.Object3D[]
  abstract updateFromSemantic(entity: SemanticEntity): void

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
