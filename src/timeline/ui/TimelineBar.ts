import {
  TimelineRuntime,
  type TimelineMarker,
  type PlayState,
  type SerializedTimeline,
} from '@/timeline/runtime/TimelineRuntime'
import { StepTrack, type StepData } from '@/timeline/runtime/StepTrack'
import { buildTimelineReplacePatch } from '@/dsl/patch/TimelinePatch'
import { fromDSLTimeline, toDSLTimeline, type DSLTimeline } from '@/dsl/timeline/TimelineDSL'

const BTN = `
  display:inline-flex;align-items:center;justify-content:center;
  width:28px;height:28px;padding:0;border:none;border-radius:4px;cursor:pointer;
  background:#1e2330;color:#c8cdd8;font-size:0;line-height:0;
  transition:background 0.15s;
`

type IconName =
  | 'step-prev'
  | 'stop'
  | 'play'
  | 'pause'
  | 'step-next'
  | 'save'
  | 'load'
  | 'export-dsl'
  | 'import-dsl'
  | 'patch'
  | 'expand'
  | 'collapse'
  | 'check'

const ICONS: Record<IconName, string> = {
  'step-prev':
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 6v12"/><path d="m17 6-7 6 7 6z" fill="currentColor" stroke="none"/></svg>',
  stop:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/></svg>',
  play:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m8 6 10 6-10 6z" fill="currentColor" stroke="none"/></svg>',
  pause:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="6" width="4" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="6" width="4" height="12" rx="1" fill="currentColor" stroke="none"/></svg>',
  'step-next':
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 6v12"/><path d="m7 6 7 6-7 6z" fill="currentColor" stroke="none"/></svg>',
  save:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4"/><path d="M8 19v-5h8v5"/></svg>',
  load:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8V4h4"/><path d="M6 4a8 8 0 1 1-1 11"/></svg>',
  'export-dsl':
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="m20 4-8 8"/><path d="M4 8v12h12"/></svg>',
  'import-dsl':
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 15v4h14v-4"/><path d="M12 5v10"/><path d="m8 11 4 4 4-4"/></svg>',
  patch:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 8V6a2 2 0 1 1 4 0v2"/><path d="M12 8h4a2 2 0 1 1 0 4h-2"/><path d="M12 16v2a2 2 0 1 1-4 0v-2"/><path d="M8 12H6a2 2 0 1 1 0-4h2"/></svg>',
  expand:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  collapse:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4 10-10"/></svg>',
}

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
  private guideLabel: HTMLSpanElement
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

    this.prevBtn = this.makeBtn('step-prev', 'Previous step')
    this.stopBtn = this.makeBtn('stop', 'Stop')
    this.playBtn = this.makeBtn('play', 'Play')
    this.nextBtn = this.makeBtn('step-next', 'Next step')
    this.saveBtn = this.makeBtn('save', 'Save timeline')
    this.loadBtn = this.makeBtn('load', 'Load timeline')
    this.exportDslBtn = this.makeBtn('export-dsl', 'Export DSL timeline')
    this.importDslBtn = this.makeBtn('import-dsl', 'Import DSL timeline')
    this.patchBtn = this.makeBtn('patch', 'Export timeline patch')
    this.expandBtn = this.makeBtn('expand', 'Expand timeline')

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

    this.guideLabel = document.createElement('span')
    this.guideLabel.style.cssText = `
      color:#94a3b8;font-size:11px;font-family:monospace;min-width:220px;max-width:420px;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    `
    this.guideLabel.textContent = ''

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
      this.guideLabel,
      this.timeLabel,
      this.stepLabel,
      this.expandBtn
    )

    this.bindEvents()
    this.bindRuntime()
    this.refreshStatus(this.runtime.time)
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

  private makeBtn(icon: IconName, title: string): HTMLButtonElement {
    const btn = document.createElement('button')
    this.setBtnIcon(btn, icon)
    btn.title = title
    btn.style.cssText = BTN
    btn.addEventListener('mouseenter', () => { btn.style.background = '#2a3045' })
    btn.addEventListener('mouseleave', () => { btn.style.background = '#1e2330' })
    return btn
  }

  private setBtnIcon(btn: HTMLButtonElement, icon: IconName): void {
    btn.dataset.icon = icon
    btn.innerHTML = ICONS[icon]
    const svg = btn.firstElementChild
    if (svg instanceof SVGElement) {
      svg.setAttribute('aria-hidden', 'true')
      svg.setAttribute('focusable', 'false')
    }
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
      this.setBtnIcon(this.expandBtn, this._expanded ? 'collapse' : 'expand')
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
          this.refreshStatus(time)
        }
      }),
      this.runtime.on({
        type: 'stateChange',
        handler: (state: PlayState) => {
          this.setBtnIcon(this.playBtn, state === 'playing' ? 'pause' : 'play')
          this.playBtn.title = state === 'playing' ? 'Pause' : 'Play'
        }
      })
    )
  }

  private refreshStatus(time: number): void {
    this.timeLabel.textContent = `${time.toFixed(2)}s`

    const activeStep = this.getPrimaryStepTrack()?.evaluate(time)
    this.stepLabel.textContent = activeStep ? `S${activeStep.index + 1}` : ''

    const marker = this.getCurrentMarker(time)
    const markerText = marker?.description ?? marker?.label
    const stepText = this.describeStep(activeStep)
    const stateText = this.describeState(time)

    this.guideLabel.textContent =
      [markerText, stepText, stateText].filter(Boolean).join(' | ') ||
      'Press play to follow the lesson steps.'
  }

  private getPrimaryStepTrack(): StepTrack | undefined {
    const stepsTrack = this.runtime.getTrack('steps')
    if (stepsTrack instanceof StepTrack) return stepsTrack
    for (const track of this.runtime.getTracks().values()) {
      if (track instanceof StepTrack) return track
    }
    return undefined
  }

  private getCurrentMarker(time: number): TimelineMarker | undefined {
    const markers = this.runtime.getMarkers()
    for (let i = markers.length - 1; i >= 0; i--) {
      if (markers[i].time <= time + 1e-6) return markers[i]
    }
    return undefined
  }

  private describeStep(step: StepData | undefined): string {
    if (!step) return ''
    const title = step.label ? `step ${step.index + 1}: ${step.label}` : `step ${step.index + 1}`

    if (typeof step.payload !== 'object' || step.payload === null) return title
    const payload = step.payload as Record<string, unknown>
    const hints: string[] = []

    if (typeof payload.nodeId === 'string') hints.push(`node=${payload.nodeId}`)
    if (typeof payload.running === 'string') hints.push(`task=${payload.running}`)
    if (typeof payload.state === 'string') hints.push(`state=${payload.state}`)
    if (typeof payload.t === 'number') hints.push(`t=${payload.t.toFixed(2)}`)
    if (typeof payload.loss === 'number') hints.push(`loss=${payload.loss.toFixed(2)}`)

    if (hints.length === 0) return title
    return `${title} (${hints.join(', ')})`
  }

  private describeState(time: number): string {
    const result = this.runtime.evaluateAt(time)
    const state = result.states.find(item => item.value)?.value?.state
    return state ? `state=${state}` : ''
  }

  private saveTimeline(): void {
    try {
      const data = this.runtime.serialize()
      localStorage.setItem(TimelineBar.STORAGE_KEY, JSON.stringify(data))
      this.flashButton(this.saveBtn)
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
      this.flashButton(this.loadBtn)
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
    this.flashButton(this.exportDslBtn)
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
      this.flashButton(this.importDslBtn)
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
    this.flashButton(this.patchBtn)
  }

  private flashButton(btn: HTMLButtonElement): void {
    const originalIcon = this.isIconName(btn.dataset.icon) ? btn.dataset.icon : null
    this.setBtnIcon(btn, 'check')
    window.setTimeout(() => {
      if (originalIcon) this.setBtnIcon(btn, originalIcon)
    }, 550)
  }

  private isIconName(value: string | undefined): value is IconName {
    if (!value) return false
    return Object.prototype.hasOwnProperty.call(ICONS, value)
  }
}
