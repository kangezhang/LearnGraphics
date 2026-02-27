import * as THREE from 'three'
import { BaseRelationGizmo } from './BaseRelationGizmo'
import type { SemanticRelation } from '@/semantic/model/SemanticGraph'

/**
 * MeasureDistance: dashed line between two points with a distance label at midpoint.
 */
export class MeasureDistanceGizmo extends BaseRelationGizmo {
  private line!: THREE.Line
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalColor = new THREE.Color(0x00ccff)
  private selectedColor = new THREE.Color(0xff8800)

  build(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Object3D[] {
    this.normalColor = parseColor((relation.props as Record<string, unknown>).color, this.normalColor)
    // Dashed line
    const points = [sourcePos.clone(), targetPos.clone()]
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    const mat = new THREE.LineDashedMaterial({
      color: this.normalColor,
      dashSize: 0.15,
      gapSize: 0.08,
    })
    this.line = new THREE.Line(geo, mat)
    this.line.computeLineDistances()
    this.line.userData['gizmoId'] = this.id
    this.configureOverlayObject(this.line, 54)

    // Distance label
    this.canvas = document.createElement('canvas')
    this.canvas.width = 256
    this.canvas.height = 64
    this.ctx = this.canvas.getContext('2d')!
    const dist = sourcePos.distanceTo(targetPos)
    this.drawLabel(dist, false, relation)

    const texture = new THREE.CanvasTexture(this.canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(spriteMat)
    this.sprite.scale.set(0.72, 0.19, 1)
    this.sprite.position.copy(sourcePos).lerp(targetPos, 0.5).add(new THREE.Vector3(0, 0.18, 0))
    this.sprite.userData['gizmoId'] = this.id
    this.sprite.renderOrder = 55

    this.objects = [this.line, this.sprite]
    return this.objects
  }

  update(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): void {
    this.normalColor = parseColor((relation.props as Record<string, unknown>).color, this.normalColor)
    ;(this.line.material as THREE.LineDashedMaterial).color.copy(
      this.selected ? this.selectedColor : this.normalColor
    )
    const positions = this.line.geometry.attributes['position'] as THREE.BufferAttribute
    positions.setXYZ(0, sourcePos.x, sourcePos.y, sourcePos.z)
    positions.setXYZ(1, targetPos.x, targetPos.y, targetPos.z)
    positions.needsUpdate = true
    this.line.computeLineDistances()

    const dist = sourcePos.distanceTo(targetPos)
    this.drawLabel(dist, this.selected, relation)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
    this.sprite.position.copy(sourcePos).lerp(targetPos, 0.5).add(new THREE.Vector3(0, 0.18, 0))
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.line.material as THREE.LineDashedMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }

  private drawLabel(dist: number, selected: boolean, relation: SemanticRelation): void {
    const { ctx, canvas } = this
    const props = relation.props as Record<string, unknown>
    const unit = String(props.unit ?? '')
    const prefix = String(props.label ?? '').trim()
    const magnitude = `${dist.toFixed(2)}${unit ? ' ' + unit : ''}`
    const text = prefix.length > 0 ? `${prefix}=${magnitude}` : magnitude
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = selected ? '#ff8800' : `#${this.normalColor.getHexString()}`
    ctx.font = 'bold 22px sans-serif'
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
