import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * TraceTrail: renders a fading polyline trail showing the path an object has
 * traveled. Newer segments are brighter; older segments fade toward transparent.
 *
 * Props:
 *   points: Array<{ x, y, z }>  — ordered trail positions (oldest first)
 *   color: hex string (optional) — trail color, default #00ffaa
 *   maxPoints: number (optional) — cap trail length, default 64
 *   headRadius: number (optional)— sphere radius at trail head, default 0.1
 */
export class TraceTrailGizmo extends BaseGizmo {
  private trailLine!: THREE.Line
  private headMesh!: THREE.Mesh
  private normalColor = new THREE.Color(0x00ffaa)
  private selectedColor = new THREE.Color(0xffffff)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, unknown>
    if (p.color) this.normalColor.set(p.color as string)

    const points = this.getPoints(p)
    const maxPoints = Math.max(2, Number(p.maxPoints ?? 64))
    const capped = points.slice(-maxPoints)

    // Trail line with per-vertex color for fade effect
    const geo = this.buildGeometry(capped, maxPoints)
    const mat = new THREE.LineBasicMaterial({ vertexColors: true })
    this.trailLine = new THREE.Line(geo, mat)
    this.trailLine.userData['gizmoId'] = this.id

    // Head sphere at the last point
    const headRadius = Number(p.headRadius ?? 0.1)
    const headGeo = new THREE.SphereGeometry(headRadius, 10, 10)
    const headMat = new THREE.MeshPhongMaterial({ color: this.normalColor })
    this.headMesh = new THREE.Mesh(headGeo, headMat)
    const last = capped.at(-1) ?? { x: 0, y: 0, z: 0 }
    this.headMesh.position.set(last.x, last.y, last.z)
    this.headMesh.userData['gizmoId'] = this.id

    this.objects = [this.trailLine, this.headMesh]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, unknown>
    const points = this.getPoints(p)
    const maxPoints = Math.max(2, Number(p.maxPoints ?? 64))
    const capped = points.slice(-maxPoints)

    // Rebuild geometry in-place
    const geo = this.buildGeometry(capped, maxPoints)
    this.trailLine.geometry.dispose()
    this.trailLine.geometry = geo

    const last = capped.at(-1) ?? { x: 0, y: 0, z: 0 }
    this.headMesh.position.set(last.x, last.y, last.z)
    ;(this.headMesh.material as THREE.MeshPhongMaterial).color.copy(
      this.selected ? this.selectedColor : this.normalColor
    )
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.headMesh.material as THREE.MeshPhongMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }

  private getPoints(p: Record<string, unknown>): Array<{ x: number; y: number; z: number }> {
    const raw = p.points
    if (!Array.isArray(raw)) return []
    return raw.map((pt: unknown) => {
      const s = pt as Record<string, unknown>
      return { x: Number(s.x ?? 0), y: Number(s.y ?? 0), z: Number(s.z ?? 0) }
    })
  }

  /**
   * Build a BufferGeometry with positions and per-vertex colors.
   * Colors fade from near-transparent (oldest) to full color (newest).
   */
  private buildGeometry(
    points: Array<{ x: number; y: number; z: number }>,
    _maxPoints: number
  ): THREE.BufferGeometry {
    const n = Math.max(points.length, 2)
    const positions = new Float32Array(n * 3)
    const colors = new Float32Array(n * 3)

    const r = this.normalColor.r
    const g = this.normalColor.g
    const b = this.normalColor.b

    for (let i = 0; i < n; i++) {
      const pt = points[i] ?? { x: 0, y: 0, z: 0 }
      positions[i * 3] = pt.x
      positions[i * 3 + 1] = pt.y
      positions[i * 3 + 2] = pt.z

      // Alpha-like fade: scale RGB by normalized index (0 = oldest/dim, 1 = newest/bright)
      const t = n > 1 ? i / (n - 1) : 1
      colors[i * 3] = r * t
      colors[i * 3 + 1] = g * t
      colors[i * 3 + 2] = b * t
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return geo
  }
}
