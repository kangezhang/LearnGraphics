import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * Marker: a diamond-shaped point with optional label, used to mark special positions.
 */
export class MarkerGizmo extends BaseGizmo {
  private mesh!: THREE.Mesh
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalColor = new THREE.Color(0xffdd00)
  private selectedColor = new THREE.Color(0xff4400)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const pos = this.getPosition(entity)
    const p = entity.props as Record<string, unknown>

    // Diamond shape via OctahedronGeometry
    const geo = new THREE.OctahedronGeometry(0.12, 0)
    const mat = new THREE.MeshPhongMaterial({ color: this.normalColor })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.copy(pos)
    this.mesh.userData['gizmoId'] = this.id

    // Label sprite
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 64
    this.ctx = this.canvas.getContext('2d')!
    const label = String(p.label ?? '')
    this.drawLabel(label, false)

    const texture = new THREE.CanvasTexture(this.canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(spriteMat)
    this.sprite.scale.set(0.8, 0.2, 1)
    this.sprite.position.copy(pos).add(new THREE.Vector3(0, 0.28, 0))
    this.sprite.userData['gizmoId'] = this.id

    this.objects = [this.mesh, this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const pos = this.getPosition(entity)
    this.mesh.position.copy(pos)
    this.sprite.position.copy(pos).add(new THREE.Vector3(0, 0.28, 0))
    const label = String((entity.props as Record<string, unknown>).label ?? '')
    this.drawLabel(label, this.selected)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.mesh.material as THREE.MeshPhongMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }

  private getPosition(entity: SemanticEntity): THREE.Vector3 {
    const p = entity.props as Record<string, number>
    return new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  }

  private drawLabel(text: string, selected: boolean): void {
    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!text) return
    ctx.fillStyle = selected ? '#ff4400' : '#ffdd00'
    ctx.font = 'bold 26px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  dispose(): void {
    ;(this.sprite.material as THREE.SpriteMaterial).map?.dispose()
    super.dispose()
  }
}
