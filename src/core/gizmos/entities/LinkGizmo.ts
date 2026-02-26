import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * Gizmo for 'link' relations rendered as a line between two positions.
 * Positions are injected via props: { x0,y0,z0, x1,y1,z1 }
 */
export class LinkGizmo extends BaseGizmo {
  private line!: THREE.Line
  private normalColor = new THREE.Color(0x888888)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const { p0, p1 } = this.getEndpoints(entity)
    const geo = new THREE.BufferGeometry().setFromPoints([p0, p1])
    const mat = new THREE.LineBasicMaterial({ color: this.normalColor })
    this.line = new THREE.Line(geo, mat)
    this.line.userData['gizmoId'] = this.id
    this.objects = [this.line]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const { p0, p1 } = this.getEndpoints(entity)
    const positions = this.line.geometry.attributes['position'] as THREE.BufferAttribute
    positions.setXYZ(0, p0.x, p0.y, p0.z)
    positions.setXYZ(1, p1.x, p1.y, p1.z)
    positions.needsUpdate = true
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.line.material as THREE.LineBasicMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }

  private getEndpoints(entity: SemanticEntity) {
    const p = entity.props as Record<string, number>
    return {
      p0: new THREE.Vector3(p.x0 ?? 0, p.y0 ?? 0, p.z0 ?? 0),
      p1: new THREE.Vector3(p.x1 ?? 0, p.y1 ?? 0, p.z1 ?? 0),
    }
  }
}
