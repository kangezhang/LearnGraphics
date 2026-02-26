import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import { Track } from '@/timeline/runtime/Track'
import { Ruler } from '@/timeline/ui/Ruler'
import { TrackList, type KeyframeRef } from '@/timeline/ui/TrackList'

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
  private _draggingKeyframe: KeyframeRef | null = null
  private _activeKeyframe: KeyframeRef | null = null
  private _pixelRatio = window.devicePixelRatio || 1
  private ruler = new Ruler()
  private trackList = new TrackList()

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
    if (this.el.parentElement && this.el.parentElement !== container) {
      this.el.parentElement.removeChild(this.el)
    }
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

    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('dblclick', this.onDblClick)
    window.removeEventListener('mouseup', this.onMouseUp)

    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el)
    }
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  private draw(): void {
    const w = this.el.clientWidth
    const h = this.el.clientHeight
    const pr = this._pixelRatio
    this.ctx.setTransform(pr, 0, 0, pr, 0, 0)
    this.ctx.clearRect(0, 0, w, h)

    this.ruler.draw({
      ctx: this.ctx,
      width: w,
      labelWidth: LABEL_W,
      height: RULER_H,
      duration: this.runtime.duration,
    })

    this.trackList.draw({
      ctx: this.ctx,
      width: w,
      height: h,
      labelWidth: LABEL_W,
      rowHeight: TRACK_H,
      rulerHeight: RULER_H,
      duration: this.runtime.duration,
      tracks: this.getTracks(),
      activeKeyframe: this._activeKeyframe,
    })

    this.drawMarkers()
    this.drawPlayhead(h)
  }

  private drawMarkers(): void {
    const ctx = this.ctx
    const h = this.el.clientHeight

    for (const marker of this.runtime.getMarkers()) {
      const x = this.timeToX(marker.time)
      const color = marker.color ?? MARKER_COLOR

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

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x, 2)
      ctx.lineTo(x + 8, 2)
      ctx.lineTo(x + 8, 10)
      ctx.lineTo(x + 4, 14)
      ctx.lineTo(x, 10)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(marker.label, x + 2, 9)
    }
  }

  private drawPlayhead(h: number): void {
    const ctx = this.ctx
    const x = this.timeToX(this.runtime.time)

    ctx.strokeStyle = PLAYHEAD_COLOR
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()

    ctx.fillStyle = PLAYHEAD_COLOR
    ctx.beginPath()
    ctx.moveTo(x - 5, 0)
    ctx.lineTo(x + 5, 0)
    ctx.lineTo(x, 8)
    ctx.closePath()
    ctx.fill()
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

    const phX = this.timeToX(this.runtime.time)
    if (Math.abs(e.offsetX - phX) < 8) {
      this._draggingPlayhead = true
      return
    }

    if (e.offsetY < RULER_H) {
      const idx = this.markerAtTime(t)
      if (idx >= 0) {
        this._draggingMarkerIdx = idx
        return
      }
    }

    const keyframeRef = this.keyframeAtPosition(e.offsetX, e.offsetY)
    if (keyframeRef) {
      this._draggingKeyframe = keyframeRef
      this._activeKeyframe = keyframeRef
      const track = this.findTrackById(keyframeRef.trackId)
      const kf = track?.getKeyframes()[keyframeRef.keyIndex]
      if (kf) this.runtime.seek(kf.time)
      this.draw()
      return
    }

    this._activeKeyframe = null
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
    } else if (this._draggingKeyframe) {
      const track = this.findTrackById(this._draggingKeyframe.trackId)
      const keyframes = track?.getKeyframes()
      const draggingKf = keyframes?.[this._draggingKeyframe.keyIndex]
      if (!track || !keyframes || !draggingKf) return

      draggingKf.time = Math.max(0, Math.min(this.runtime.duration, t))
      this.normalizeTrackKeyframes(track)

      const nextIndex = keyframes.indexOf(draggingKf)
      if (nextIndex >= 0) {
        this._draggingKeyframe.keyIndex = nextIndex
        this._activeKeyframe = { ...this._draggingKeyframe }
      }
      this.runtime.seek(draggingKf.time)
      this.draw()
    }

    const phX = this.timeToX(this.runtime.time)
    const hoveringKeyframe = this.keyframeAtPosition(e.offsetX, e.offsetY)
    if (this._draggingKeyframe) {
      this.canvas.style.cursor = 'grabbing'
    } else if (Math.abs(e.offsetX - phX) < 8) {
      this.canvas.style.cursor = 'ew-resize'
    } else if (e.offsetY < RULER_H && this.markerAtTime(this.eventToTime(e).t) >= 0) {
      this.canvas.style.cursor = 'grab'
    } else if (hoveringKeyframe) {
      this.canvas.style.cursor = 'pointer'
    } else {
      this.canvas.style.cursor = 'default'
    }
  }

  private onMouseUp = (): void => {
    this._draggingPlayhead = false
    this._draggingMarkerIdx = -1
    this._draggingKeyframe = null
  }

  private onDblClick = (e: MouseEvent): void => {
    if (e.offsetX < LABEL_W) return

    if (e.offsetY < RULER_H) {
      const { t } = this.eventToTime(e)
      const label = prompt('Marker label:', `t=${t.toFixed(2)}s`)
      if (label !== null) {
        this.runtime.addMarker({ time: t, label })
        this.draw()
      }
      return
    }

    const keyframeRef = this.keyframeAtPosition(e.offsetX, e.offsetY)
    if (keyframeRef) {
      this.editKeyframe(keyframeRef)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private eventToTime(e: MouseEvent): { x: number; t: number } {
    const x = e.offsetX
    const t = this.xToTime(x)
    return { x, t }
  }

  private markerAtTime(t: number): number {
    const markers = this.runtime.getMarkers()
    const px = this.timeToX(t)
    for (let i = 0; i < markers.length; i++) {
      const mx = this.timeToX(markers[i].time)
      if (Math.abs(mx - px) < 8) return i
    }
    return -1
  }

  private keyframeAtPosition(x: number, y: number): KeyframeRef | null {
    return this.trackList.hitTestKeyframe(x, y, {
      width: this.el.clientWidth,
      height: this.el.clientHeight,
      labelWidth: LABEL_W,
      rowHeight: TRACK_H,
      rulerHeight: RULER_H,
      duration: this.runtime.duration,
      tracks: this.getTracks(),
    })
  }

  private editKeyframe(ref: KeyframeRef): void {
    const track = this.findTrackById(ref.trackId)
    if (!track) return
    const keyframes = track.getKeyframes()
    const kf = keyframes[ref.keyIndex]
    if (!kf) return

    const timeInput = prompt('Keyframe time (seconds):', kf.time.toFixed(2))
    if (timeInput === null) return
    const nextTime = Number(timeInput)
    if (!Number.isFinite(nextTime)) {
      alert('Invalid time value.')
      return
    }

    if (track instanceof PropertyTrack) {
      const valueInput = prompt('Property value:', String(kf.value))
      if (valueInput === null) return
      if (typeof kf.value === 'number') {
        const num = Number(valueInput)
        if (!Number.isFinite(num)) {
          alert('Invalid numeric value.')
          return
        }
        kf.value = num
      } else {
        kf.value = valueInput
      }
    } else {
      const valueInput = prompt('Keyframe value JSON:', JSON.stringify(kf.value))
      if (valueInput === null) return
      try {
        kf.value = JSON.parse(valueInput) as never
      } catch {
        alert('Invalid JSON value.')
        return
      }
    }

    kf.time = Math.max(0, Math.min(this.runtime.duration, nextTime))
    this.normalizeTrackKeyframes(track)
    this._activeKeyframe = {
      trackId: ref.trackId,
      keyIndex: Math.max(0, track.getKeyframes().indexOf(kf)),
    }
    this.runtime.seek(kf.time)
    this.draw()
  }

  private findTrackById(id: string): Track | undefined {
    return this.runtime.getTrack(id)
  }

  private normalizeTrackKeyframes(track: Track): void {
    const keyframes = track.getKeyframes()
    for (const kf of keyframes) {
      kf.time = Math.max(0, Math.min(this.runtime.duration, kf.time))
    }
    keyframes.sort((a, b) => a.time - b.time)
  }

  private xToTime(x: number): number {
    const trackW = this.el.clientWidth - LABEL_W
    if (trackW <= 0 || this.runtime.duration <= 0) return 0
    return Math.max(0, Math.min(this.runtime.duration, ((x - LABEL_W) / trackW) * this.runtime.duration))
  }

  private timeToX(time: number): number {
    const trackW = this.el.clientWidth - LABEL_W
    if (trackW <= 0 || this.runtime.duration <= 0) return LABEL_W
    return LABEL_W + (time / this.runtime.duration) * trackW
  }

  private getTracks(): Track[] {
    return Array.from(this.runtime.getTracks().values())
  }

  private bindRuntime(): void {
    this.unsub.push(
      this.runtime.on({ type: 'tick', handler: () => this.draw() })
    )
  }
}
