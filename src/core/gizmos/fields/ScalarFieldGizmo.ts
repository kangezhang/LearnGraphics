import * as THREE from 'three'
import { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import {
  buildScalarFieldGrid,
  parseIsoLevels,
  parseScalarFieldParams,
  parseValueRange,
  sampleHeatColor,
} from './scalarFieldMath'

export class ScalarFieldGizmo extends BaseGizmo {
  private mesh!: THREE.Mesh
  private texture: THREE.CanvasTexture | null = null
  private selectedOpacity = 1.0
  private normalOpacity = 0.82

  build(entity: SemanticEntity): THREE.Object3D[] {
    const props = entity.props
    const params = parseScalarFieldParams(props)
    const opacity = this.resolveOpacity(props)

    const canvas = this.renderFieldTexture(props)
    this.texture = new THREE.CanvasTexture(canvas)
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false

    const geometry = new THREE.PlaneGeometry(params.width, params.depth, 1, 1)
    const material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
    })

    this.normalOpacity = opacity
    this.mesh = new THREE.Mesh(geometry, material)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.position.set(params.centerX, Number(props.y ?? 0), params.centerZ)
    this.mesh.userData['gizmoId'] = this.id

    this.objects = [this.mesh]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const props = entity.props
    const params = parseScalarFieldParams(props)
    const nextOpacity = this.resolveOpacity(props)
    this.normalOpacity = nextOpacity

    const nextTextureCanvas = this.renderFieldTexture(props)
    this.texture?.dispose()
    this.texture = new THREE.CanvasTexture(nextTextureCanvas)
    this.texture.minFilter = THREE.LinearFilter
    this.texture.magFilter = THREE.LinearFilter
    this.texture.generateMipmaps = false

    const material = this.mesh.material as THREE.MeshBasicMaterial
    material.map = this.texture
    material.opacity = this.selected ? this.selectedOpacity : this.normalOpacity
    material.needsUpdate = true

    this.mesh.geometry.dispose()
    this.mesh.geometry = new THREE.PlaneGeometry(params.width, params.depth, 1, 1)
    this.mesh.position.set(params.centerX, Number(props.y ?? 0), params.centerZ)
  }

  protected onSelectionChange(selected: boolean): void {
    const material = this.mesh.material as THREE.MeshBasicMaterial
    material.opacity = selected ? this.selectedOpacity : this.normalOpacity
  }

  dispose(): void {
    this.texture?.dispose()
    this.texture = null
    super.dispose()
  }

  private renderFieldTexture(props: Record<string, unknown>): HTMLCanvasElement {
    const params = parseScalarFieldParams(props)
    const explicitRange = parseValueRange(props)
    const grid = buildScalarFieldGrid(params, explicitRange)
    const isoLevels = parseIsoLevels(props, grid.min, grid.max)
    const isoColor = this.resolveIsoColor(props)
    const isoWidth = this.resolveIsoWidth(props)

    const size = params.resolution
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

  private resolveOpacity(props: Record<string, unknown>): number {
    const raw = Number(props.opacity ?? 0.82)
    if (!Number.isFinite(raw)) return 0.82
    return Math.max(0.05, Math.min(1, raw))
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
