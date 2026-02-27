import * as THREE from 'three'
import { BaseRelationGizmo } from './BaseRelationGizmo'
import type { SemanticRelation } from '@/semantic/model/SemanticGraph'

/**
 * ProjectionHelper: shows the perpendicular projection of sourcePos onto the
 * line defined by targetPos and a direction vector (relation.props.dx/dy/dz).
 * Renders: the projection line, a right-angle marker, and a dashed foot line.
 */
export class ProjectionHelperGizmo extends BaseRelationGizmo {
  private projLine!: THREE.Line   // from source to foot
  private footLine!: THREE.Line   // along the axis through foot
  private cornerLines: THREE.Line[] = []
  private normalColor = new THREE.Color(0xff66cc)
  private selectedColor = new THREE.Color(0xff8800)

  build(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Object3D[] {
    this.normalColor = parseColor((relation.props as Record<string, unknown>).color, this.normalColor)
    const { foot, axisDir } = this.computeProjection(relation, sourcePos, targetPos)
    const mat = () => new THREE.LineBasicMaterial({ color: this.normalColor })

    // Projection line: source → foot
    this.projLine = this.makeLine([sourcePos, foot], mat())
    this.projLine.userData['gizmoId'] = this.id

    // Axis segment through foot
    const half = 0.6
    const p0 = foot.clone().sub(axisDir.clone().multiplyScalar(half))
    const p1 = foot.clone().add(axisDir.clone().multiplyScalar(half))
    this.footLine = this.makeLine([p0, p1], mat())
    this.footLine.userData['gizmoId'] = this.id

    // Right-angle corner marker
    this.cornerLines = this.buildCorner(sourcePos, foot, axisDir)
    this.cornerLines.forEach(l => (l.userData['gizmoId'] = this.id))

    this.objects = [this.projLine, this.footLine, ...this.cornerLines]
    this.configureOverlayObjects(this.objects, 51)
    this.applyVisibility(relation)
    return this.objects
  }

  update(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): void {
    this.normalColor = parseColor((relation.props as Record<string, unknown>).color, this.normalColor)
    const activeColor = this.selected ? this.selectedColor : this.normalColor
    for (const obj of [this.projLine, this.footLine, ...this.cornerLines]) {
      ;(obj.material as THREE.LineBasicMaterial).color.copy(activeColor)
    }
    const { foot, axisDir } = this.computeProjection(relation, sourcePos, targetPos)
    this.updateLine(this.projLine, [sourcePos, foot])

    const half = 0.6
    const p0 = foot.clone().sub(axisDir.clone().multiplyScalar(half))
    const p1 = foot.clone().add(axisDir.clone().multiplyScalar(half))
    this.updateLine(this.footLine, [p0, p1])

    const [seg0, seg1] = this.cornerSegments(sourcePos, foot, axisDir)
    if (this.cornerLines.length >= 2) {
      this.updateLine(this.cornerLines[0], seg0)
      this.updateLine(this.cornerLines[1], seg1)
    }
    this.applyVisibility(relation)
  }

  protected onSelectionChange(selected: boolean): void {
    const color = selected ? this.selectedColor : this.normalColor
    for (const obj of [this.projLine, this.footLine, ...this.cornerLines]) {
      ;(obj.material as THREE.LineBasicMaterial).color.copy(color)
    }
  }

  private computeProjection(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): { foot: THREE.Vector3; axisDir: THREE.Vector3 } {
    const p = relation.props as Record<string, number>
    const axisDir = new THREE.Vector3(p.dx ?? 1, p.dy ?? 0, p.dz ?? 0).normalize()
    const toSource = sourcePos.clone().sub(targetPos)
    const t = toSource.dot(axisDir)
    const foot = targetPos.clone().add(axisDir.clone().multiplyScalar(t))
    return { foot, axisDir }
  }

  private buildCorner(source: THREE.Vector3, foot: THREE.Vector3, axisDir: THREE.Vector3): THREE.Line[] {
    const [seg0, seg1] = this.cornerSegments(source, foot, axisDir)
    const mat = new THREE.LineBasicMaterial({ color: this.normalColor })
    return [
      this.makeLine(seg0, mat),
      this.makeLine(seg1, mat),
    ]
  }

  private cornerSegments(
    source: THREE.Vector3,
    foot: THREE.Vector3,
    axisDir: THREE.Vector3
  ): [THREE.Vector3[], THREE.Vector3[]] {
    const size = 0.1
    const toSource = source.clone().sub(foot).normalize()
    const c1 = foot.clone().add(toSource.clone().multiplyScalar(size))
    const c2 = c1.clone().add(axisDir.clone().multiplyScalar(size))
    const c3 = foot.clone().add(axisDir.clone().multiplyScalar(size))
    return [
      [c1, c2],
      [c2, c3],
    ]
  }

  private makeLine(points: THREE.Vector3[], mat: THREE.LineBasicMaterial): THREE.Line {
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat)
  }

  private updateLine(line: THREE.Line, points: THREE.Vector3[]): void {
    const pos = line.geometry.attributes['position'] as THREE.BufferAttribute
    points.forEach((p, i) => pos.setXYZ(i, p.x, p.y, p.z))
    pos.needsUpdate = true
  }

  private applyVisibility(relation: SemanticRelation): void {
    const props = relation.props as Record<string, unknown>
    this.projLine.visible = toBool(props.showProjectionLine, true)
    this.footLine.visible = toBool(props.showAxisLine, true)
    const showRightAngle = toBool(props.showRightAngle, true)
    for (const line of this.cornerLines) line.visible = showRightAngle
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
