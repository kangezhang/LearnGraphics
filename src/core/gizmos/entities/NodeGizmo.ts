import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * Composite gizmo for 'node' entities: sphere + billboard label.
 * Positions nodes on a circle in the XZ plane by default.
 */
export class NodeGizmo extends BaseGizmo {
  private mesh!: THREE.Mesh
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalColor = new THREE.Color(0x4488ff)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const pos = this.getPosition(entity)

    // Sphere
    const geo = new THREE.SphereGeometry(0.15, 16, 16)
    const mat = new THREE.MeshPhongMaterial({ color: this.normalColor })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.copy(pos)
    this.mesh.userData['gizmoId'] = this.id

    // Label
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 64
    this.ctx = this.canvas.getContext('2d')!
    const label = String((entity.props as Record<string, unknown>).label ?? entity.id)
    this.drawLabel(label, false)

    const texture = new THREE.CanvasTexture(this.canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(spriteMat)
    this.sprite.scale.set(0.8, 0.2, 1)
    this.sprite.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0))
    this.sprite.userData['gizmoId'] = this.id

    this.objects = [this.mesh, this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const pos = this.getPosition(entity)
    this.mesh.position.copy(pos)
    this.sprite.position.copy(pos).add(new THREE.Vector3(0, 0.3, 0))
    const label = String((entity.props as Record<string, unknown>).label ?? entity.id)
    this.drawLabel(label, this.selected)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  /** Set the node's base color (hex number or CSS string). Selection overrides this temporarily. */
  setColor(color: THREE.ColorRepresentation): void {
    this.normalColor.set(color)
    if (!this.selected) {
      ;(this.mesh.material as THREE.MeshPhongMaterial).color.copy(this.normalColor)
    }
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
    ctx.fillStyle = selected ? '#ff8800' : '#ffffff'
    ctx.font = 'bold 28px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  dispose(): void {
    ;(this.sprite.material as THREE.SpriteMaterial).map?.dispose()
    super.dispose()
  }
}
