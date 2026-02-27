import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import { getGlobalVisualSettings } from '@/core/visual/GlobalVisualSettings'

type SymbolPreset =
  | 'camera'
  | 'light'
  | 'target'
  | 'origin'
  | 'ray'
  | 'eye'
  | 'screen'
  | 'warning'
  | 'info'

export class SymbolGizmo extends BaseGizmo {
  private group!: THREE.Group
  private iconSprite!: THREE.Sprite
  private iconCanvas!: HTMLCanvasElement
  private iconCtx!: CanvasRenderingContext2D
  private iconTexture!: THREE.CanvasTexture
  private labelSprite: THREE.Sprite | null = null
  private labelCanvas: HTMLCanvasElement | null = null
  private labelCtx: CanvasRenderingContext2D | null = null
  private labelTexture: THREE.CanvasTexture | null = null

  private normalColor = new THREE.Color('#7dd3fc')
  private selectedColor = new THREE.Color('#ff8800')
  private currentPreset: SymbolPreset = 'info'
  private currentLabel = ''
  private currentSize = 0.5

  build(entity: SemanticEntity): THREE.Object3D[] {
    this.group = new THREE.Group()
    this.group.userData['gizmoId'] = this.id

    this.iconCanvas = document.createElement('canvas')
    this.iconCanvas.width = 128
    this.iconCanvas.height = 128
    this.iconCtx = this.iconCanvas.getContext('2d')!
    this.iconTexture = new THREE.CanvasTexture(this.iconCanvas)
    const iconMat = new THREE.SpriteMaterial({ map: this.iconTexture, depthTest: false })
    this.iconSprite = new THREE.Sprite(iconMat)
    this.iconSprite.renderOrder = 64
    this.iconSprite.userData['gizmoId'] = this.id
    this.group.add(this.iconSprite)

    this.applyFromEntity(entity)
    this.objects = [this.group]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    this.applyFromEntity(entity)
  }

  protected onSelectionChange(selected: boolean): void {
    this.drawIcon(selected ? this.selectedColor : this.normalColor)
    this.iconTexture.needsUpdate = true
    this.drawLabel(selected)
    if (this.labelTexture) this.labelTexture.needsUpdate = true
  }

  dispose(): void {
    this.iconTexture.dispose()
    this.labelTexture?.dispose()
    super.dispose()
  }

  private applyFromEntity(entity: SemanticEntity): void {
    const props = entity.props as Record<string, unknown>
    this.currentPreset = normalizePreset(props.preset)
    this.currentLabel = typeof props.label === 'string' ? props.label : ''
    const baseSize = clamp(toFinite(props.size, 0.5), 0.2, 1.2)
    const symbolScale = getGlobalVisualSettings().symbolScale
    this.currentSize = clamp(baseSize * symbolScale, 0.2, 2.8)
    this.normalColor = parseColor(props.color, this.normalColor)

    const x = toFinite(props.x, 0)
    const y = toFinite(props.y, 0)
    const z = toFinite(props.z, 0)
    const pos = new THREE.Vector3(x, y, z)

    this.group.position.copy(pos)
    this.iconSprite.scale.set(this.currentSize, this.currentSize, 1)
    this.drawIcon(this.selected ? this.selectedColor : this.normalColor)
    this.iconTexture.needsUpdate = true

    this.drawLabel(this.selected)
    this.updateLabelSprite()
  }

  private drawIcon(color: THREE.Color): void {
    const ctx = this.iconCtx
    const canvas = this.iconCanvas
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2

    ctx.clearRect(0, 0, w, h)
    ctx.save()
    ctx.fillStyle = 'rgba(8, 14, 24, 0.62)'
    ctx.beginPath()
    ctx.arc(cx, cy, 54, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = `#${color.getHexString()}`
    ctx.fillStyle = `#${color.getHexString()}`
    ctx.lineWidth = 8
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    switch (this.currentPreset) {
      case 'camera':
        this.drawCamera(ctx, cx, cy)
        break
      case 'light':
        this.drawLight(ctx, cx, cy)
        break
      case 'target':
        this.drawTarget(ctx, cx, cy)
        break
      case 'origin':
        this.drawOrigin(ctx, cx, cy)
        break
      case 'ray':
        this.drawRay(ctx, cx, cy)
        break
      case 'eye':
        this.drawEye(ctx, cx, cy)
        break
      case 'screen':
        this.drawScreen(ctx, cx, cy)
        break
      case 'warning':
        this.drawWarning(ctx, cx, cy)
        break
      case 'info':
      default:
        this.drawInfo(ctx, cx, cy)
        break
    }
    ctx.restore()
  }

  private drawLabel(selected: boolean): void {
    if (!this.currentLabel) return
    if (!this.labelCanvas || !this.labelCtx) {
      this.labelCanvas = document.createElement('canvas')
      this.labelCanvas.width = 256
      this.labelCanvas.height = 64
      this.labelCtx = this.labelCanvas.getContext('2d')
      if (!this.labelCtx) return
      this.labelTexture = new THREE.CanvasTexture(this.labelCanvas)
    }

    const ctx = this.labelCtx
    const canvas = this.labelCanvas
    if (!ctx || !canvas) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = selected ? '#ff8800' : '#e5edf8'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.currentLabel, canvas.width / 2, canvas.height / 2)
  }

  private updateLabelSprite(): void {
    if (!this.currentLabel || !this.labelTexture) {
      if (this.labelSprite) {
        this.group.remove(this.labelSprite)
        this.labelSprite.material.dispose()
        this.labelSprite = null
      }
      return
    }

    if (!this.labelSprite) {
      const labelMat = new THREE.SpriteMaterial({ map: this.labelTexture, depthTest: false })
      this.labelSprite = new THREE.Sprite(labelMat)
      this.labelSprite.renderOrder = 65
      this.labelSprite.userData['gizmoId'] = this.id
      this.group.add(this.labelSprite)
    }

    this.labelSprite.scale.set(this.currentSize * 1.7, this.currentSize * 0.4, 1)
    this.labelSprite.position.set(0, this.currentSize * 0.72, 0)
    ;(this.labelSprite.material as THREE.SpriteMaterial).map = this.labelTexture
    this.labelTexture.needsUpdate = true
  }

  private drawCamera(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.strokeRect(cx - 28, cy - 14, 56, 32)
    ctx.beginPath()
    ctx.arc(cx + 6, cy + 2, 12, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeRect(cx - 32, cy - 24, 18, 10)
  }

  private drawLight(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.arc(cx, cy - 2, 16, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeRect(cx - 8, cy + 14, 16, 8)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const x0 = cx + Math.cos(a) * 24
      const y0 = cy - 2 + Math.sin(a) * 24
      const x1 = cx + Math.cos(a) * 34
      const y1 = cy - 2 + Math.sin(a) * 34
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  }

  private drawTarget(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.arc(cx, cy, 30, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 18, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawOrigin(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(cx - 30, cy)
    ctx.lineTo(cx + 30, cy)
    ctx.moveTo(cx, cy - 30)
    ctx.lineTo(cx, cy + 30)
    ctx.stroke()
  }

  private drawRay(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.moveTo(cx - 30, cy + 18)
    ctx.lineTo(cx + 24, cy - 20)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(cx + 24, cy - 20)
    ctx.lineTo(cx + 5, cy - 20)
    ctx.lineTo(cx + 16, cy - 4)
    ctx.closePath()
    ctx.fill()
  }

  private drawEye(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.moveTo(cx - 36, cy)
    ctx.quadraticCurveTo(cx, cy - 24, cx + 36, cy)
    ctx.quadraticCurveTo(cx, cy + 24, cx - 36, cy)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 10, 0, Math.PI * 2)
    ctx.fill()
  }

  private drawScreen(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.strokeRect(cx - 34, cy - 24, 68, 42)
    ctx.beginPath()
    ctx.moveTo(cx, cy + 20)
    ctx.lineTo(cx, cy + 32)
    ctx.moveTo(cx - 18, cy + 32)
    ctx.lineTo(cx + 18, cy + 32)
    ctx.stroke()
  }

  private drawWarning(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.moveTo(cx, cy - 34)
    ctx.lineTo(cx - 32, cy + 28)
    ctx.lineTo(cx + 32, cy + 28)
    ctx.closePath()
    ctx.stroke()
    ctx.fillRect(cx - 3, cy - 8, 6, 20)
    ctx.fillRect(cx - 3, cy + 16, 6, 6)
  }

  private drawInfo(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
    ctx.beginPath()
    ctx.arc(cx, cy, 30, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillRect(cx - 3, cy - 6, 6, 22)
    ctx.fillRect(cx - 3, cy - 20, 6, 6)
  }
}

function normalizePreset(raw: unknown): SymbolPreset {
  if (typeof raw !== 'string') return 'info'
  const value = raw.trim().toLowerCase()
  switch (value) {
    case 'camera':
    case 'light':
    case 'target':
    case 'origin':
    case 'ray':
    case 'eye':
    case 'screen':
    case 'warning':
    case 'info':
      return value
    default:
      return 'info'
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
