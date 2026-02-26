import { TimelineRuntime, type PlayState } from '@/timeline/runtime/TimelineRuntime'
import { StepTrack } from '@/timeline/runtime/StepTrack'

const BTN = `
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;
  background:#1e2330;color:#c8cdd8;font-size:14px;
  transition:background 0.15s;
`

export class TimelineBar {
  private el: HTMLElement
  private playBtn: HTMLButtonElement
  private stopBtn: HTMLButtonElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement
  private expandBtn: HTMLButtonElement
  private scrubber: HTMLInputElement
  private timeLabel: HTMLSpanElement
  private stepLabel: HTMLSpanElement
  private runtime: TimelineRuntime
  private unsub: (() => void)[] = []
  private _expanded = false
  private _onToggle: (() => void) | null = null

  constructor(runtime: TimelineRuntime, onToggle?: () => void) {
    this.runtime = runtime
    this._onToggle = onToggle ?? null
    this.el = document.createElement('div')
    this.el.style.cssText = `
      display:flex;align-items:center;gap:8px;padding:0 12px;
      height:100%;background:#0b0e14;border-top:1px solid #1e2330;
      user-select:none;
    `

    this.prevBtn = this.makeBtn('⏮', 'Previous step')
    this.stopBtn = this.makeBtn('⏹', 'Stop')
    this.playBtn = this.makeBtn('▶', 'Play')
    this.nextBtn = this.makeBtn('⏭', 'Next step')
    this.expandBtn = this.makeBtn('▲', 'Expand timeline')

    this.scrubber = document.createElement('input')
    this.scrubber.type = 'range'
    this.scrubber.min = '0'
    this.scrubber.max = '1000'
    this.scrubber.value = '0'
    this.scrubber.style.cssText = 'flex:1;accent-color:#4f8ef7;cursor:pointer;height:4px;'

    this.timeLabel = document.createElement('span')
    this.timeLabel.style.cssText = 'color:#6b7280;font-size:11px;font-family:monospace;min-width:48px;text-align:right;'
    this.timeLabel.textContent = '0.00s'

    this.stepLabel = document.createElement('span')
    this.stepLabel.style.cssText = 'color:#4f8ef7;font-size:11px;font-family:monospace;min-width:40px;'
    this.stepLabel.textContent = ''

    this.el.append(this.prevBtn, this.stopBtn, this.playBtn, this.nextBtn, this.scrubber, this.timeLabel, this.stepLabel, this.expandBtn)

    this.bindEvents()
    this.bindRuntime()
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el)
  }

  dispose(): void {
    this.unsub.forEach(fn => fn())
    this.unsub = []
  }

  private makeBtn(icon: string, title: string): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.textContent = icon
    btn.title = title
    btn.style.cssText = BTN
    btn.addEventListener('mouseenter', () => { btn.style.background = '#2a3045' })
    btn.addEventListener('mouseleave', () => { btn.style.background = '#1e2330' })
    return btn
  }

  private bindEvents(): void {
    this.playBtn.addEventListener('click', () => {
      if (this.runtime.state === 'playing') this.runtime.pause()
      else this.runtime.play()
    })
    this.stopBtn.addEventListener('click', () => this.runtime.stop())
    this.prevBtn.addEventListener('click', () => this.runtime.stepBackward())
    this.nextBtn.addEventListener('click', () => this.runtime.stepForward())

    this.scrubber.addEventListener('input', () => {
      const t = (Number(this.scrubber.value) / 1000) * this.runtime.duration
      this.runtime.seek(t)
    })

    this.expandBtn.addEventListener('click', () => {
      this._expanded = !this._expanded
      this.expandBtn.textContent = this._expanded ? '▼' : '▲'
      this.expandBtn.title = this._expanded ? 'Collapse timeline' : 'Expand timeline'
      this._onToggle?.()
    })
  }

  private bindRuntime(): void {
    this.unsub.push(
      this.runtime.on({
        type: 'tick',
        handler: (time) => {
          const pct = this.runtime.duration > 0 ? (time / this.runtime.duration) * 1000 : 0
          this.scrubber.value = String(Math.round(pct))
          this.timeLabel.textContent = `${time.toFixed(2)}s`

          // show active step if any StepTrack present
          const stepTrack = this.runtime.getTrack('steps')
          if (stepTrack) {
            const step = (stepTrack as StepTrack).evaluate(time)
            if (step) this.stepLabel.textContent = `S${step.index + 1}`
          }
        }
      }),
      this.runtime.on({
        type: 'stateChange',
        handler: (state: PlayState) => {
          this.playBtn.textContent = state === 'playing' ? '⏸' : '▶'
          this.playBtn.title = state === 'playing' ? 'Pause' : 'Play'
        }
      })
    )
  }
}
