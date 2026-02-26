import {
  TimelineRuntime,
  type PlayState,
  type SerializedTimeline,
} from '@/timeline/runtime/TimelineRuntime'
import { StepTrack } from '@/timeline/runtime/StepTrack'
import { buildTimelineReplacePatch } from '@/dsl/patch/TimelinePatch'
import { fromDSLTimeline, toDSLTimeline, type DSLTimeline } from '@/dsl/timeline/TimelineDSL'

const BTN = `
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;border:none;border-radius:4px;cursor:pointer;
  background:#1e2330;color:#c8cdd8;font-size:14px;
  transition:background 0.15s;
`

export class TimelineBar {
  private static readonly STORAGE_KEY = 'learn-graphics.timeline'

  private el: HTMLElement
  private playBtn: HTMLButtonElement
  private stopBtn: HTMLButtonElement
  private prevBtn: HTMLButtonElement
  private nextBtn: HTMLButtonElement
  private saveBtn: HTMLButtonElement
  private loadBtn: HTMLButtonElement
  private exportDslBtn: HTMLButtonElement
  private importDslBtn: HTMLButtonElement
  private patchBtn: HTMLButtonElement
  private expandBtn: HTMLButtonElement
  private scrubber: HTMLInputElement
  private timeLabel: HTMLSpanElement
  private stepLabel: HTMLSpanElement
  private importDslInput: HTMLInputElement
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
    this.saveBtn = this.makeBtn('💾', 'Save timeline')
    this.loadBtn = this.makeBtn('⭳', 'Load timeline')
    this.exportDslBtn = this.makeBtn('📄', 'Export DSL timeline')
    this.importDslBtn = this.makeBtn('📥', 'Import DSL timeline')
    this.patchBtn = this.makeBtn('🧩', 'Export timeline patch')
    this.expandBtn = this.makeBtn('▲', 'Expand timeline')

    this.importDslInput = document.createElement('input')
    this.importDslInput.type = 'file'
    this.importDslInput.accept = '.json,application/json'
    this.importDslInput.style.display = 'none'

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

    this.el.append(
      this.prevBtn,
      this.stopBtn,
      this.playBtn,
      this.nextBtn,
      this.saveBtn,
      this.loadBtn,
      this.exportDslBtn,
      this.importDslBtn,
      this.patchBtn,
      this.scrubber,
      this.timeLabel,
      this.stepLabel,
      this.expandBtn
    )

    this.bindEvents()
    this.bindRuntime()
  }

  mount(container: HTMLElement): void {
    container.appendChild(this.el)
  }

  dispose(): void {
    this.unsub.forEach(fn => fn())
    this.unsub = []
    this.importDslInput.removeEventListener('change', this.onImportDSLChange)
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el)
    }
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
    this.saveBtn.addEventListener('click', () => this.saveTimeline())
    this.loadBtn.addEventListener('click', () => this.loadTimeline())
    this.exportDslBtn.addEventListener('click', () => this.exportDSLTimeline())
    this.importDslBtn.addEventListener('click', () => this.importDslInput.click())
    this.importDslInput.addEventListener('change', this.onImportDSLChange)
    this.patchBtn.addEventListener('click', () => this.exportTimelinePatch())

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

  private saveTimeline(): void {
    try {
      const data = this.runtime.serialize()
      localStorage.setItem(TimelineBar.STORAGE_KEY, JSON.stringify(data))
      this.flashButton(this.saveBtn, '✓')
    } catch (err) {
      console.error('Failed to save timeline:', err)
      alert('Save failed. See console for details.')
    }
  }

  private loadTimeline(): void {
    try {
      const raw = localStorage.getItem(TimelineBar.STORAGE_KEY)
      if (!raw) {
        alert('No saved timeline found.')
        return
      }
      const data = JSON.parse(raw) as SerializedTimeline
      this.runtime.applySerialized(data)
      this.flashButton(this.loadBtn, '✓')
    } catch (err) {
      console.error('Failed to load timeline:', err)
      alert('Load failed. Saved data may be invalid.')
    }
  }

  private exportDSLTimeline(): void {
    const timeline = toDSLTimeline(this.runtime.serialize())
    const output = { timeline }
    const blob = new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'lesson.timeline.json'
    anchor.click()
    URL.revokeObjectURL(url)
    this.flashButton(this.exportDslBtn, '✓')
  }

  private onImportDSLChange = async (): Promise<void> => {
    const file = this.importDslInput.files?.[0]
    this.importDslInput.value = ''
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      const timeline = this.extractDSLTimeline(parsed)
      if (!timeline) {
        alert('Invalid DSL timeline JSON.')
        return
      }
      const serialized = fromDSLTimeline(timeline)
      this.runtime.applySerialized(serialized)
      this.flashButton(this.importDslBtn, '✓')
    } catch (err) {
      console.error('Failed to import DSL timeline:', err)
      alert('Import failed. Please check JSON format.')
    }
  }

  private extractDSLTimeline(raw: unknown): DSLTimeline | null {
    if (typeof raw !== 'object' || raw === null) return null
    const record = raw as Record<string, unknown>
    if ('timeline' in record && typeof record.timeline === 'object' && record.timeline !== null) {
      const nested = record.timeline as Record<string, unknown>
      if (typeof nested.duration === 'number') {
        return nested as unknown as DSLTimeline
      }
      return null
    }
    if (typeof record.duration === 'number' && (('tracks' in record) || ('markers' in record))) {
      return record as unknown as DSLTimeline
    }
    return null
  }

  private exportTimelinePatch(): void {
    const timeline = toDSLTimeline(this.runtime.serialize())
    const patch = buildTimelineReplacePatch(timeline)
    const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'timeline.patch.json'
    anchor.click()
    URL.revokeObjectURL(url)
    this.flashButton(this.patchBtn, '✓')
  }

  private flashButton(btn: HTMLButtonElement, text: string): void {
    const original = btn.textContent ?? ''
    btn.textContent = text
    window.setTimeout(() => {
      btn.textContent = original
    }, 550)
  }
}
