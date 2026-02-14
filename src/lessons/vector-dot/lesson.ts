import {
  ArrowHelper,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from 'three'
import type { Lesson, LessonContext } from '@/core/types'

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

class VectorDotLesson implements Lesson {
  meta = {
    id: 'vector-dot',
    title: '向量与点积',
    tags: ['线代', '向量'],
    summary: '两向量的方向、夹角与点积',
    order: 0,
  }

  private group = new Group()
  private vectorA = new Vector3(1, 0, 0)
  private vectorB = new Vector3(0.5, 0.75, 0)
  private arrowA?: ArrowHelper
  private arrowB?: ArrowHelper
  private arc?: Line
  private projection?: Line
  private arcGeometry?: BufferGeometry
  private projectionGeometry?: BufferGeometry
  private arcMaterial = new LineBasicMaterial({ color: new Color('#f2c14e') })
  private projectionMaterial = new LineBasicMaterial({ color: new Color('#5bd5a1'), transparent: true, opacity: 0.8 })
  private dotDisplay?: (text: string) => void
  private angleDisplay?: (text: string) => void

  async setup(ctx: LessonContext) {
    ctx.scene.add(this.group)

    this.arrowA = new ArrowHelper(
      this.vectorA.clone().normalize(),
      new Vector3(),
      this.vectorA.length(),
      0x7db3ff,
    )
    this.arrowB = new ArrowHelper(
      this.vectorB.clone().normalize(),
      new Vector3(),
      this.vectorB.length(),
      0xff9ca3,
    )

    this.arcGeometry = new BufferGeometry()
    this.arc = new Line(this.arcGeometry, this.arcMaterial)
    this.arc.renderOrder = 2

    this.projectionGeometry = new BufferGeometry()
    this.projection = new Line(this.projectionGeometry, this.projectionMaterial)
    this.projection.renderOrder = 1

    this.group.add(this.arrowA, this.arrowB, this.arc, this.projection)

    this.registerUI(ctx)
    this.refreshVisuals()
  }

  update(_dt: number) {
    // visuals are event-driven for this lesson
  }

  dispose() {
    this.group.removeFromParent()
    this.disposeArrow(this.arrowA)
    this.disposeArrow(this.arrowB)
    this.arcGeometry?.dispose()
    this.arcMaterial.dispose()
    this.projectionGeometry?.dispose()
    this.projectionMaterial.dispose()
    this.group.clear()
  }

  private registerUI(ctx: LessonContext) {
    const sliders: Array<{ id: string; label: string; vec: Vector3; axis: 'x' | 'y' }> = [
      { id: 'vecA-x', label: 'A.x', vec: this.vectorA, axis: 'x' },
      { id: 'vecA-y', label: 'A.y', vec: this.vectorA, axis: 'y' },
      { id: 'vecB-x', label: 'B.x', vec: this.vectorB, axis: 'x' },
      { id: 'vecB-y', label: 'B.y', vec: this.vectorB, axis: 'y' },
    ]

    sliders.forEach(({ label, vec, axis, id }) => {
      ctx.ui.slider({
        id,
        label,
        min: -2,
        max: 2,
        step: 0.01,
        value: vec[axis],
        onChange: (value) => {
          vec[axis] = clamp(value, -2, 2)
          this.refreshVisuals()
        },
      })
    })

    this.dotDisplay = ctx.ui.text({
      id: 'dot-value',
      label: '点积',
      value: '0.00',
    })

    this.angleDisplay = ctx.ui.text({
      id: 'angle-value',
      label: '夹角 (°)',
      value: '0.00',
    })
  }

  private refreshVisuals() {
    if (!this.arrowA || !this.arrowB || !this.arcGeometry || !this.projectionGeometry) return

    const dirA = this.vectorA.clone()
    const dirB = this.vectorB.clone()

    if (dirA.lengthSq() < 1e-5) dirA.set(1, 0, 0)
    if (dirB.lengthSq() < 1e-5) dirB.set(0.5, 0.5, 0)

    this.arrowA.setDirection(dirA.clone().normalize())
    this.arrowA.setLength(dirA.length(), 0.15, 0.1)

    this.arrowB.setDirection(dirB.clone().normalize())
    this.arrowB.setLength(dirB.length(), 0.15, 0.1)

    const dot = dirA.dot(dirB)
    const angle = dirA.angleTo(dirB)

    const aTheta = Math.atan2(dirA.y, dirA.x)
    const bTheta = Math.atan2(dirB.y, dirB.x)
    let delta = bTheta - aTheta
    while (delta <= -Math.PI) delta += Math.PI * 2
    while (delta > Math.PI) delta -= Math.PI * 2

    const steps = 48
    const radius = Math.min(dirA.length(), dirB.length(), 1.5) * 0.75
    const arcPoints: number[] = []
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps
      const theta = aTheta + delta * t
      const x = Math.cos(theta) * radius
      const y = Math.sin(theta) * radius
      arcPoints.push(x, y, 0)
    }
    this.arcGeometry.setAttribute('position', new BufferAttribute(new Float32Array(arcPoints), 3))
    this.arcGeometry.computeBoundingSphere()

    const projection = dirA.clone().multiplyScalar(dot / dirA.lengthSq())
    const projPoints = new Float32Array([0, 0, 0, projection.x, projection.y, projection.z])
    this.projectionGeometry.setAttribute('position', new BufferAttribute(projPoints, 3))
    this.projectionGeometry.computeBoundingSphere()

    this.dotDisplay?.(dot.toFixed(3))
    this.angleDisplay?.(((angle * 180) / Math.PI).toFixed(2))
  }

  private disposeArrow(arrow?: ArrowHelper) {
    if (!arrow) return
    arrow.line.geometry.dispose()
    if ('dispose' in arrow.line.material) {
      ;(arrow.line.material as { dispose?: () => void }).dispose?.()
    }
    arrow.cone.geometry.dispose()
    if ('dispose' in arrow.cone.material) {
      ;(arrow.cone.material as { dispose?: () => void }).dispose?.()
    }
    arrow.removeFromParent()
  }
}

const lesson = new VectorDotLesson()
export default lesson
