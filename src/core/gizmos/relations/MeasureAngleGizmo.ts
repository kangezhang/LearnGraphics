import * as THREE from 'three'
import { BaseRelationGizmo } from './BaseRelationGizmo'
import type { SemanticRelation } from '@/semantic/model/SemanticGraph'

/**
 * MeasureAngle: arc between two direction vectors from a shared vertex,
 * with an angle label at the arc midpoint.
 * Props on relation: vertex {x,y,z} — the apex of the angle.
 * sourcePos and targetPos are the two arm endpoints.
 */
export class MeasureAngleGizmo extends BaseRelationGizmo {
  private arcLine!: THREE.Line
  private arm0!: THREE.Line
  private arm1!: THREE.Line
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private normalColor = new THREE.Color(0xaaff44)
  private selectedColor = new THREE.Color(0xff8800)
  private readonly ARC_SEGMENTS = 32

  build(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Object3D[] {
    this.normalColor = parseColor((relation.props as Record<string, unknown>).color, this.normalColor)
    const vertex = this.getVertex(relation, sourcePos, targetPos)

    const mat = new THREE.LineBasicMaterial({ color: this.normalColor })

    // Arms
    this.arm0 = this.makeLine([vertex, sourcePos], mat.clone())
    this.arm1 = this.makeLine([vertex, targetPos], mat.clone())
    this.arm0.userData['gizmoId'] = this.id
    this.arm1.userData['gizmoId'] = this.id

    // Arc
    const arcPoints = this.buildArcPoints(vertex, sourcePos, targetPos)
    const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints)
    this.arcLine = new THREE.Line(arcGeo, mat.clone())
    this.arcLine.userData['gizmoId'] = this.id

    // Label
    this.canvas = document.createElement('canvas')
    this.canvas.width = 192
    this.canvas.height = 64
    this.ctx = this.canvas.getContext('2d')!
    const angle = this.computeAngle(vertex, sourcePos, targetPos)
    this.drawLabel(angle, false, relation)

    const texture = new THREE.CanvasTexture(this.canvas)
    const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
    this.sprite = new THREE.Sprite(spriteMat)
    this.sprite.scale.set(0.62, 0.2, 1)
    this.sprite.position.copy(this.arcMidpoint(vertex, sourcePos, targetPos))
    this.sprite.userData['gizmoId'] = this.id
    this.sprite.renderOrder = 53

    this.objects = [this.arm0, this.arm1, this.arcLine, this.sprite]
    this.configureOverlayObjects([this.arm0, this.arm1, this.arcLine], 52)
    this.applyArmVisibility(relation)
    return this.objects
  }

  update(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): void {
    this.normalColor = parseColor((relation.props as Record<string, unknown>).color, this.normalColor)
    const vertex = this.getVertex(relation, sourcePos, targetPos)
    this.updateLine(this.arm0, [vertex, sourcePos])
    this.updateLine(this.arm1, [vertex, targetPos])

    const arcPoints = this.buildArcPoints(vertex, sourcePos, targetPos)
    this.arcLine.geometry.setFromPoints(arcPoints)

    const angle = this.computeAngle(vertex, sourcePos, targetPos)
    this.drawLabel(angle, this.selected, relation)
    ;(this.sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
    this.sprite.position.copy(this.arcMidpoint(vertex, sourcePos, targetPos))
    this.applyArmVisibility(relation)
  }

  protected onSelectionChange(selected: boolean): void {
    const color = selected ? this.selectedColor : this.normalColor
    for (const obj of [this.arm0, this.arm1, this.arcLine]) {
      ;(obj.material as THREE.LineBasicMaterial).color.copy(color)
    }
  }

  private getVertex(relation: SemanticRelation, src: THREE.Vector3, tgt: THREE.Vector3): THREE.Vector3 {
    const v = relation.props as Record<string, number>
    if (v.vx !== undefined) return new THREE.Vector3(v.vx, v.vy ?? 0, v.vz ?? 0)
    // Default: midpoint of src-tgt as fallback
    return src.clone().lerp(tgt, 0.5)
  }

  private computeAngle(vertex: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): number {
    const da = a.clone().sub(vertex).normalize()
    const db = b.clone().sub(vertex).normalize()
    return THREE.MathUtils.radToDeg(Math.acos(Math.max(-1, Math.min(1, da.dot(db)))))
  }

  private buildArcPoints(vertex: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] {
    const da = a.clone().sub(vertex)
    const db = b.clone().sub(vertex)
    const r = Math.min(da.length(), db.length()) * 0.35
    const dirA = da.clone().normalize()
    const dirB = db.clone().normalize()
    const points: THREE.Vector3[] = []
    for (let i = 0; i <= this.ARC_SEGMENTS; i++) {
      const t = i / this.ARC_SEGMENTS
      const dir = dirA.clone().lerp(dirB, t).normalize()
      points.push(vertex.clone().add(dir.multiplyScalar(r)))
    }
    return points
  }

  private arcMidpoint(vertex: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const da = a.clone().sub(vertex)
    const db = b.clone().sub(vertex)
    const r = Math.min(da.length(), db.length()) * 0.35
    const mid = da.normalize().add(db.normalize()).normalize()
    return vertex.clone().add(mid.multiplyScalar(r + 0.15))
  }

  private makeLine(points: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.Line {
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    return new THREE.Line(geo, mat)
  }

  private updateLine(line: THREE.Line, points: THREE.Vector3[]): void {
    const pos = line.geometry.attributes['position'] as THREE.BufferAttribute
    points.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z))
    pos.needsUpdate = true
  }

  private drawLabel(angleDeg: number, selected: boolean, relation: SemanticRelation): void {
    const { ctx, canvas } = this
    const prefix = String((relation.props as Record<string, unknown>).label ?? '').trim()
    const text = prefix.length > 0 ? `${prefix}=${angleDeg.toFixed(1)}°` : `${angleDeg.toFixed(1)}°`
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

  private applyArmVisibility(relation: SemanticRelation): void {
    const props = relation.props as Record<string, unknown>
    const showArms = toBool(props.showArms, true)
    this.arm0.visible = showArms
    this.arm1.visible = showArms
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

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}
