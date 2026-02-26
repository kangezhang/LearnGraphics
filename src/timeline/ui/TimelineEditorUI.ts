import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { StepTrack } from '@/timeline/runtime/StepTrack'
import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import { Track } from '@/timeline/runtime/Track'

const RULER_H = 24
const TRACK_H = 28
const LABEL_W = 120
const MARKER_COLOR = '#f5a623'
const PLAYHEAD_COLOR = '#4f8ef7'

export class TimelineEditorUI {
  private el: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private runtime: TimelineRuntime
  private unsub: (() => void)[] = []
  private _draggingMarkerIdx = -1
  private _draggingPlayhead = false
  private _pixelRatio = window.devicePixelRatio || 1

  constructor(runtime: TimelineRuntime) {
    this.runtime = runtime

    this.el = document.createElement('div')
    this.el.style.cssText = `
      width:100%;height:100%;overflow:hidden;background:#0b0e14;
      border-top:1px solid #1e2330;position:relative;
    `

    this.canvas = document.createElement('canvas')
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;cursor:default;'
    this.el.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas 2D not supported')
    this.ctx = ctx

    this.bindEvents()
    this.bindRuntime()
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el)
    this.resize()
  }

  resize(): void {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const pr = this._pixelRatio
    this.canvas.width = w * pr
    this.canvas.height = h * pr
    this.ctx.scale(pr, pr)
    this.draw()
  }

  dispose(): void {
    this.unsub.forEach(fn => fn())
    this.unsub = []
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private draw(): void {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const pr = this._pixelRatio
    this.ctx.setTransform(pr, 0, 0, pr, 0, 0)
    this.ctx.clearRect(0, 0, w, h)

    this.drawRuler(w)
    this.drawTracks(w, h)
    this.drawMarkers(w)
    this.drawPlayhead(w, h)
  }

  private drawRuler(w: number): void {
    const ctx = this.ctx
    const dur = this.runtime.duration
    const trackW = w - LABEL_W

    // ruler background
    ctx.fillStyle = '#111520'
    ctx.fillRect(LABEL_W, 0, trackW, RULER_H)

    // tick marks
    ctx.fillStyle = '#2a3045'
    ctx.fillRect(LABEL_W, RULER_H - 1, trackW, 1)

    const step = this.niceStep(dur, trackW / 60)
    ctx.fillStyle = '#4a5568'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'

    for (let t = 0; t <= dur + 1e-9; t += step) {
      const x = LABEL_W + (t / dur) * trackW
      const isMajor = Math.round(t / step) % 5 === 0
      const tickH = isMajor ? 8 : 4
      ctx.fillStyle = isMajor ? '#4a5568' : '#2a3045'
      ctx.fillRect(x, RULER_H - tickH, 1, tickH)
      if (isMajor) {
        ctx.fillStyle = '#6b7280'
        ctx.fillText(`${t.toFixed(t < 10 ? 1 : 0)}s`, x, RULER_H - 10)
      }
    }

    // label area header
    ctx.fillStyle = '#0b0e14'
    ctx.fillRect(0, 0, LABEL_W, RULER_H)
    ctx.fillStyle = '#4a5568'
    ctx.fillRect(LABEL_W - 1, 0, 1, RULER_H)
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('TRACKS', 8, 15)
  }

  private drawTracks(w: number, h: number): void {
    const ctx = this.ctx
    const dur = this.runtime.duration
    const trackW = w - LABEL_W
    const tracks = Array.from(this.runtime.getTracks().values())

    tracks.forEach((track, i) => {
      const y = RULER_H + i * TRACK_H
      if (y + TRACK_H > h) return

      // row background
      ctx.fillStyle = i % 2 === 0 ? '#0d1018' : '#0b0e14'
      ctx.fillRect(0, y, w, TRACK_H)

      // label
      ctx.fillStyle = '#4a5568'
      ctx.fillRect(LABEL_W - 1, y, 1, TRACK_H)
      ctx.fillStyle = '#9ca3af'
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(this.trackLabel(track), 8, y + TRACK_H / 2 + 4)

      // type badge
      const badgeColor = this.trackBadgeColor(track.type)
      ctx.fillStyle = badgeColor
      ctx.fillRect(LABEL_W - 4, y + 8, 3, TRACK_H - 16)

      // keyframes
      for (const kf of track.getKeyframes()) {
        const x = LABEL_W + (kf.time / dur) * trackW
        const cy = y + TRACK_H / 2
        this.drawDiamond(ctx, x, cy, 5, badgeColor)
      }
    })

    // fill remaining area
    const usedH = RULER_H + tracks.length * TRACK_H
    if (usedH < h) {
      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(0, usedH, w, h - usedH)
    }
  }

  private drawMarkers(w: number): void {
    const ctx = this.ctx
    const dur = this.runtime.duration
    const trackW = w - LABEL_W
    const h = this.el.clientHeight

    for (const marker of this.runtime.getMarkers()) {
      const x = LABEL_W + (marker.time / dur) * trackW
      const color = marker.color ?? MARKER_COLOR

      // vertical line
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.6
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath()
      ctx.moveTo(x, RULER_H)
      ctx.lineTo(x, h)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.globalAlpha = 1

      // flag on ruler
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x, 2)
      ctx.lineTo(x + 8, 2)
      ctx.lineTo(x + 8, 10)
      ctx.lineTo(x + 4, 14)
      ctx.lineTo(x, 10)
      ctx.closePath()
      ctx.fill()

      // label
      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(marker.label, x + 2, 9)
    }
  }

  private drawPlayhead(w: number, h: number): void {
    const ctx = this.ctx
    const dur = this.runtime.duration
    const trackW = w - LABEL_W
    const x = LABEL_W + (this.runtime.time / dur) * trackW

    // line
    ctx.strokeStyle = PLAYHEAD_COLOR
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()

    // head triangle
    ctx.fillStyle = PLAYHEAD_COLOR
    ctx.beginPath()
    ctx.moveTo(x - 5, 0)
    ctx.lineTo(x + 5, 0)
    ctx.lineTo(x, 8)
    ctx.closePath()
    ctx.fill()
  }

  private drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
    ctx.fillStyle = color
    ctx.strokeStyle = '#0b0e14'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + r, y)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - r, y)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  // ── Interaction ───────────────────────────────────────────────────────────

  private bindEvents(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown)
    this.canvas.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    this.canvas.addEventListener('dblclick', this.onDblClick)

    const ro = new ResizeObserver(() => this.resize())
    ro.observe(this.el)
    this.unsub.push(() => ro.disconnect())
  }

  private onMouseDown = (e: MouseEvent): void => {
    const { x, t } = this.eventToTime(e)
    if (x < LABEL_W) return

    // check playhead hit
    const dur = this.runtime.duration
    const trackW = this.el.clientWidth - LABEL_W
    const phX = LABEL_W + (this.runtime.time / dur) * trackW
    if (Math.abs(e.offsetX - phX) < 8) {
      this._draggingPlayhead = true
      return
    }

    // check marker hit (ruler area)
    if (e.offsetY < RULER_H) {
      const idx = this.markerAtTime(t)
      if (idx >= 0) {
        this._draggingMarkerIdx = idx
        return
      }
    }

    // click on track area → seek
    this.runtime.seek(t)
  }

  private onMouseMove = (e: MouseEvent): void => {
    const { t } = this.eventToTime(e)
    if (this._draggingPlayhead) {
      this.runtime.seek(t)
    } else if (this._draggingMarkerIdx >= 0) {
      const markers = this.runtime.getMarkers() as Array<{ time: number; label: string; description?: string; color?: string }>
      markers[this._draggingMarkerIdx].time = Math.max(0, Math.min(this.runtime.duration, t))
      this.draw()
    }

    // cursor
    const dur = this.runtime.duration
    const trackW = this.el.clientWidth - LABEL_W
    const phX = LABEL_W + (this.runtime.time / dur) * trackW
    if (Math.abs(e.offsetX - phX) < 8) {
      this.canvas.style.cursor = 'ew-resize'
    } else if (e.offsetY < RULER_H && this.markerAtTime(this.eventToTime(e).t) >= 0) {
      this.canvas.style.cursor = 'grab'
    } else {
      this.canvas.style.cursor = 'default'
    }
  }

  private onMouseUp = (): void => {
    this._draggingPlayhead = false
    this._draggingMarkerIdx = -1
  }

  private onDblClick = (e: MouseEvent): void => {
    if (e.offsetY >= RULER_H || e.offsetX < LABEL_W) return
    const { t } = this.eventToTime(e)
    const label = prompt('Marker label:', `t=${t.toFixed(2)}s`)
    if (label !== null) {
      this.runtime.addMarker({ time: t, label })
      this.draw()
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private eventToTime(e: MouseEvent): { x: number; t: number } {
    const x = e.offsetX
    const trackW = this.el.clientWidth - LABEL_W
    const t = Math.max(0, Math.min(this.runtime.duration, ((x - LABEL_W) / trackW) * this.runtime.duration))
    return { x, t }
  }

  private markerAtTime(t: number): number {
    const markers = this.runtime.getMarkers()
    const dur = this.runtime.duration
    const trackW = this.el.clientWidth - LABEL_W
    const px = (t / dur) * trackW
    for (let i = 0; i < markers.length; i++) {
      const mx = (markers[i].time / dur) * trackW
      if (Math.abs(mx - px) < 8) return i
    }
    return -1
  }

  private niceStep(dur: number, minPx: number): number {
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]
    const trackW = this.el.clientWidth - LABEL_W
    for (const s of steps) {
      if ((s / dur) * trackW >= minPx) return s
    }
    return steps[steps.length - 1]
  }

  private trackLabel(track: Track): string {
    if (track instanceof StepTrack) return `step: ${track.id}`
    if (track instanceof PropertyTrack) return `prop: ${track.id}`
    return `${track.type}: ${track.id}`
  }

  private trackBadgeColor(type: string): string {
    switch (type) {
      case 'step': return '#4f8ef7'
      case 'property': return '#10b981'
      case 'event': return '#f59e0b'
      case 'state': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  private bindRuntime(): void {
    this.unsub.push(
      this.runtime.on({ type: 'tick', handler: () => this.draw() })
    )
  }
}
