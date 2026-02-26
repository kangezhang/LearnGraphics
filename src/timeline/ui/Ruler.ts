export interface RulerDrawOptions {
  ctx: CanvasRenderingContext2D
  width: number
  labelWidth: number
  height: number
  duration: number
}

export class Ruler {
  draw(opts: RulerDrawOptions): void {
    const { ctx, width, labelWidth, height, duration } = opts
    const trackW = Math.max(0, width - labelWidth)

    // ruler background
    ctx.fillStyle = '#111520'
    ctx.fillRect(labelWidth, 0, trackW, height)

    // bottom border
    ctx.fillStyle = '#2a3045'
    ctx.fillRect(labelWidth, height - 1, trackW, 1)

    if (duration > 0 && trackW > 0) {
      const step = this.niceStep(duration, trackW / 60, trackW)
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'

      for (let t = 0; t <= duration + 1e-9; t += step) {
        const x = labelWidth + (t / duration) * trackW
        const isMajor = Math.round(t / step) % 5 === 0
        const tickH = isMajor ? 8 : 4
        ctx.fillStyle = isMajor ? '#4a5568' : '#2a3045'
        ctx.fillRect(x, height - tickH, 1, tickH)
        if (isMajor) {
          ctx.fillStyle = '#6b7280'
          ctx.fillText(`${t.toFixed(t < 10 ? 1 : 0)}s`, x, height - 10)
        }
      }
    }

    // label area header
    ctx.fillStyle = '#0b0e14'
    ctx.fillRect(0, 0, labelWidth, height)
    ctx.fillStyle = '#4a5568'
    ctx.fillRect(labelWidth - 1, 0, 1, height)
    ctx.fillStyle = '#6b7280'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    ctx.fillText('TRACKS', 8, 15)
  }

  private niceStep(dur: number, minPx: number, trackW: number): number {
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60]
    for (const s of steps) {
      if ((s / dur) * trackW >= minPx) return s
    }
    return steps[steps.length - 1]
  }
}
