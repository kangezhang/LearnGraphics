import { Track } from './Track'

/** Tracks a numeric or string property over time with interpolation */
export class PropertyTrack extends Track<number | string> {
  readonly targetId: string
  readonly propName: string

  constructor(id: string, targetId: string, propName: string) {
    super(id, 'property')
    this.targetId = targetId
    this.propName = propName
  }

  evaluate(time: number): number | string | undefined {
    if (this.keyframes.length === 0) return undefined
    const [prev, next] = this.findSurrounding(time)
    if (!prev) return this.keyframes[0].value
    if (!next) return prev.value

    // string values: step at prev
    if (typeof prev.value === 'string') return prev.value

    const t = (time - prev.time) / (next.time - prev.time)
    const eased = this.applyEasing(t, prev.easing ?? 'linear')
    return (prev.value as number) + ((next.value as number) - (prev.value as number)) * eased
  }

  private applyEasing(t: number, easing: string): number {
    switch (easing) {
      case 'step': return t < 1 ? 0 : 1
      case 'ease-in': return t * t
      case 'ease-out': return t * (2 - t)
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      default: return t
    }
  }
}
