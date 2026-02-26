import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import { StepTrack } from '@/timeline/runtime/StepTrack'
import type { Track } from '@/timeline/runtime/Track'

export interface KeyframeRef {
  trackId: string
  keyIndex: number
}

export interface TrackListDrawOptions {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  labelWidth: number
  rowHeight: number
  rulerHeight: number
  duration: number
  tracks: Track[]
  activeKeyframe: KeyframeRef | null
}

const KEYFRAME_HIT_X = 7
const KEYFRAME_HIT_Y = 8

export class TrackList {
  draw(opts: TrackListDrawOptions): void {
    const {
      ctx, width, height, labelWidth, rowHeight, rulerHeight, duration, tracks, activeKeyframe,
    } = opts

    tracks.forEach((track, i) => {
      const y = rulerHeight + i * rowHeight
      if (y + rowHeight > height) return

      ctx.fillStyle = i % 2 === 0 ? '#0d1018' : '#0b0e14'
      ctx.fillRect(0, y, width, rowHeight)

      ctx.fillStyle = '#4a5568'
      ctx.fillRect(labelWidth - 1, y, 1, rowHeight)
      ctx.fillStyle = '#9ca3af'
      ctx.font = '11px monospace'
      ctx.textAlign = 'left'
      ctx.fillText(this.trackLabel(track), 8, y + rowHeight / 2 + 4)

      const badgeColor = this.trackBadgeColor(track.type)
      ctx.fillStyle = badgeColor
      ctx.fillRect(labelWidth - 4, y + 8, 3, rowHeight - 16)

      for (const [keyIndex, kf] of track.getKeyframes().entries()) {
        const x = this.timeToX(kf.time, labelWidth, width, duration)
        const cy = y + rowHeight / 2
        const isActive = activeKeyframe?.trackId === track.id && activeKeyframe.keyIndex === keyIndex
        this.drawDiamond(
          ctx,
          x,
          cy,
          isActive ? 6 : 5,
          isActive ? '#ffffff' : badgeColor,
          isActive ? '#4f8ef7' : '#0b0e14'
        )
      }
    })

    const usedH = rulerHeight + tracks.length * rowHeight
    if (usedH < height) {
      ctx.fillStyle = '#0b0e14'
      ctx.fillRect(0, usedH, width, height - usedH)
    }
  }

  hitTestKeyframe(
    x: number,
    y: number,
    opts: Omit<TrackListDrawOptions, 'ctx' | 'activeKeyframe'>
  ): KeyframeRef | null {
    const { width, labelWidth, rowHeight, rulerHeight, duration, tracks } = opts
    if (x < labelWidth || y < rulerHeight) return null

    const row = Math.floor((y - rulerHeight) / rowHeight)
    const track = tracks[row]
    if (!track) return null

    const cy = rulerHeight + row * rowHeight + rowHeight / 2
    for (const [keyIndex, kf] of track.getKeyframes().entries()) {
      const kx = this.timeToX(kf.time, labelWidth, width, duration)
      if (Math.abs(kx - x) <= KEYFRAME_HIT_X && Math.abs(cy - y) <= KEYFRAME_HIT_Y) {
        return { trackId: track.id, keyIndex }
      }
    }
    return null
  }

  private drawDiamond(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    stroke = '#0b0e14'
  ): void {
    ctx.fillStyle = color
    ctx.strokeStyle = stroke
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

  private timeToX(time: number, labelWidth: number, width: number, duration: number): number {
    const trackW = width - labelWidth
    if (trackW <= 0 || duration <= 0) return labelWidth
    return labelWidth + (time / duration) * trackW
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
}
