import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class LabelGizmo extends BaseGizmo {
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalColor = '#4488ff'
  private selectedColor = '#ff8800'

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, unknown>
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 64
    this.ctx = this.canvas.getContext('2d')!
    this.drawLabel(String(p.label ?? entity.id), false)

    const texture = new THREE.CanvasTexture(this.canvas)
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(mat)
    this.sprite.scale.set(1, 0.25, 1)
    this.sprite.position.set(
      (p.x as number) ?? 0,
      (p.y as number) ?? 0,
      (p.z as number) ?? 0
    )
    this.sprite.userData['gizmoId'] = this.id
    this.objects = [this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, unknown>
    this.sprite.position.set(
      (p.x as number) ?? 0,
      (p.y as number) ?? 0,
      (p.z as number) ?? 0
    )
    this.drawLabel(String(p.label ?? entity.id), this.selected)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  protected onSelectionChange(selected: boolean): void {
    const p = this.sprite.userData as Record<string, unknown>
    this.drawLabel(String(p.label ?? this.id), selected)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  private drawLabel(text: string, selected: boolean): void {
    const { ctx, canvas } = this
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = selected ? this.selectedColor : this.normalColor
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
