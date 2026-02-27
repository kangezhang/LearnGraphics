import * as THREE from 'three'
import { BaseRelationGizmo } from './BaseRelationGizmo'
import type { SemanticRelation } from '@/semantic/model/SemanticGraph'

/**
 * IntersectionMarker: marks the closest point between two line segments
 * (or their exact intersection if coplanar) with an X-shaped cross gizmo.
 *
 * sourcePos / targetPos are the midpoints of the two lines.
 * relation.props: { dx0,dy0,dz0 } direction of line-0, { dx1,dy1,dz1 } direction of line-1.
 * Falls back to the midpoint of sourcePos/targetPos when lines are parallel.
 */
export class IntersectionMarkerGizmo extends BaseRelationGizmo {
  private crossLines: THREE.Line[] = []
  private ring!: THREE.Line
  private normalColor = new THREE.Color(0xff3366)
  private selectedColor = new THREE.Color(0xff8800)
  private readonly CROSS_SIZE = 0.18
  private readonly RING_SEGMENTS = 32

  build(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): THREE.Object3D[] {
    const pt = this.computeIntersection(relation, sourcePos, targetPos)

    const mat = () => new THREE.LineBasicMaterial({ color: this.normalColor })

    // X cross: two diagonal lines
    const s = this.CROSS_SIZE
    this.crossLines = [
      this.makeLine([pt.clone().add(new THREE.Vector3(-s, s, 0)), pt.clone().add(new THREE.Vector3(s, -s, 0))], mat()),
      this.makeLine([pt.clone().add(new THREE.Vector3(s, s, 0)), pt.clone().add(new THREE.Vector3(-s, -s, 0))], mat()),
    ]
    this.crossLines.forEach(l => (l.userData['gizmoId'] = this.id))

    // Circle ring around intersection
    const ringPoints = this.buildRing(pt, s * 1.6)
    const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPoints)
    this.ring = new THREE.Line(ringGeo, mat())
    this.ring.userData['gizmoId'] = this.id

    this.objects = [...this.crossLines, this.ring]
    this.configureOverlayObjects(this.objects, 56)
    return this.objects
  }

  update(relation: SemanticRelation, sourcePos: THREE.Vector3, targetPos: THREE.Vector3): void {
    const pt = this.computeIntersection(relation, sourcePos, targetPos)
    const s = this.CROSS_SIZE

    const offsets = [
      [new THREE.Vector3(-s, s, 0), new THREE.Vector3(s, -s, 0)],
      [new THREE.Vector3(s, s, 0), new THREE.Vector3(-s, -s, 0)],
    ]
    this.crossLines.forEach((line, i) => {
      this.updateLine(line, [pt.clone().add(offsets[i][0]), pt.clone().add(offsets[i][1])])
    })

    const ringPoints = this.buildRing(pt, s * 1.6)
    this.ring.geometry.setFromPoints(ringPoints)
  }

  protected onSelectionChange(selected: boolean): void {
    const color = selected ? this.selectedColor : this.normalColor
    for (const obj of [...this.crossLines, this.ring]) {
      ;(obj.material as THREE.LineBasicMaterial).color.copy(color)
    }
  }

  private computeIntersection(
    relation: SemanticRelation,
    sourcePos: THREE.Vector3,
    targetPos: THREE.Vector3
  ): THREE.Vector3 {
    const p = relation.props as Record<string, number>
    const d0 = new THREE.Vector3(p.dx0 ?? 1, p.dy0 ?? 0, p.dz0 ?? 0).normalize()
    const d1 = new THREE.Vector3(p.dx1 ?? 0, p.dy1 ?? 1, p.dz1 ?? 0).normalize()

    // Closest point between two lines via parametric formula
    const w = sourcePos.clone().sub(targetPos)
    const a = d0.dot(d0)
    const b = d0.dot(d1)
    const c = d1.dot(d1)
    const d = d0.dot(w)
    const e = d1.dot(w)
    const denom = a * c - b * b

    if (Math.abs(denom) < 1e-6) {
      // Parallel — return midpoint
      return sourcePos.clone().lerp(targetPos, 0.5)
    }

    const t0 = (b * e - c * d) / denom
    const pt0 = sourcePos.clone().add(d0.clone().multiplyScalar(t0))
    const t1 = (a * e - b * d) / denom
    const pt1 = targetPos.clone().add(d1.clone().multiplyScalar(t1))

    // Average of the two closest points
    return pt0.add(pt1).multiplyScalar(0.5)
  }

  private buildRing(center: THREE.Vector3, r: number): THREE.Vector3[] {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= this.RING_SEGMENTS; i++) {
      const a = (i / this.RING_SEGMENTS) * Math.PI * 2
      pts.push(new THREE.Vector3(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, center.z))
    }
    return pts
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
