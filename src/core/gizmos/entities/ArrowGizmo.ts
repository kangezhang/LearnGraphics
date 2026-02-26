import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class ArrowGizmo extends BaseGizmo {
  private arrow!: THREE.ArrowHelper
  private normalColor = new THREE.Color(0x44dd88)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, number>
    const origin = new THREE.Vector3(p.ox ?? 0, p.oy ?? 0, p.oz ?? 0)
    const dir = new THREE.Vector3(p.dx ?? 1, p.dy ?? 0, p.dz ?? 0).normalize()
    const length = p.length ?? 1
    this.arrow = new THREE.ArrowHelper(dir, origin, length, this.normalColor.getHex(), length * 0.2, length * 0.1)
    this.arrow.userData['gizmoId'] = this.id
    this.objects = [this.arrow]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, number>
    const origin = new THREE.Vector3(p.ox ?? 0, p.oy ?? 0, p.oz ?? 0)
    const dir = new THREE.Vector3(p.dx ?? 1, p.dy ?? 0, p.dz ?? 0).normalize()
    const length = p.length ?? 1
    this.arrow.position.copy(origin)
    this.arrow.setDirection(dir)
    this.arrow.setLength(length, length * 0.2, length * 0.1)
  }

  protected onSelectionChange(selected: boolean): void {
    const color = selected ? this.selectedColor : this.normalColor
    this.arrow.setColor(color)
  }
}
