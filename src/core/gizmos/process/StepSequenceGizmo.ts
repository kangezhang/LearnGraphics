import * as THREE from 'three'
import { BaseGizmo } from '../BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

/**
 * StepSequence: visualizes an ordered sequence of positions as numbered spheres
 * connected by lines. Supports highlighting the "current" step.
 *
 * Props:
 *   steps: Array<{ x, y, z, label? }>  — step positions
 *   currentStep: number                 — index of active step (0-based)
 *   color: hex string (optional)        — base color, default #44aaff
 *   activeColor: hex string (optional)  — active step color, default #ff8800
 */
export class StepSequenceGizmo extends BaseGizmo {
  private stepMeshes: THREE.Mesh[] = []
  private stepSprites: THREE.Sprite[] = []
  private connectorLines: THREE.Line[] = []
  private canvases: HTMLCanvasElement[] = []
  private ctxs: CanvasRenderingContext2D[] = []

  private normalColor = new THREE.Color(0x44aaff)
  private activeColor = new THREE.Color(0xff8800)
  private selectedColor = new THREE.Color(0xffffff)

  build(entity: SemanticEntity): THREE.Object3D[] {
    const p = entity.props as Record<string, unknown>
    const steps = this.getSteps(p)
    const currentStep = Number(p.currentStep ?? 0)
    if (p.color) this.normalColor.set(p.color as string)
    if (p.activeColor) this.activeColor.set(p.activeColor as string)

    this.stepMeshes = []
    this.stepSprites = []
    this.connectorLines = []
    this.canvases = []
    this.ctxs = []
    this.objects = []

    // Build step spheres + labels
    steps.forEach((step, i) => {
      const pos = new THREE.Vector3(step.x, step.y, step.z)
      const isActive = i === currentStep

      const geo = new THREE.SphereGeometry(0.1, 12, 12)
      const mat = new THREE.MeshPhongMaterial({
        color: isActive ? this.activeColor : this.normalColor,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.copy(pos)
      mesh.userData['gizmoId'] = this.id
      this.stepMeshes.push(mesh)
      this.objects.push(mesh)

      // Label
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 64
      const ctx = canvas.getContext('2d')!
      this.canvases.push(canvas)
      this.ctxs.push(ctx)
      const label = step.label ?? String(i + 1)
      this.drawStepLabel(ctx, canvas, label, isActive, false)

      const texture = new THREE.CanvasTexture(canvas)
      const spriteMat = new THREE.SpriteMaterial({ map: texture, depthTest: false })
      const sprite = new THREE.Sprite(spriteMat)
      sprite.scale.set(0.4, 0.2, 1)
      sprite.position.copy(pos).add(new THREE.Vector3(0, 0.22, 0))
      sprite.userData['gizmoId'] = this.id
      this.stepSprites.push(sprite)
      this.objects.push(sprite)
    })

    // Build connector lines between consecutive steps
    for (let i = 0; i < steps.length - 1; i++) {
      const a = new THREE.Vector3(steps[i].x, steps[i].y, steps[i].z)
      const b = new THREE.Vector3(steps[i + 1].x, steps[i + 1].y, steps[i + 1].z)
      const geo = new THREE.BufferGeometry().setFromPoints([a, b])
      const mat = new THREE.LineBasicMaterial({ color: this.normalColor, opacity: 0.5, transparent: true })
      const line = new THREE.Line(geo, mat)
      line.userData['gizmoId'] = this.id
      this.connectorLines.push(line)
      this.objects.push(line)
    }

    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const p = entity.props as Record<string, unknown>
    const steps = this.getSteps(p)
    const currentStep = Number(p.currentStep ?? 0)

    steps.forEach((step, i) => {
      const pos = new THREE.Vector3(step.x, step.y, step.z)
      const isActive = i === currentStep

      const mesh = this.stepMeshes[i]
      if (!mesh) return
      mesh.position.copy(pos)
      ;(mesh.material as THREE.MeshPhongMaterial).color.copy(
        this.selected ? this.selectedColor : isActive ? this.activeColor : this.normalColor
      )

      const sprite = this.stepSprites[i]
      if (!sprite) return
      sprite.position.copy(pos).add(new THREE.Vector3(0, 0.22, 0))
      const label = step.label ?? String(i + 1)
      this.drawStepLabel(this.ctxs[i], this.canvases[i], label, isActive, this.selected)
      ;(sprite.material as THREE.SpriteMaterial).map!.needsUpdate = true
    })

    // Update connector lines
    for (let i = 0; i < this.connectorLines.length; i++) {
      const line = this.connectorLines[i]
      const a = new THREE.Vector3(steps[i].x, steps[i].y, steps[i].z)
      const b = new THREE.Vector3(steps[i + 1].x, steps[i + 1].y, steps[i + 1].z)
      const positions = line.geometry.attributes['position'] as THREE.BufferAttribute
      positions.setXYZ(0, a.x, a.y, a.z)
      positions.setXYZ(1, b.x, b.y, b.z)
      positions.needsUpdate = true
    }
  }

  protected onSelectionChange(selected: boolean): void {
    this.stepMeshes.forEach(mesh => {
      ;(mesh.material as THREE.MeshPhongMaterial).color.copy(
        selected ? this.selectedColor : this.normalColor
      )
    })
  }

  private getSteps(p: Record<string, unknown>): Array<{ x: number; y: number; z: number; label?: string }> {
    const raw = p.steps
    if (!Array.isArray(raw)) return []
    return raw.map((s: unknown) => {
      const step = s as Record<string, unknown>
      return {
        x: Number(step.x ?? 0),
        y: Number(step.y ?? 0),
        z: Number(step.z ?? 0),
        label: step.label != null ? String(step.label) : undefined,
      }
    })
  }

  private drawStepLabel(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    text: string,
    active: boolean,
    selected: boolean
  ): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = selected ? '#ffffff' : active ? '#ff8800' : '#44aaff'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  dispose(): void {
    this.stepSprites.forEach(s => (s.material as THREE.SpriteMaterial).map?.dispose())
    super.dispose()
  }
}
