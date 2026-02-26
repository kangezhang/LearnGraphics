import type { IView } from '@/views/IView'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import { StepTrack, type StepData } from '@/timeline/runtime/StepTrack'

type SeriesPoint = { x: number; y: number }
type PlotSeries = { label: string; points: SeriesPoint[] }
type PlotBounds = { xMin: number; xMax: number; yMin: number; yMax: number }
type PlotRect = { left: number; top: number; width: number; height: number }

const PALETTE = ['#4f8ef7', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const PAD_L = 42
const PAD_R = 12
const PAD_T = 16
const PAD_B = 28
const MIN_SPAN = 1e-6

export class PlotView implements IView {
  readonly id = 'plotview'
  readonly type = 'plot' as const

  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private graph: SemanticGraph | null = null
  private timeline: TimelineRuntime | null = null
  private selectedIds: string[] = []
  private currentTime = 0
  private series: PlotSeries[] = []
  private dataBounds: PlotBounds | null = null
  private viewBounds: PlotBounds | null = null
  private plotRect: PlotRect | null = null
  private dragState: { startX: number; startY: number; bounds: PlotBounds } | null = null

  mount(container: HTMLElement): void {
    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#0d1018'
    container.appendChild(this.canvas)
    this.ctx = this.canvas.getContext('2d')
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.canvas.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    this.canvas.addEventListener('dblclick', this.onDoubleClick)
    this.resize(container.clientWidth, container.clientHeight)
  }

  resize(w: number, h: number): void {
    if (!this.canvas) return
    this.canvas.width = Math.max(1, Math.floor(w))
    this.canvas.height = Math.max(1, Math.floor(h))
    this.draw()
  }

  onSelectionChange(ids: string[]): void {
    this.selectedIds = ids
    this.rebuildSeries()
    this.draw()
  }

  loadGraph(graph: SemanticGraph): void {
    this.graph = graph
    this.rebuildSeries()
    this.draw()
  }

  loadTimeline(runtime: TimelineRuntime | null): void {
    this.timeline = runtime
    this.currentTime = runtime?.time ?? 0
    this.rebuildSeries()
    this.draw()
  }

  onTimelineTick(time: number): void {
    this.currentTime = time
    this.draw()
  }

  dispose(): void {
    this.canvas?.removeEventListener('wheel', this.onWheel)
    this.canvas?.removeEventListener('mousedown', this.onMouseDown)
    this.canvas?.removeEventListener('dblclick', this.onDoubleClick)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    this.canvas?.remove()
    this.canvas = null
    this.ctx = null
    this.dragState = null
  }

  private draw(): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return

    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#0d1018'
    ctx.fillRect(0, 0, w, h)

    if (this.series.length === 0) {
      this.dataBounds = null
      this.plotRect = null
      this.drawMessage(this.resolveEmptyMessage())
      return
    }

    const pw = w - PAD_L - PAD_R
    const ph = h - PAD_T - PAD_B
    if (pw <= 0 || ph <= 0) return

    const dataBounds = this.computeDataBounds(this.series)
    if (!dataBounds) return
    this.dataBounds = dataBounds
    if (!this.viewBounds) {
      this.viewBounds = { ...dataBounds }
    }
    this.viewBounds = normalizeBounds(this.viewBounds)
    this.plotRect = { left: PAD_L, top: PAD_T, width: pw, height: ph }

    const { xMin, xMax, yMin, yMax } = this.viewBounds
    const xSpan = xMax - xMin
    const ySpan = yMax - yMin

    // Axes
    ctx.strokeStyle = '#2a3045'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PAD_L, PAD_T)
    ctx.lineTo(PAD_L, PAD_T + ph)
    ctx.lineTo(PAD_L + pw, PAD_T + ph)
    ctx.stroke()

    // Y ticks
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const t = i / 4
      const y = PAD_T + ph - t * ph
      const value = yMin + t * ySpan
      ctx.fillText(value.toFixed(1), PAD_L - 6, y + 3)
      ctx.strokeStyle = '#1b2130'
      ctx.beginPath()
      ctx.moveTo(PAD_L, y)
      ctx.lineTo(PAD_L + pw, y)
      ctx.stroke()
    }

    // X ticks
    ctx.textAlign = 'center'
    for (let i = 0; i <= 4; i++) {
      const t = i / 4
      const x = PAD_L + t * pw
      const value = xMin + t * xSpan
      ctx.fillStyle = '#6b7280'
      ctx.fillText(value.toFixed(1), x, PAD_T + ph + 14)
      ctx.strokeStyle = '#1b2130'
      ctx.beginPath()
      ctx.moveTo(x, PAD_T)
      ctx.lineTo(x, PAD_T + ph)
      ctx.stroke()
    }

    // Series
    ctx.save()
    ctx.beginPath()
    ctx.rect(PAD_L, PAD_T, pw, ph)
    ctx.clip()
    this.series.forEach((s, i) => {
      const color = PALETTE[i % PALETTE.length]
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()

      s.points.forEach((p, idx) => {
        const x = PAD_L + ((p.x - xMin) / xSpan) * pw
        const y = PAD_T + ph - ((p.y - yMin) / ySpan) * ph
        if (idx === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      for (const p of s.points) {
        const x = PAD_L + ((p.x - xMin) / xSpan) * pw
        const y = PAD_T + ph - ((p.y - yMin) / ySpan) * ph
        ctx.beginPath()
        ctx.arc(x, y, 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    })

    if (this.timeline) {
      const clampedTime = clamp(this.currentTime, xMin, xMax)
      if (clampedTime >= xMin && clampedTime <= xMax) {
        const x = PAD_L + ((clampedTime - xMin) / xSpan) * pw
        ctx.strokeStyle = '#f8fafc'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x, PAD_T)
        ctx.lineTo(x, PAD_T + ph)
        ctx.stroke()
      }
    }
    ctx.restore()

    // Legend
    ctx.font = '11px monospace'
    ctx.textAlign = 'left'
    this.series.forEach((s, i) => {
      const color = PALETTE[i % PALETTE.length]
      const lx = PAD_L + i * 140
      const ly = h - 10
      ctx.fillStyle = color
      ctx.fillRect(lx, ly - 7, 10, 3)
      ctx.fillStyle = '#9ca3af'
      ctx.fillText(s.label, lx + 14, ly)
    })
  }

  private rebuildSeries(): void {
    const output: PlotSeries[] = []

    if (this.timeline) {
      output.push(...this.buildSeriesFromTimeline())
    }

    if (output.length === 0) {
      output.push(...this.buildSeriesFromSelectedEntities())
    }

    this.series = output
    this.viewBounds = null
  }

  private buildSeriesFromTimeline(): PlotSeries[] {
    if (!this.timeline) return []
    const output: PlotSeries[] = []

    for (const track of this.timeline.getTracks().values()) {
      if (track instanceof PropertyTrack) {
        if (this.selectedIds.length > 0 && !this.selectedIds.includes(track.targetId)) continue
        const points = track
          .getKeyframes()
          .map(kf => ({ x: kf.time, y: toFiniteOrNull(kf.value) }))
          .filter((p): p is SeriesPoint => p.y !== null)
        if (points.length > 0) {
          output.push({
            label: `${track.targetId}.${track.propName}`,
            points,
          })
        }
      } else if (track instanceof StepTrack) {
        const metricPoints = new Map<string, SeriesPoint[]>()

        for (const kf of track.getKeyframes()) {
          const stepValue = kf.value as StepData | undefined
          const payload = toRecord(stepValue?.payload)
          const metrics = toRecord(payload?.metrics)
          if (!metrics) continue

          for (const [name, raw] of Object.entries(metrics)) {
            const value = toFiniteOrNull(raw)
            if (value === null) continue
            if (!metricPoints.has(name)) metricPoints.set(name, [])
            metricPoints.get(name)?.push({ x: kf.time, y: value })
          }
        }

        const metricEntries = Array.from(metricPoints.entries()).sort(([a], [b]) => a.localeCompare(b))
        for (const [metricName, points] of metricEntries) {
          if (points.length === 0) continue
          output.push({
            label: `${track.processId ?? track.id}.${metricName}`,
            points,
          })
        }
      }
    }

    return output
  }

  private buildSeriesFromSelectedEntities(): PlotSeries[] {
    if (!this.graph || this.selectedIds.length === 0) return []

    const output: PlotSeries[] = []
    for (const id of this.selectedIds) {
      const entity = this.graph.getEntity(id)
      if (!entity) continue

      const numericEntries = Object.entries(entity.props)
        .map(([name, raw]) => ({ name, value: toFiniteOrNull(raw) }))
        .filter((entry): entry is { name: string; value: number } => entry.value !== null)
        .sort((a, b) => a.name.localeCompare(b.name))

      if (numericEntries.length === 0) continue
      output.push({
        label: id,
        points: numericEntries.map((entry, i) => ({ x: i, y: entry.value })),
      })
    }
    return output
  }

  private resolveEmptyMessage(): string {
    if (this.timeline) {
      return 'No numeric timeline tracks'
    }
    if (!this.graph || this.selectedIds.length === 0) {
      return 'Select nodes to plot numeric props'
    }
    return 'No numeric properties in current selection'
  }

  private drawMessage(text: string): void {
    const ctx = this.ctx
    const canvas = this.canvas
    if (!ctx || !canvas) return
    ctx.fillStyle = '#6b7280'
    ctx.font = '12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }

  private computeDataBounds(series: PlotSeries[]): PlotBounds | null {
    const allX = series.flatMap(s => s.points.map(p => p.x))
    const allY = series.flatMap(s => s.points.map(p => p.y))
    if (allX.length === 0 || allY.length === 0) return null

    const xMin = Math.min(...allX)
    const xMax = Math.max(...allX)
    const yMin = Math.min(...allY)
    const yMax = Math.max(...allY)

    const nx = normalizeRange(xMin, xMax)
    const ny = normalizeRange(yMin, yMax)
    return {
      xMin: nx.min,
      xMax: nx.max,
      yMin: ny.min,
      yMax: ny.max,
    }
  }

  private isInsidePlot(x: number, y: number): boolean {
    const rect = this.plotRect
    if (!rect) return false
    return x >= rect.left && x <= rect.left + rect.width && y >= rect.top && y <= rect.top + rect.height
  }

  private toDataCoord(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.canvas || !this.plotRect || !this.viewBounds) return null
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    if (!this.isInsidePlot(x, y)) return null

    const px = (x - this.plotRect.left) / this.plotRect.width
    const py = (y - this.plotRect.top) / this.plotRect.height
    const dataX = this.viewBounds.xMin + px * (this.viewBounds.xMax - this.viewBounds.xMin)
    const dataY = this.viewBounds.yMax - py * (this.viewBounds.yMax - this.viewBounds.yMin)
    return { x: dataX, y: dataY }
  }

  private onWheel = (event: WheelEvent): void => {
    if (!this.viewBounds || !this.dataBounds) return
    const data = this.toDataCoord(event.clientX, event.clientY)
    if (!data) return

    event.preventDefault()
    const factor = event.deltaY < 0 ? 0.9 : 1.1
    const next: PlotBounds = {
      xMin: data.x - (data.x - this.viewBounds.xMin) * factor,
      xMax: data.x + (this.viewBounds.xMax - data.x) * factor,
      yMin: data.y - (data.y - this.viewBounds.yMin) * factor,
      yMax: data.y + (this.viewBounds.yMax - data.y) * factor,
    }
    this.viewBounds = normalizeBounds(next)
    this.draw()
  }

  private onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !this.viewBounds) return
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (!this.isInsidePlot(x, y)) return

    this.dragState = {
      startX: x,
      startY: y,
      bounds: { ...this.viewBounds },
    }
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.dragState || !this.plotRect) return
    const bounds = this.dragState.bounds
    const spanX = bounds.xMax - bounds.xMin
    const spanY = bounds.yMax - bounds.yMin
    if (spanX <= 0 || spanY <= 0) return
    if (!this.canvas) return

    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const dx = x - this.dragState.startX
    const dy = y - this.dragState.startY

    const shiftX = (dx / this.plotRect.width) * spanX
    const shiftY = (dy / this.plotRect.height) * spanY
    this.viewBounds = normalizeBounds({
      xMin: bounds.xMin - shiftX,
      xMax: bounds.xMax - shiftX,
      yMin: bounds.yMin + shiftY,
      yMax: bounds.yMax + shiftY,
    })
    this.draw()
  }

  private onMouseUp = (): void => {
    this.dragState = null
  }

  private onDoubleClick = (event: MouseEvent): void => {
    if (!this.canvas || !this.dataBounds) return
    const rect = this.canvas.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    if (!this.isInsidePlot(x, y)) return
    this.viewBounds = { ...this.dataBounds }
    this.draw()
  }
}

function toFiniteOrNull(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null
  return value as Record<string, unknown>
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeBounds(bounds: PlotBounds): PlotBounds {
  const x = normalizeRange(bounds.xMin, bounds.xMax)
  const y = normalizeRange(bounds.yMin, bounds.yMax)
  return {
    xMin: x.min,
    xMax: x.max,
    yMin: y.min,
    yMax: y.max,
  }
}

function normalizeRange(min: number, max: number): { min: number; max: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 }
  }
  if (min > max) {
    const temp = min
    min = max
    max = temp
  }
  if (Math.abs(max - min) < MIN_SPAN) {
    const center = (min + max) / 2
    return { min: center - 0.5, max: center + 0.5 }
  }
  return { min, max }
}
