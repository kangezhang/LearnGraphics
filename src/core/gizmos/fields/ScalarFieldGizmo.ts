import * as THREE from 'three'
import { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import {
  buildScalarFieldGrid,
  mapScalarToHeight,
  parseScalarFieldMode,
  parseScalarHeightMode,
  type ScalarFieldGrid,
  parseIsoLevels,
  parseScalarFieldParams,
  parseValueRange,
  sampleHeatColor,
} from './scalarFieldMath'

export class ScalarFieldGizmo extends BaseGizmo {
  private group!: THREE.Group
  private texture: THREE.CanvasTexture | null = null
  private readonly selectionOpacityBoost = 1.18

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
    this.applySelectionOpacity(selected)
  }

  dispose(): void {
    this.disposeChildren()
    this.texture?.dispose()
    this.texture = null
    super.dispose()
  }

  private rebuild(entity: SemanticEntity): void {
    this.disposeChildren()
    this.texture?.dispose()
    this.texture = null

    const props = entity.props
    const params = parseScalarFieldParams(props)
    const explicitRange = parseValueRange(props)
    const grid = buildScalarFieldGrid(params, explicitRange)
    const mode = parseScalarFieldMode(props)
    const baseY = toFinite(props.y, 0)

    if (mode === 'plane' || mode === 'both') {
      const planeOpacity = this.resolvePlaneOpacity(props, mode)
      const planeCanvas = this.renderFieldTexture(props, grid)
      this.texture = new THREE.CanvasTexture(planeCanvas)
      this.texture.minFilter = THREE.LinearFilter
      this.texture.magFilter = THREE.LinearFilter
      this.texture.generateMipmaps = false

      const planeGeometry = new THREE.PlaneGeometry(params.width, params.depth, 1, 1)
      const planeMaterial = new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        opacity: planeOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
      setMaterialBaseOpacity(planeMaterial, planeOpacity)

      const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial)
      planeMesh.rotation.x = -Math.PI / 2
      planeMesh.position.set(params.centerX, baseY, params.centerZ)
      planeMesh.userData['gizmoId'] = this.id
      this.group.add(planeMesh)
    }

    if (mode === 'surface' || mode === 'both') {
      const surface = this.buildSurfaceMesh(props, grid, baseY, mode)
      this.group.add(surface)
    }

    this.applySelectionOpacity(this.selected)
  }

  private buildSurfaceMesh(
    props: Record<string, unknown>,
    grid: ScalarFieldGrid,
    baseY: number,
    mode: 'surface' | 'both' | 'plane'
  ): THREE.Mesh {
    const params = grid.params
    const segX = Math.max(1, params.resolution - 1)
    const segY = Math.max(1, params.resolution - 1)
    const geometry = new THREE.PlaneGeometry(params.width, params.depth, segX, segY)
    const positions = geometry.attributes.position as THREE.BufferAttribute
    const vertexCount = positions.count
    const colors = new Float32Array(vertexCount * 3)

    const heightScale = this.resolveHeightScale(props, params.width, params.depth)
    const heightMode = parseScalarHeightMode(props)
    const surfaceYOffset = toFinite(props.surfaceYOffset, mode === 'both' ? 0.015 : 0)

    for (let j = 0; j <= segY; j++) {
      for (let i = 0; i <= segX; i++) {
        const idx = j * (segX + 1) + i
        const sampleRow = grid.values[segY - j]
        const value = sampleRow?.[i] ?? grid.min

        const h = mapScalarToHeight(value, grid.min, grid.max, heightScale, heightMode) + surfaceYOffset
        positions.setZ(idx, h)

        const [r, g, b] = sampleHeatColor(value, grid.min, grid.max)
        colors[idx * 3] = r / 255
        colors[idx * 3 + 1] = g / 255
        colors[idx * 3 + 2] = b / 255
      }
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.computeVertexNormals()

    const surfaceOpacity = this.resolveSurfaceOpacity(props, mode)
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: 0.06,
      roughness: 0.68,
      transparent: true,
      opacity: surfaceOpacity,
      wireframe: toBool(props.surfaceWireframe, false),
      side: THREE.DoubleSide,
      depthWrite: false,
    })
    setMaterialBaseOpacity(material, surfaceOpacity)

    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(params.centerX, baseY, params.centerZ)
    mesh.userData['gizmoId'] = this.id
    return mesh
  }

  private renderFieldTexture(props: Record<string, unknown>, grid: ScalarFieldGrid): HTMLCanvasElement {
    const isoLevels = parseIsoLevels(props, grid.min, grid.max)
    const isoColor = this.resolveIsoColor(props)
    const isoWidth = this.resolveIsoWidth(props)

    const size = grid.params.resolution
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    const img = ctx.createImageData(size, size)
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const value = grid.values[j][i]
        const [r, g, b] = sampleHeatColor(value, grid.min, grid.max)
        const index = ((size - 1 - j) * size + i) * 4
        img.data[index] = r
        img.data[index + 1] = g
        img.data[index + 2] = b
        img.data[index + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)

    if (isoLevels.length > 0) {
      ctx.strokeStyle = isoColor
      ctx.lineWidth = isoWidth
      for (const level of isoLevels) {
        drawIsoLines(ctx, grid.values, level)
      }
    }

    return canvas
  }

  private resolvePlaneOpacity(props: Record<string, unknown>, mode: 'plane' | 'surface' | 'both'): number {
    const fallback = mode === 'both' ? 0.52 : 0.82
    return clamp(toFinite(props.opacity, toFinite(props.planeOpacity, fallback)), 0.05, 1)
  }

  private resolveSurfaceOpacity(props: Record<string, unknown>, mode: 'plane' | 'surface' | 'both'): number {
    const fallback = mode === 'both' ? 0.9 : 0.95
    return clamp(toFinite(props.surfaceOpacity, fallback), 0.08, 1)
  }

  private resolveHeightScale(props: Record<string, unknown>, width: number, depth: number): number {
    const fallback = Math.max(width, depth) * 0.36
    return Math.max(0.001, toFinite(props.heightScale, fallback))
  }

  private resolveIsoColor(props: Record<string, unknown>): string {
    const raw = props.isoColor
    return typeof raw === 'string' && raw.length > 0 ? raw : '#f8fafc'
  }

  private resolveIsoWidth(props: Record<string, unknown>): number {
    const raw = Number(props.isoWidth ?? 1)
    if (!Number.isFinite(raw)) return 1
    return Math.max(0.5, Math.min(3, raw))
  }

  private applySelectionOpacity(selected: boolean): void {
    this.group.traverse(node => {
      const mesh = node as THREE.Mesh
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (!material) return
      if (Array.isArray(material)) {
        material.forEach(m => applyOpacityFromBase(m, selected, this.selectionOpacityBoost))
      } else {
        applyOpacityFromBase(material, selected, this.selectionOpacityBoost)
      }
    })
  }

  private disposeChildren(): void {
    if (!this.group) return
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

function drawIsoLines(ctx: CanvasRenderingContext2D, values: number[][], level: number): void {
  const rows = values.length
  const cols = values[0]?.length ?? 0
  if (rows < 2 || cols < 2) return

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const v00 = values[j][i]
      const v10 = values[j][i + 1]
      const v01 = values[j + 1][i]
      const v11 = values[j + 1][i + 1]

      const points: Array<{ x: number; y: number }> = []
      addEdgePoint(points, i, j, i + 1, j, v00, v10, level)
      addEdgePoint(points, i + 1, j, i + 1, j + 1, v10, v11, level)
      addEdgePoint(points, i + 1, j + 1, i, j + 1, v11, v01, level)
      addEdgePoint(points, i, j + 1, i, j, v01, v00, level)

      if (points.length === 2) {
        drawSegment(ctx, points[0], points[1], rows)
      } else if (points.length === 4) {
        drawSegment(ctx, points[0], points[1], rows)
        drawSegment(ctx, points[2], points[3], rows)
      }
    }
  }
}

function addEdgePoint(
  out: Array<{ x: number; y: number }>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  v0: number,
  v1: number,
  level: number
): void {
  const d0 = v0 - level
  const d1 = v1 - level
  if ((d0 < 0 && d1 < 0) || (d0 > 0 && d1 > 0)) return
  if (Math.abs(v1 - v0) < 1e-8) return

  const t = (level - v0) / (v1 - v0)
  if (t < 0 || t > 1) return
  out.push({
    x: x0 + (x1 - x0) * t,
    y: y0 + (y1 - y0) * t,
  })
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  rows: number
): void {
  ctx.beginPath()
  ctx.moveTo(a.x, rows - 1 - a.y)
  ctx.lineTo(b.x, rows - 1 - b.y)
  ctx.stroke()
}

function setMaterialBaseOpacity(material: THREE.Material, opacity: number): void {
  ;(material as THREE.Material & { userData: Record<string, unknown> }).userData.baseOpacity = opacity
}

function applyOpacityFromBase(material: THREE.Material, selected: boolean, boost: number): void {
  const m = material as THREE.Material & {
    opacity?: number
    transparent?: boolean
    userData: Record<string, unknown>
  }
  if (typeof m.opacity !== 'number') return
  const raw = Number(m.userData.baseOpacity)
  const baseOpacity = Number.isFinite(raw) ? clamp(raw, 0.01, 1) : 1
  const nextOpacity = selected ? clamp(baseOpacity * boost, baseOpacity, 1) : baseOpacity
  m.transparent = true
  m.opacity = nextOpacity
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
