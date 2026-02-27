import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'
import { getGlobalVisualSettings } from '@/core/visual/GlobalVisualSettings'

export class ArrowGizmo extends BaseGizmo {
  private arrow!: THREE.ArrowHelper
  private normalColor = new THREE.Color(0x44dd88)
  private selectedColor = new THREE.Color(0xff8800)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, number>
    const origin = resolveOrigin(p)
    const visualScale = getGlobalVisualSettings().arrowScale
    const raw = new THREE.Vector3(p.dx ?? 1, p.dy ?? 0, p.dz ?? 0)
    const rawLength = raw.length()
    const dir = rawLength > 1e-8 ? raw.clone().divideScalar(rawLength) : new THREE.Vector3(1, 0, 0)
    const length = toFinite(p.length, rawLength > 1e-8 ? rawLength : 1) * visualScale
    this.normalColor = parseColor((entity.props as Record<string, unknown>).color, this.normalColor)
    const head = resolveHeadSize(length)
    this.arrow = new THREE.ArrowHelper(dir, origin, length, this.normalColor.getHex(), head.length, head.width)
    this.arrow.userData['gizmoId'] = this.id
    this.objects = [this.arrow]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, number>
    const origin = resolveOrigin(p)
    const visualScale = getGlobalVisualSettings().arrowScale
    const raw = new THREE.Vector3(p.dx ?? 1, p.dy ?? 0, p.dz ?? 0)
    const rawLength = raw.length()
    const dir = rawLength > 1e-8 ? raw.clone().divideScalar(rawLength) : new THREE.Vector3(1, 0, 0)
    const length = toFinite(p.length, rawLength > 1e-8 ? rawLength : 1) * visualScale
    this.normalColor = parseColor((entity.props as Record<string, unknown>).color, this.normalColor)
    this.arrow.position.copy(origin)
    this.arrow.setDirection(dir)
    const head = resolveHeadSize(length)
    this.arrow.setLength(length, head.length, head.width)
    this.arrow.setColor(this.selected ? this.selectedColor : this.normalColor)
  }

  protected onSelectionChange(selected: boolean): void {
    const color = selected ? this.selectedColor : this.normalColor
    this.arrow.setColor(color)
  }
}

function resolveOrigin(props: Record<string, number>): THREE.Vector3 {
  return new THREE.Vector3(
    props.ox ?? props.x ?? 0,
    props.oy ?? props.y ?? 0,
    props.oz ?? props.z ?? 0
  )
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

function resolveHeadSize(length: number): { length: number; width: number } {
  return {
    length: clamp(length * 0.16, 0.08, 0.32),
    width: clamp(length * 0.075, 0.04, 0.18),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
