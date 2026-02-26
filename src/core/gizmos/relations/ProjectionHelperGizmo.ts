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
    return this.objects
  }

  update(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): void {
    const { foot, axisDir } = this.computeProjection(relation, sourcePos, targetPos)
    this.updateLine(this.projLine, [sourcePos, foot])

    const half = 0.6
    const p0 = foot.clone().sub(axisDir.clone().multiplyScalar(half))
    const p1 = foot.clone().add(axisDir.clone().multiplyScalar(half))
    this.updateLine(this.footLine, [p0, p1])

    // Rebuild corner (simple approach: dispose old, create new)
    this.cornerLines.forEach(l => {
      l.geometry.dispose()
      ;(l.material as THREE.Material).dispose()
    })
    this.cornerLines = this.buildCorner(sourcePos, foot, axisDir)
    this.cornerLines.forEach(l => (l.userData['gizmoId'] = this.id))
    // Note: caller (View3D) must re-add new corner objects; for simplicity we
    // keep the same count by updating geometry in place when possible.
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
    const size = 0.1
    const toSource = source.clone().sub(foot).normalize()
    const c1 = foot.clone().add(toSource.clone().multiplyScalar(size))
    const c2 = c1.clone().add(axisDir.clone().multiplyScalar(size))
    const c3 = foot.clone().add(axisDir.clone().multiplyScalar(size))
    const mat = new THREE.LineBasicMaterial({ color: this.normalColor })
    return [
      this.makeLine([c1, c2], mat),
      this.makeLine([c2, c3], mat),
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
}
