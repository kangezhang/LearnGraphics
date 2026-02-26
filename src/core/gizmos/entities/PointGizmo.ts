import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class PointGizmo extends BaseGizmo {
  private mesh!: THREE.Mesh
  private normalColor = new THREE.Color(0x4488ff)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, number>
    const geo = new THREE.SphereGeometry(0.08, 16, 16)
    const mat = new THREE.MeshPhongMaterial({ color: this.normalColor })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
    this.mesh.userData['gizmoId'] = this.id
    this.objects = [this.mesh]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, number>
    this.mesh.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.mesh.material as THREE.MeshPhongMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }
}
