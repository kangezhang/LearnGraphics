import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * StateOverlay: a billboard panel anchored to a 3D position that displays
 * key-value state information (e.g. BFS visited/frontier counts, algorithm vars).
 *
 * Props:
 *   x, y, z: number          — anchor position
 *   state: Record<string, unknown>  — key-value pairs to display
 *   title: string (optional)  — header text
 *   color: hex string (optional) — background color, default #1a2a4a
 */
export class StateOverlayGizmo extends BaseGizmo {
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalBg = '#1a2a4a'
  private selectedBg = '#3a4a6a'

  private readonly W = 320
  private readonly H = 192

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, unknown>

    this.canvas = document.createElement('canvas')
    this.canvas.width = this.W
    this.canvas.height = this.H
    this.ctx = this.canvas.getContext('2d')!

    const bg = String(p.color ?? this.normalBg)
    const title = String(p.title ?? '')
    const state = (p.state ?? {}) as Record<string, unknown>
    this.drawPanel(title, state, bg)

    const texture = new THREE.CanvasTexture(this.canvas)
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(mat)
    this.sprite.scale.set(1.6, 0.96, 1)
    this.sprite.position.copy(this.getPosition(entity))
    this.sprite.userData['gizmoId'] = this.id

    this.objects = [this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, unknown>
    this.sprite.position.copy(this.getPosition(entity))
    const bg = this.selected
      ? this.selectedBg
      : String(p.color ?? this.normalBg)
    const title = String(p.title ?? '')
    const state = (p.state ?? {}) as Record<string, unknown>
    this.drawPanel(title, state, bg)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
  }

  protected onSelectionChange(_selected: boolean): void {
    // Visual update handled in updateFromSemantic; tint as quick feedback
    ;(this.sprite.material as THREE.SpriteMaterial).color.set(
      _selected ? '#aaccff' : '#ffffff'
    )
  }

  private getPosition(entity: SemanticEntity): THREE.Vector3 {
    const p = entity.props as Record<string, number>
    return new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0)
  }

  private drawPanel(title: string, state: Record<string, unknown>, bg: string): void {
    const { ctx, W, H } = this
    const r = 14

    ctx.clearRect(0, 0, W, H)

    // Rounded rect background
    ctx.beginPath()
    ctx.moveTo(r, 0)
    ctx.lineTo(W - r, 0)
    ctx.quadraticCurveTo(W, 0, W, r)
    ctx.lineTo(W, H - r)
    ctx.quadraticCurveTo(W, H, W - r, H)
    ctx.lineTo(r, H)
    ctx.quadraticCurveTo(0, H, 0, H - r)
    ctx.lineTo(0, r)
    ctx.quadraticCurveTo(0, 0, r, 0)
    ctx.closePath()
    ctx.fillStyle = bg
    ctx.fill()

    // Border
    ctx.strokeStyle = '#4488cc'
    ctx.lineWidth = 2
    ctx.stroke()

    let y = 28
    if (title) {
      ctx.fillStyle = '#88ccff'
      ctx.font = 'bold 22px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(title, 16, y)
      y += 8

      // Divider
      ctx.strokeStyle = '#4488cc'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(12, y + 4)
      ctx.lineTo(W - 12, y + 4)
      ctx.stroke()
      y += 18
    }

    // Key-value rows
    const entries = Object.entries(state)
    ctx.font = '18px monospace'
    for (const [key, val] of entries) {
      if (y > H - 16) break
      ctx.fillStyle = '#aaccff'
      ctx.textAlign = 'left'
      ctx.fillText(`${key}:`, 16, y)
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'right'
      ctx.fillText(String(val), W - 16, y)
      y += 26
    }
  }

  dispose(): void {
    ;(this.sprite.material as THREE.SpriteMaterial).map?.dispose()
    super.dispose()
  }
}
