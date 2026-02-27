import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

type PrimitiveKind = 'box' | 'sphere' | 'cylinder' | 'cone' | 'torus'

export class ModelGizmo extends BaseGizmo {
  private group!: THREE.Group
  private mesh: THREE.Mesh | null = null
  private normalColor = new THREE.Color(0x34d399)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    this.group = new THREE.Group()
    this.group.userData['gizmoId'] = this.id
    this.objects = [this.group]
    this.rebuild(entity)
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    this.rebuild(entity)
  }

  protected onSelectionChange(selected: boolean): void {
    if (!this.mesh) return
    const material = this.mesh.material as THREE.MeshStandardMaterial
    material.color.copy(selected ? this.selectedColor : this.normalColor)
    material.needsUpdate = true
  }

  dispose(): void {
    this.disposeMesh()
    super.dispose()
  }

  private rebuild(entity: SemanticEntity): void {
    this.disposeMesh()
    const props = entity.props as Record<string, unknown>
    this.normalColor = parseColor(props.color, this.normalColor)

    const geometry = createPrimitiveGeometry(props)
    const opacity = clamp(toFinite(props.opacity, 1), 0.03, 1)
    const material = new THREE.MeshStandardMaterial({
      color: this.selected ? this.selectedColor : this.normalColor,
      metalness: clamp(toFinite(props.metalness, 0.12), 0, 1),
      roughness: clamp(toFinite(props.roughness, 0.78), 0, 1),
      wireframe: toBool(props.wireframe, false),
      transparent: opacity < 0.999,
      opacity,
      depthWrite: opacity >= 0.999,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData['gizmoId'] = this.id
    applyTransform(mesh, props)
    this.group.add(mesh)
    this.mesh = mesh
  }

  private disposeMesh(): void {
    if (!this.mesh) return
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.group.remove(this.mesh)
    this.mesh = null
  }
}

function createPrimitiveGeometry(props: Record<string, unknown>): THREE.BufferGeometry {
  const kind = resolveKind(props)
  switch (kind) {
    case 'sphere': {
      const radius = Math.max(0.02, toFinite(props.radius, toFinite(props.size, 0.5)))
      const widthSegments = clampInt(toFinite(props.widthSegments, 28), 8, 96)
      const heightSegments = clampInt(toFinite(props.heightSegments, 18), 6, 96)
      return new THREE.SphereGeometry(radius, widthSegments, heightSegments)
    }
    case 'cylinder': {
      const radius = Math.max(0.02, toFinite(props.radius, 0.35))
      const radiusTop = Math.max(0.001, toFinite(props.radiusTop, radius))
      const radiusBottom = Math.max(0.001, toFinite(props.radiusBottom, radius))
      const height = Math.max(0.03, toFinite(props.height, 1))
      const radialSegments = clampInt(toFinite(props.radialSegments, 24), 6, 120)
      return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments)
    }
    case 'cone': {
      const radius = Math.max(0.02, toFinite(props.radius, 0.35))
      const height = Math.max(0.03, toFinite(props.height, 1))
      const radialSegments = clampInt(toFinite(props.radialSegments, 24), 6, 120)
      return new THREE.ConeGeometry(radius, height, radialSegments)
    }
    case 'torus': {
      const radius = Math.max(0.05, toFinite(props.radius, 0.5))
      const tube = Math.max(0.01, toFinite(props.tube, toFinite(props.tubularRadius, 0.18)))
      const radialSegments = clampInt(toFinite(props.radialSegments, 16), 6, 120)
      const tubularSegments = clampInt(toFinite(props.tubularSegments, 56), 8, 240)
      return new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments)
    }
    case 'box':
    default: {
      const [sx, sy, sz] = parseVec3(props.size, 1)
      const widthSegments = clampInt(toFinite(props.widthSegments, 1), 1, 24)
      const heightSegments = clampInt(toFinite(props.heightSegments, 1), 1, 24)
      const depthSegments = clampInt(toFinite(props.depthSegments, 1), 1, 24)
      return new THREE.BoxGeometry(sx, sy, sz, widthSegments, heightSegments, depthSegments)
    }
  }
}

function applyTransform(mesh: THREE.Mesh, props: Record<string, unknown>): void {
  mesh.position.set(
    toFinite(props.x, 0),
    toFinite(props.y, 0),
    toFinite(props.z, 0)
  )
  mesh.rotation.set(
    toFinite(props.rx ?? props.rotationX, 0),
    toFinite(props.ry ?? props.rotationY, 0),
    toFinite(props.rz ?? props.rotationZ, 0)
  )

  const [sx, sy, sz] = parseVec3(props.scale, 1)
  mesh.scale.set(sx, sy, sz)
}

function resolveKind(props: Record<string, unknown>): PrimitiveKind {
  const raw = props.primitive ?? props.kind ?? props.shape
  if (typeof raw !== 'string') return 'box'
  const normalized = raw.trim().toLowerCase()
  if (
    normalized === 'box'
    || normalized === 'sphere'
    || normalized === 'cylinder'
    || normalized === 'cone'
    || normalized === 'torus'
  ) {
    return normalized
  }
  return 'box'
}

function parseVec3(raw: unknown, fallback: number): [number, number, number] {
  if (Array.isArray(raw) && raw.length >= 3) {
    return [
      Math.max(0.001, toFinite(raw[0], fallback)),
      Math.max(0.001, toFinite(raw[1], fallback)),
      Math.max(0.001, toFinite(raw[2], fallback)),
    ]
  }
  const v = Math.max(0.001, toFinite(raw, fallback))
  return [v, v, v]
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

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}
