import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class PlaneGizmo extends BaseGizmo {
  private mesh!: THREE.Mesh
  private normalColor = new THREE.Color(0x60a5fa)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const props = entity.props as Record<string, unknown>
    this.normalColor = parseColor(props.color, this.normalColor)

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1)
    const material = createMaterial(props, this.normalColor)
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.userData['gizmoId'] = this.id
    this.applyTransform(props)

    this.objects = [this.mesh]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const props = entity.props as Record<string, unknown>
    this.normalColor = parseColor(props.color, this.normalColor)

    const material = this.mesh.material as THREE.MeshStandardMaterial
    material.color.copy(this.selected ? this.selectedColor : this.normalColor)
    material.wireframe = toBool(props.wireframe, false)
    material.opacity = clamp(toFinite(props.opacity, 0.45), 0.03, 1)
    material.transparent = material.opacity < 0.999 || material.transparent
    material.needsUpdate = true

    this.applyTransform(props)
  }

  protected onSelectionChange(selected: boolean): void {
    ;(this.mesh.material as THREE.MeshStandardMaterial).color.copy(
      selected ? this.selectedColor : this.normalColor
    )
  }

  private applyTransform(props: Record<string, unknown>): void {
    const width = Math.max(0.05, toFinite(props.width, toFinite(props.size, 2)))
    const depth = Math.max(0.05, toFinite(props.depth, toFinite(props.size, 2)))
    this.mesh.scale.set(width, depth, 1)

    const x = toFinite(props.x, 0)
    const y = toFinite(props.y, 0)
    const z = toFinite(props.z, 0)
    this.mesh.position.set(x, y, z)

    const hasCustomRotation =
      props.rx !== undefined || props.ry !== undefined || props.rz !== undefined
      || props.rotationX !== undefined || props.rotationY !== undefined || props.rotationZ !== undefined
    const rx = toFinite(props.rx ?? props.rotationX, hasCustomRotation ? 0 : -Math.PI * 0.5)
    const ry = toFinite(props.ry ?? props.rotationY, 0)
    const rz = toFinite(props.rz ?? props.rotationZ, 0)
    this.mesh.rotation.set(rx, ry, rz)
  }
}

function createMaterial(props: Record<string, unknown>, color: THREE.Color): THREE.MeshStandardMaterial {
  const opacity = clamp(toFinite(props.opacity, 0.45), 0.03, 1)
  return new THREE.MeshStandardMaterial({
    color,
    side: THREE.DoubleSide,
    transparent: opacity < 0.999,
    opacity,
    wireframe: toBool(props.wireframe, false),
    metalness: 0.02,
    roughness: 0.86,
    depthWrite: opacity >= 0.999,
  })
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
    if (value.toLowerCase() === 'true') return true
    if (value.toLowerCase() === 'false') return false
  }
  return fallback
}

function toFinite(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
