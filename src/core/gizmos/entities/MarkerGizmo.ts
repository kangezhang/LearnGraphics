import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import { getGlobalVisualSettings } from '@/core/visual/GlobalVisualSettings'

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
  private labelColor = '#ffdd00'

  build(entity: SemanticEntity): THREE.Object3D[] {
    const pos = this.getPosition(entity)
    const p = entity.props as Record<string, unknown>
    const markerScale = getGlobalVisualSettings().markerScale
    this.normalColor = parseColor(p.color, this.normalColor)
    this.labelColor = typeof p.color === 'string' && p.color.trim().length > 0 ? p.color : '#ffdd00'

    // Diamond shape via OctahedronGeometry
    const geo = new THREE.OctahedronGeometry(0.12, 0)
    const mat = new THREE.MeshPhongMaterial({ color: this.normalColor })
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.position.copy(pos)
    this.mesh.scale.setScalar(markerScale)
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
    this.sprite.scale.set(0.8 * markerScale, 0.2 * markerScale, 1)
    this.sprite.position.copy(pos).add(new THREE.Vector3(0, 0.28 * markerScale, 0))
    this.sprite.userData['gizmoId'] = this.id

    this.objects = [this.mesh, this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const pos = this.getPosition(entity)
    const p = entity.props as Record<string, unknown>
    const markerScale = getGlobalVisualSettings().markerScale
    this.normalColor = parseColor(p.color, this.normalColor)
    this.labelColor = typeof p.color === 'string' && p.color.trim().length > 0 ? p.color : '#ffdd00'
    this.mesh.position.copy(pos)
    this.mesh.scale.setScalar(markerScale)
    this.sprite.scale.set(0.8 * markerScale, 0.2 * markerScale, 1)
    this.sprite.position.copy(pos).add(new THREE.Vector3(0, 0.28 * markerScale, 0))
    const label = String(p.label ?? '')
    ;(this.mesh.material as THREE.MeshPhongMaterial).color.copy(
      this.selected ? this.selectedColor : this.normalColor
    )
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
    ctx.fillStyle = selected ? '#ff4400' : this.labelColor
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

function parseColor(value: unknown, fallback: THREE.Color): THREE.Color {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback
  try {
    return new THREE.Color(value)
  } catch {
    return fallback
  }
}
