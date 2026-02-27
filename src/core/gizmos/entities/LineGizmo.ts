import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class LineGizmo extends BaseGizmo {
  private line!: THREE.Line
  private normalColor = new THREE.Color(0x7dd3fc)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const props = entity.props as Record<string, unknown>
    this.normalColor = parseColor(props.color, this.normalColor)

    const { p0, p1 } = resolveEndpoints(props)
    const geo = new THREE.BufferGeometry().setFromPoints([p0, p1])
    const mat = new THREE.LineBasicMaterial({ color: this.normalColor })
    this.line = new THREE.Line(geo, mat)
    this.line.userData['gizmoId'] = this.id
    this.objects = [this.line]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const props = entity.props as Record<string, unknown>
    this.normalColor = parseColor(props.color, this.normalColor)

    const { p0, p1 } = resolveEndpoints(props)
    const positions = this.line.geometry.attributes['position'] as THREE.BufferAttribute
    positions.setXYZ(0, p0.x, p0.y, p0.z)
    positions.setXYZ(1, p1.x, p1.y, p1.z)
    positions.needsUpdate = true
    ;(this.line.material as THREE.LineBasicMaterial).color.copy(
      this.selected ? this.selectedColor : this.normalColor
    )
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.line.material as THREE.LineBasicMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }
}

function resolveEndpoints(props: Record<string, unknown>): { p0: THREE.Vector3; p1: THREE.Vector3 } {
  const hasEndpointProps = ['x0', 'y0', 'z0', 'x1', 'y1', 'z1'].some(key => props[key] !== undefined)
  if (hasEndpointProps) {
    const p0 = new THREE.Vector3(
      toFinite(props.x0, toFinite(props.x, 0)),
      toFinite(props.y0, toFinite(props.y, 0)),
      toFinite(props.z0, toFinite(props.z, 0))
    )
    const fallbackDir = new THREE.Vector3(
      toFinite(props.dx, 1),
      toFinite(props.dy, 0),
      toFinite(props.dz, 0)
    )
    const fallbackLenRaw = toFinite(props.length, fallbackDir.length() > 1e-8 ? fallbackDir.length() : 1)
    const fallbackDirNorm = fallbackDir.length() > 1e-8 ? fallbackDir.normalize() : new THREE.Vector3(1, 0, 0)
    const fallbackDelta = fallbackDirNorm.multiplyScalar(fallbackLenRaw)

    const p1 = new THREE.Vector3(
      toFinite(props.x1, p0.x + fallbackDelta.x),
      toFinite(props.y1, p0.y + fallbackDelta.y),
      toFinite(props.z1, p0.z + fallbackDelta.z)
    )
    return { p0, p1 }
  }

  const p0 = new THREE.Vector3(
    toFinite(props.x, 0),
    toFinite(props.y, 0),
    toFinite(props.z, 0)
  )
  const rawDir = new THREE.Vector3(
    toFinite(props.dx, 1),
    toFinite(props.dy, 0),
    toFinite(props.dz, 0)
  )
  const rawLen = rawDir.length()
  const len = Math.max(1e-4, toFinite(props.length, rawLen > 1e-8 ? rawLen : 1))
  const dir = rawLen > 1e-8 ? rawDir.divideScalar(rawLen) : new THREE.Vector3(1, 0, 0)
  const p1 = p0.clone().add(dir.multiplyScalar(len))
  return { p0, p1 }
}

function parseColor(value: unknown, fallback: THREE.Color): THREE.Color {
  if (typeof value !== 'string' || value.trim().length === 0) return fallback
  try {
    return new THREE.Color(value)
  } catch {
    return fallback
  }
}

function toFinite(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}
