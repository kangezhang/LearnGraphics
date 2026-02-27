import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * Badge: a small numeric/text label rendered as a billboard sprite.
 * Props: x, y, z (position), value (string|number), color (hex string, optional)
 */
export class BadgeGizmo extends BaseGizmo {
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalBg = '#2255cc'
  private selectedBg = '#ff8800'
  private currentValue = '?'
  private currentBg = this.normalBg
  private readonly font = 'bold 28px sans-serif'
  private readonly canvasHeight = 64

  build(entity: SemanticEntity): THREE.Object3D[] {
    const pos = this.getPosition(entity)
    const p = entity.props as Record<string, unknown>

    this.canvas = document.createElement('canvas')
    this.canvas.width = 192
    this.canvas.height = this.canvasHeight
    this.ctx = this.canvas.getContext('2d')!

    this.currentValue = String(p.value ?? '?')
    this.currentBg = String(p.color ?? this.normalBg)
    this.drawBadge(this.currentValue, this.currentBg)

    const texture = new THREE.CanvasTexture(this.canvas)
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(mat)
    this.updateSpriteScale()
    this.sprite.position.copy(pos)
    this.sprite.userData['gizmoId'] = this.id

    this.objects = [this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const pos = this.getPosition(entity)
    this.sprite.position.copy(pos)
    const p = entity.props as Record<string, unknown>
    this.currentValue = String(p.value ?? '?')
    this.currentBg = String(p.color ?? this.normalBg)
    this.drawBadge(this.currentValue, this.selected ? this.selectedBg : this.currentBg)
    this.updateSpriteScale()
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  protected onSelectionChange(selected: boolean): void {
    this.drawBadge(this.currentValue, selected ? this.selectedBg : this.currentBg)
    this.updateSpriteScale()
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  private getPosition(entity: SemanticEntity): THREE.Vector3 {
    const p = entity.props as Record<string, number>
    return new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  }

  private drawBadge(value: string, bg: string): void {
    const { ctx, canvas } = this
    this.resizeCanvasForText(value)
    const w = canvas.width
    const h = canvas.height
    const r = 12

    ctx.clearRect(0, 0, w, h)

    // Rounded rect background
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(w - r, 0)
    ctx.quadraticCurveTo(w, 0, w, r)
    ctx.lineTo(w, h - r)
    ctx.quadraticCurveTo(w, h, w - r, h)
    ctx.lineTo(r, h)
    ctx.quadraticCurveTo(0, h, 0, h - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.fillStyle = bg
    ctx.fill()

    // Text
    ctx.fillStyle = '#ffffff'
    ctx.font = this.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(value, w / 2, h / 2)
  }

  private resizeCanvasForText(value: string): void {
    const { ctx, canvas } = this
    ctx.font = this.font
    const paddingX = 24
    const minWidth = 128
    const maxWidth = 420
    const measured = Math.ceil(ctx.measureText(value).width + paddingX * 2)
    const width = Math.max(minWidth, Math.min(maxWidth, measured))
    if (canvas.width !== width || canvas.height !== this.canvasHeight) {
      canvas.width = width
      canvas.height = this.canvasHeight
    }
  }

  private updateSpriteScale(): void {
    const heightWorld = 0.25
    const aspect = this.canvas.width / Math.max(1, this.canvas.height)
    this.sprite.scale.set(heightWorld * aspect, heightWorld, 1)
  }

  dispose(): void {
    ;(this.sprite.material as THREE.SpriteMaterial).map?.dispose()
    super.dispose()
  }
}
