import * as THREE from 'three'
import { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import { sampleHeatColor } from './scalarFieldMath'
import {
  evaluateVectorAt,
  parseVectorFieldParams,
  sampleVectorMagnitudeRange,
  type VectorFieldParams,
} from './vectorFieldMath'

type FieldMode = 'arrows' | 'streamlines' | 'both'

export class VectorFieldGizmo extends BaseGizmo {
  private group!: THREE.Group
  private normalOpacity = 0.9
  private selectedOpacity = 1

  build(entity: SemanticEntity): THREE.Object3D[] {
    this.group = new THREE.Group()
    this.group.userData['gizmoId'] = this.id
    this.normalOpacity = this.resolveOpacity(entity.props)
    this.rebuild(entity)
    this.objects = [this.group]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    this.normalOpacity = this.resolveOpacity(entity.props)
    this.rebuild(entity)
  }

  protected onSelectionChange(selected: boolean): void {
    this.applyOpacity(selected ? this.selectedOpacity : this.normalOpacity)
  }

  dispose(): void {
    this.disposeChildren()
    super.dispose()
  }

  private rebuild(entity: SemanticEntity): void {
    this.disposeChildren()
    const props = entity.props
    const params = parseVectorFieldParams(props)
    const mode = this.resolveMode(props)
    const range = sampleVectorMagnitudeRange(params)

    if (mode === 'arrows' || mode === 'both') {
      this.buildArrowGrid(params, props, range)
    }
    if (mode === 'streamlines' || mode === 'both') {
      this.buildStreamlines(params, props)
    }

    this.applyOpacity(this.selected ? this.selectedOpacity : this.normalOpacity)
  }

  private buildArrowGrid(
    params: VectorFieldParams,
    props: Record<string, unknown>,
    range: [number, number]
  ): void {
    const baseStep = Math.min(
      params.width / Math.max(params.resolution - 1, 1),
      params.depth / Math.max(params.resolution - 1, 1)
    )
    const arrowScale = Math.max(0.04, toFinite(props.arrowScale, baseStep * 0.7))
    const maxArrowLength = Math.max(0.08, toFinite(props.maxArrowLength, baseStep * 0.95))
    const minArrowLength = Math.max(0.03, toFinite(props.minArrowLength, baseStep * 0.12))
    const minMagnitude = Math.max(1e-6, toFinite(props.minMagnitude, 1e-4))

    for (let j = 0; j < params.resolution; j++) {
      const tz = params.resolution > 1 ? j / (params.resolution - 1) : 0
      const z = params.centerZ + (tz - 0.5) * params.depth
      for (let i = 0; i < params.resolution; i++) {
        const tx = params.resolution > 1 ? i / (params.resolution - 1) : 0
        const x = params.centerX + (tx - 0.5) * params.width
        const sample = evaluateVectorAt(params, x, z)
        if (sample.magnitude < minMagnitude) continue

        const dir = new THREE.Vector3(sample.vx, 0, sample.vz)
        if (dir.lengthSq() < 1e-12) continue
        dir.normalize()

        const [r, g, b] = sampleHeatColor(sample.magnitude, range[0], range[1])
        const color = new THREE.Color(r / 255, g / 255, b / 255)
        const length = Math.min(maxArrowLength, Math.max(minArrowLength, sample.magnitude * arrowScale))
        const arrow = new THREE.ArrowHelper(
          dir,
          new THREE.Vector3(x, params.y, z),
          length,
          color.getHex(),
          Math.max(length * 0.3, 0.03),
          Math.max(length * 0.18, 0.02)
        )
        arrow.userData['gizmoId'] = this.id
        this.group.add(arrow)
      }
    }
  }

  private buildStreamlines(params: VectorFieldParams, props: Record<string, unknown>): void {
    const seedCount = Math.max(2, Math.floor(toFinite(props.streamlineSeeds, Math.max(6, Math.floor(params.resolution * 0.7)))))
    const maxSteps = Math.max(10, Math.floor(toFinite(props.streamlineSteps, 42)))
    const stepSize = Math.max(
      0.02,
      toFinite(
        props.streamlineStep,
        Math.min(params.width, params.depth) / Math.max(params.resolution * 1.6, 1)
      )
    )
    const minMagnitude = Math.max(1e-6, toFinite(props.minMagnitude, 1e-4))
    const colorRaw = props.streamlineColor
    const color = typeof colorRaw === 'string' && colorRaw.length > 0 ? colorRaw : '#f8fafc'

    const minX = params.centerX - params.width * 0.5
    const minZ = params.centerZ - params.depth * 0.5
    const maxZ = params.centerZ + params.depth * 0.5

    for (let i = 0; i < seedCount; i++) {
      const t = seedCount > 1 ? i / (seedCount - 1) : 0.5
      const z = minZ + t * (maxZ - minZ)
      const points = this.traceStreamline(minX, z, params, stepSize, maxSteps, minMagnitude)
      if (points.length < 2) continue

      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.72,
      })
      const line = new THREE.Line(geometry, material)
      line.userData['gizmoId'] = this.id
      this.group.add(line)
    }
  }

  private traceStreamline(
    startX: number,
    startZ: number,
    params: VectorFieldParams,
    stepSize: number,
    maxSteps: number,
    minMagnitude: number
  ): THREE.Vector3[] {
    const forward = this.traceHalf(startX, startZ, params, stepSize, maxSteps, minMagnitude, 1)
    const backward = this.traceHalf(startX, startZ, params, stepSize, maxSteps, minMagnitude, -1)

    if (backward.length === 0) return forward
    if (forward.length === 0) return backward.reverse()
    const merged = backward.reverse()
    merged.pop()
    merged.push(...forward)
    return merged
  }

  private traceHalf(
    startX: number,
    startZ: number,
    params: VectorFieldParams,
    stepSize: number,
    maxSteps: number,
    minMagnitude: number,
    sign: number
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [new THREE.Vector3(startX, params.y, startZ)]
    let x = startX
    let z = startZ

    for (let i = 0; i < maxSteps; i++) {
      const sample = evaluateVectorAt(params, x, z)
      if (sample.magnitude < minMagnitude) break

      const inv = 1 / Math.max(sample.magnitude, 1e-8)
      x += sample.vx * inv * stepSize * sign
      z += sample.vz * inv * stepSize * sign

      if (!this.isInsideBounds(x, z, params)) break
      points.push(new THREE.Vector3(x, params.y, z))
    }
    return points
  }

  private isInsideBounds(x: number, z: number, params: VectorFieldParams): boolean {
    const minX = params.centerX - params.width * 0.5
    const maxX = params.centerX + params.width * 0.5
    const minZ = params.centerZ - params.depth * 0.5
    const maxZ = params.centerZ + params.depth * 0.5
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ
  }

  private resolveMode(props: Record<string, unknown>): FieldMode {
    const rawMode = props.mode
    if (typeof rawMode === 'string') {
      const mode = rawMode.toLowerCase()
      if (mode === 'arrows' || mode === 'streamlines' || mode === 'both') return mode
    }
    const showArrows = toBool(props.showArrows, true)
    const showStreamlines = toBool(props.showStreamlines, true)
    if (showArrows && showStreamlines) return 'both'
    if (showArrows) return 'arrows'
    if (showStreamlines) return 'streamlines'
    return 'arrows'
  }

  private resolveOpacity(props: Record<string, unknown>): number {
    const raw = toFinite(props.opacity, 0.9)
    return clamp(raw, 0.08, 1)
  }

  private applyOpacity(opacity: number): void {
    this.group.traverse(node => {
      const material = (node as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined
      if (Array.isArray(material)) {
        material.forEach(m => applyOpacityToMaterial(m, opacity))
      } else if (material) {
        applyOpacityToMaterial(material, opacity)
      }
    })
  }

  private disposeChildren(): void {
    const children = [...this.group.children]
    for (const child of children) {
      child.traverse(node => {
        const mesh = node as THREE.Mesh
        mesh.geometry?.dispose()
        const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material
        if (Array.isArray(material)) material.forEach(m => m.dispose())
        else material?.dispose()
      })
      this.group.remove(child)
    }
  }
}

function applyOpacityToMaterial(material: THREE.Material, opacity: number): void {
  const m = material as THREE.Material & { opacity?: number; transparent?: boolean }
  if (typeof m.opacity !== 'number') return
  m.transparent = true
  m.opacity = opacity
  m.needsUpdate = true
}

function toFinite(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
