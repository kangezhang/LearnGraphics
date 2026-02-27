import { SelectionStore } from '@/semantic/SelectionStore'
import { ViewManager } from '@/views/ViewManager'
import { View3D } from '@/views/View3D'
import { GraphView } from '@/views/GraphView'
import { InspectorView } from '@/views/InspectorView'
import { PlotView } from '@/views/PlotView'
import { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { BindingRegistry } from '@/semantic/bindings/BindingManager'
import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { TimelineBar } from '@/timeline/ui/TimelineBar'
import { TimelineEditorUI } from '@/timeline/ui/TimelineEditorUI'
import {
  getGlobalVisualSettings,
  onGlobalVisualSettingsChange,
  resetGlobalVisualSettings,
  setGlobalVisualSettings,
  type GlobalVisualSettings,
} from '@/core/visual/GlobalVisualSettings'

const BAR_H = 44
const EDITOR_H = 180

export interface LessonListItem {
  id: string
  title: string
  tags?: string[]
}

export interface LessonControlSlider {
  id: string
  label: string
  min: number
  max: number
  step?: number
  value: number
  defaultValue?: number
  onChange: (value: number) => void
}

export interface LessonLayoutOptions {
  showGraphPanel: boolean
}

export class Shell {
  private selection = new SelectionStore()
  private viewManager: ViewManager
  private root: HTMLElement
  private _timelineBar: TimelineBar | null = null
  private _timelineEditor: TimelineEditorUI | null = null
  private _timelinePanel: HTMLElement | null = null
  private _editorPanel: HTMLElement | null = null
  private _view3d: View3D | null = null
  private _expanded = false
  private _graphPanelVisible = true
  private lessonDocRoot: HTMLElement | null = null

  private lessonListEl: HTMLElement | null = null
  private lessonControlsEl: HTMLElement | null = null
  private panel3dEl: HTMLElement | null = null
  private panelGraphEl: HTMLElement | null = null
  private inspectorHostEl: HTMLElement | null = null
  private plotHostEl: HTMLElement | null = null
  private globalArrowInputEl: HTMLInputElement | null = null
  private globalMarkerInputEl: HTMLInputElement | null = null
  private globalSymbolInputEl: HTMLInputElement | null = null
  private coordinateFrameBtnEl: HTMLButtonElement | null = null
  private globalArrowValueEl: HTMLElement | null = null
  private globalMarkerValueEl: HTMLElement | null = null
  private globalSymbolValueEl: HTMLElement | null = null
  private globalVisualPanelOpen = false
  private coordinateFrameEnabled = true
  private globalVisualUnsub: (() => void) | null = null
  private lessonSelectHandler: ((id: string) => void) | null = null
  private lessonControlItems = new Map<string, {
    input: HTMLInputElement
    valueText: HTMLElement
    slider: LessonControlSlider
  }>()

  constructor(root: HTMLElement) {
    this.root = root
    this.viewManager = new ViewManager(this.selection)
    this.globalVisualUnsub = onGlobalVisualSettingsChange((settings) => {
      this.syncGlobalVisualPanel(settings)
      this._view3d?.refreshAllVisuals()
    })
    this.buildLayout()
  }

  setLessons(lessons: LessonListItem[], onSelect: (id: string) => void, activeId?: string): void {
    this.lessonSelectHandler = onSelect
    this.renderLessonList(lessons)
    if (activeId) this.setActiveLesson(activeId)
  }

  setActiveLesson(id: string): void {
    if (!this.lessonListEl) return
    const nodes = this.lessonListEl.querySelectorAll<HTMLElement>('[data-lesson-id]')
    nodes.forEach(node => {
      const isActive = node.dataset.lessonId === id
      node.classList.toggle('active', isActive)
    })
  }

  setLessonDoc(title: string, markdown: string): void {
    if (!this.lessonDocRoot) return
    this.lessonDocRoot.innerHTML = renderLessonDocHtml(title, markdown)
  }

  setLessonControls(sliders: LessonControlSlider[]): void {
    if (!this.lessonControlsEl) return
    this.lessonControlsEl.innerHTML = ''
    this.lessonControlItems.clear()
    if (sliders.length === 0) return

    const title = document.createElement('div')
    title.className = 'lesson-controls-title'
    title.textContent = 'Lesson Controls'
    this.lessonControlsEl.appendChild(title)

    const actions = document.createElement('div')
    actions.className = 'lesson-controls-actions'
    const resetBtn = document.createElement('button')
    resetBtn.type = 'button'
    resetBtn.className = 'lesson-controls-reset-btn'
    resetBtn.title = 'Reset lesson controls'
    resetBtn.setAttribute('aria-label', 'Reset lesson controls')
    resetBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 1 1-2.34-5.66"></path>
        <polyline points="20 4 20 10 14 10"></polyline>
      </svg>
    `
    actions.appendChild(resetBtn)
    this.lessonControlsEl.appendChild(actions)

    const sliderItems: Array<{
      slider: LessonControlSlider
      input: HTMLInputElement
      valueText: HTMLElement
      defaultValue: number
    }> = []

    for (const slider of sliders) {
      const row = document.createElement('div')
      row.className = 'ui-row slider lesson-control-row'

      const label = document.createElement('label')
      label.htmlFor = `lesson-control-${slider.id}`
      label.textContent = slider.label

      const track = document.createElement('div')
      track.className = 'slider-track'

      const input = document.createElement('input')
      input.id = `lesson-control-${slider.id}`
      input.type = 'range'
      input.min = String(slider.min)
      input.max = String(slider.max)
      input.step = String(slider.step ?? 0.01)
      const defaultValue = clampSlider(slider.defaultValue ?? slider.value, slider.min, slider.max)
      input.value = String(clampSlider(slider.value, slider.min, slider.max))

      const valueText = document.createElement('span')
      valueText.className = 'value'
      valueText.textContent = formatSliderValue(Number(input.value), slider.step)

      input.addEventListener('input', () => {
        const next = Number(input.value)
        if (!Number.isFinite(next)) return
        valueText.textContent = formatSliderValue(next, slider.step)
        slider.onChange(next)
      })

      track.append(input, valueText)
      row.append(label, track)
      this.lessonControlsEl.appendChild(row)
      sliderItems.push({ slider, input, valueText, defaultValue })
      this.lessonControlItems.set(slider.id, { input, valueText, slider })
    }

    resetBtn.addEventListener('click', () => {
      for (const item of sliderItems) {
        const next = item.defaultValue
        item.input.value = String(next)
        item.valueText.textContent = formatSliderValue(next, item.slider.step)
        item.slider.onChange(next)
      }
    })
  }

  setLessonControlValue(id: string, value: number, emitChange = false): void {
    const item = this.lessonControlItems.get(id)
    if (!item) return

    const next = clampSlider(value, item.slider.min, item.slider.max)
    if (!Number.isFinite(next)) return
    const current = Number(item.input.value)
    if (Number.isFinite(current) && Math.abs(current - next) < 1e-6) return

    item.input.value = String(next)
    item.valueText.textContent = formatSliderValue(next, item.slider.step)
    if (emitChange) item.slider.onChange(next)
  }

  setLessonLayout(options: LessonLayoutOptions): void {
    this._graphPanelVisible = options.showGraphPanel
    this.applyLayout()
  }

  private buildLayout(): void {
    this.root.innerHTML = ''
    this.root.classList.add('app-shell')
    this.root.style.cssText = `
      display:grid;
      grid-template-columns:240px 1fr 1fr 280px;
      grid-template-rows:1fr ${BAR_H}px;
      width:100vw;height:100vh;overflow:hidden;background:#0f1116;position:relative;
    `

    const sidebar = document.createElement('aside')
    sidebar.className = 'sidebar'
    sidebar.style.gridRow = '1 / 2'
    sidebar.style.gridColumn = '1 / 2'
    const brand = document.createElement('div')
    brand.className = 'brand'
    brand.textContent = 'LearnGraphics'
    const lessonList = document.createElement('div')
    lessonList.className = 'lesson-list'
    lessonList.innerHTML = '<div class="lesson-tags">No lessons loaded.</div>'
    const lessonControls = document.createElement('div')
    lessonControls.className = 'lesson-controls'
    sidebar.append(brand, lessonList, lessonControls)
    this.lessonListEl = lessonList
    this.lessonControlsEl = lessonControls

    const panel3d = this.makePanel()
    panel3d.style.gridColumn = '2 / 3'
    const panelGraph = this.makePanel()
    panelGraph.style.gridColumn = '3 / 4'

    const panelRight = this.makePanel('inspector-panel')
    panelRight.style.gridColumn = '4 / 5'
    panelRight.style.display = 'flex'
    panelRight.style.flexDirection = 'column'

    const rightTabs = document.createElement('div')
    rightTabs.style.cssText = `
      height:36px;display:flex;align-items:center;gap:6px;padding:6px;
      border-bottom:1px solid #1e2330;background:#10151f;flex-shrink:0;
    `
    const plotTabBtn = document.createElement('button')
    plotTabBtn.textContent = '2D'
    plotTabBtn.style.cssText = this.tabButtonStyle(true)
    const docTabBtn = document.createElement('button')
    docTabBtn.textContent = 'Doc'
    docTabBtn.style.cssText = this.tabButtonStyle(false)
    const inspectorTabBtn = document.createElement('button')
    inspectorTabBtn.textContent = 'Inspector'
    inspectorTabBtn.style.cssText = this.tabButtonStyle(false)
    rightTabs.append(plotTabBtn, docTabBtn, inspectorTabBtn)

    const rightBody = document.createElement('div')
    rightBody.style.cssText = 'position:relative;flex:1;overflow:hidden;'

    const inspectorHost = document.createElement('div')
    inspectorHost.style.cssText = 'position:absolute;inset:0;display:none;'
    const plotHost = document.createElement('div')
    plotHost.style.cssText = 'position:absolute;inset:0;display:block;'
    const docHost = document.createElement('div')
    docHost.style.cssText = 'position:absolute;inset:0;display:none;overflow:auto;background:#0d1018;'
    const docRoot = document.createElement('article')
    docRoot.className = 'lesson-doc-root'
    docHost.appendChild(docRoot)
    this.lessonDocRoot = docRoot
    rightBody.append(inspectorHost, plotHost, docHost)
    panelRight.append(rightTabs, rightBody)

    const panelTimeline = document.createElement('div')
    panelTimeline.style.cssText = `
      grid-column:1/-1;position:relative;height:${BAR_H}px;overflow:visible;z-index:10;
    `

    const editorArea = document.createElement('div')
    editorArea.style.cssText = `
      position:absolute;left:0;right:0;bottom:${BAR_H}px;height:${EDITOR_H}px;
      overflow:hidden;display:none;z-index:11;
    `

    const barArea = document.createElement('div')
    barArea.style.cssText = `position:relative;height:${BAR_H}px;z-index:12;`

    panelTimeline.append(editorArea, barArea)
    this.root.append(sidebar, panel3d, panelGraph, panelRight, panelTimeline)

    this._editorPanel = editorArea
    this._timelinePanel = barArea
    this.panel3dEl = panel3d
    this.panelGraphEl = panelGraph
    this.inspectorHostEl = inspectorHost
    this.plotHostEl = plotHost
    this.mountGlobalVisualControls()
    const view3d = new View3D()
    const graphView = new GraphView()
    const inspector = new InspectorView()
    const plot = new PlotView()

    this._view3d = view3d
    this._view3d.setCoordinateFrameVisible(this.coordinateFrameEnabled)

    this.viewManager.register(view3d, panel3d)
    this.viewManager.register(graphView, panelGraph)
    this.viewManager.register(inspector, inspectorHost)
    this.viewManager.register(plot, plotHost)

    const setRightTab = (tab: 'inspector' | 'plot' | 'doc'): void => {
      const inspectorActive = tab === 'inspector'
      const plotActive = tab === 'plot'
      const docActive = tab === 'doc'
      inspectorHost.style.display = inspectorActive ? 'block' : 'none'
      plotHost.style.display = plotActive ? 'block' : 'none'
      docHost.style.display = docActive ? 'block' : 'none'
      plotTabBtn.style.cssText = this.tabButtonStyle(plotActive)
      docTabBtn.style.cssText = this.tabButtonStyle(docActive)
      inspectorTabBtn.style.cssText = this.tabButtonStyle(inspectorActive)
      requestAnimationFrame(() => {
        this.viewManager.resize(inspector.id, inspectorHost.clientWidth, inspectorHost.clientHeight)
        this.viewManager.resize(plot.id, plotHost.clientWidth, plotHost.clientHeight)
      })
    }
    setRightTab('doc')
    inspectorTabBtn.addEventListener('click', () => setRightTab('inspector'))
    plotTabBtn.addEventListener('click', () => setRightTab('plot'))
    docTabBtn.addEventListener('click', () => setRightTab('doc'))

    panelGraph.addEventListener('entity-click', (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id
      const current = this.selection.getSelected()
      if (current.includes(id)) this.selection.select([])
      else this.selection.select([id])
    })

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement
        const { width, height } = entry.contentRect
        const viewId = el.dataset.viewId
        if (viewId) this.viewManager.resize(viewId, width, height)
      }
    })

    panel3d.dataset.viewId = view3d.id
    panelGraph.dataset.viewId = graphView.id
    inspectorHost.dataset.viewId = inspector.id
    plotHost.dataset.viewId = plot.id

    ro.observe(panel3d)
    ro.observe(panelGraph)
    ro.observe(inspectorHost)
    ro.observe(plotHost)

    this.applyLayout()
  }

  setTimeline(runtime: TimelineRuntime): void {
    this._timelineBar?.dispose()
    this._timelineEditor?.dispose()
    if (this._timelinePanel) this._timelinePanel.innerHTML = ''
    if (this._editorPanel) this._editorPanel.innerHTML = ''

    this._timelineBar = new TimelineBar(runtime, () => this.toggleEditor())
    if (this._timelinePanel) this._timelineBar.mount(this._timelinePanel)

    this._timelineEditor = new TimelineEditorUI(runtime)
    if (this._editorPanel) this._timelineEditor.mount(this._editorPanel)

    this.viewManager.loadTimeline(runtime)
  }

  private toggleEditor(): void {
    this._expanded = !this._expanded
    const editorArea = this._editorPanel
    if (!editorArea) return

    if (this._expanded) {
      editorArea.style.display = 'block'
      requestAnimationFrame(() => this._timelineEditor?.resize())
    } else {
      editorArea.style.display = 'none'
    }
  }

  loadGraph(graph: SemanticGraph, bindings?: BindingRegistry): void {
    this.selection.select([])
    this.viewManager.loadGraph(graph, bindings)
  }

  notifyGraphMutation(changedEntityIds: string[]): void {
    this.viewManager.notifyGraphMutation(changedEntityIds)
  }

  getView3D(): View3D | null {
    return this._view3d
  }

  setCoordinateFramePreference(enabled: boolean | null): void {
    if (enabled === null) return
    this.setCoordinateFrameEnabled(enabled)
  }

  dispose(): void {
    this._timelineBar?.dispose()
    this._timelineEditor?.dispose()
    this.viewManager.dispose()
    this.globalVisualUnsub?.()
    this.globalVisualUnsub = null
  }

  private makePanel(extraClass = ''): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = 'position:relative;overflow:hidden;border-right:1px solid #1e2330'
    if (extraClass) el.classList.add(extraClass)
    return el
  }

  private applyLayout(): void {
    if (!this.panel3dEl || !this.panelGraphEl) return

    this.root.style.gridTemplateColumns = this._graphPanelVisible
      ? '240px minmax(0,1fr) minmax(0,1fr) 280px'
      : '240px minmax(0,1fr) 0px 280px'

    this.panel3dEl.style.gridColumn = this._graphPanelVisible ? '2 / 3' : '2 / 4'
    this.panelGraphEl.style.display = this._graphPanelVisible ? 'block' : 'none'

    requestAnimationFrame(() => {
      if (this.panel3dEl) {
        this.viewManager.resize('view3d', this.panel3dEl.clientWidth, this.panel3dEl.clientHeight)
      }
      if (this.panelGraphEl) {
        this.viewManager.resize('graphview', this.panelGraphEl.clientWidth, this.panelGraphEl.clientHeight)
      }
      if (this.inspectorHostEl) {
        this.viewManager.resize('inspector', this.inspectorHostEl.clientWidth, this.inspectorHostEl.clientHeight)
      }
      if (this.plotHostEl) {
        this.viewManager.resize('plotview', this.plotHostEl.clientWidth, this.plotHostEl.clientHeight)
      }
    })
  }

  private mountGlobalVisualControls(): void {
    const coordinateBtn = document.createElement('button')
    coordinateBtn.type = 'button'
    coordinateBtn.className = 'coordinate-frame-btn'
    coordinateBtn.title = 'Toggle coordinate frame'
    coordinateBtn.setAttribute('aria-label', 'Toggle coordinate frame')
    coordinateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20V4"></path>
        <path d="M4 20H20"></path>
        <path d="M4 20L14 10"></path>
      </svg>
    `

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'global-visual-btn'
    btn.title = 'Visual scale'
    btn.setAttribute('aria-label', 'Visual scale')
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <line x1="4" y1="6" x2="20" y2="6"></line>
        <circle cx="9" cy="6" r="2"></circle>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <circle cx="15" cy="12" r="2"></circle>
        <line x1="4" y1="18" x2="20" y2="18"></line>
        <circle cx="11" cy="18" r="2"></circle>
      </svg>
    `

    const panel = document.createElement('div')
    panel.className = 'global-visual-panel'
    panel.style.display = 'none'

    const title = document.createElement('div')
    title.className = 'global-visual-title'
    title.textContent = 'Global Visual Size'
    panel.appendChild(title)

    const arrowRow = document.createElement('div')
    arrowRow.className = 'ui-row slider global-visual-row'
    const arrowLabel = document.createElement('label')
    arrowLabel.textContent = 'Arrow Size'
    arrowLabel.htmlFor = 'global-arrow-size'
    const arrowTrack = document.createElement('div')
    arrowTrack.className = 'slider-track'
    const arrowInput = document.createElement('input')
    arrowInput.id = 'global-arrow-size'
    arrowInput.type = 'range'
    arrowInput.min = '0.5'
    arrowInput.max = '2.2'
    arrowInput.step = '0.05'
    const arrowValue = document.createElement('span')
    arrowValue.className = 'value'
    arrowTrack.append(arrowInput, arrowValue)
    arrowRow.append(arrowLabel, arrowTrack)
    panel.appendChild(arrowRow)

    const markerRow = document.createElement('div')
    markerRow.className = 'ui-row slider global-visual-row'
    const markerLabel = document.createElement('label')
    markerLabel.textContent = 'Diamond Size'
    markerLabel.htmlFor = 'global-marker-size'
    const markerTrack = document.createElement('div')
    markerTrack.className = 'slider-track'
    const markerInput = document.createElement('input')
    markerInput.id = 'global-marker-size'
    markerInput.type = 'range'
    markerInput.min = '0.5'
    markerInput.max = '2.2'
    markerInput.step = '0.05'
    const markerValue = document.createElement('span')
    markerValue.className = 'value'
    markerTrack.append(markerInput, markerValue)
    markerRow.append(markerLabel, markerTrack)
    panel.appendChild(markerRow)

    const symbolRow = document.createElement('div')
    symbolRow.className = 'ui-row slider global-visual-row'
    const symbolLabel = document.createElement('label')
    symbolLabel.textContent = 'Symbol Size'
    symbolLabel.htmlFor = 'global-symbol-size'
    const symbolTrack = document.createElement('div')
    symbolTrack.className = 'slider-track'
    const symbolInput = document.createElement('input')
    symbolInput.id = 'global-symbol-size'
    symbolInput.type = 'range'
    symbolInput.min = '0.5'
    symbolInput.max = '2.2'
    symbolInput.step = '0.05'
    const symbolValue = document.createElement('span')
    symbolValue.className = 'value'
    symbolTrack.append(symbolInput, symbolValue)
    symbolRow.append(symbolLabel, symbolTrack)
    panel.appendChild(symbolRow)

    const globalActions = document.createElement('div')
    globalActions.className = 'global-visual-actions'
    const globalResetBtn = document.createElement('button')
    globalResetBtn.type = 'button'
    globalResetBtn.className = 'global-visual-reset-btn'
    globalResetBtn.title = 'Reset global visual size'
    globalResetBtn.setAttribute('aria-label', 'Reset global visual size')
    globalResetBtn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 1 1-2.34-5.66"></path>
        <polyline points="20 4 20 10 14 10"></polyline>
      </svg>
    `
    globalActions.appendChild(globalResetBtn)
    panel.appendChild(globalActions)

    coordinateBtn.addEventListener('click', () => {
      this.setCoordinateFrameEnabled(!this.coordinateFrameEnabled)
    })
    btn.addEventListener('click', () => {
      this.globalVisualPanelOpen = !this.globalVisualPanelOpen
      panel.style.display = this.globalVisualPanelOpen ? 'flex' : 'none'
      btn.classList.toggle('active', this.globalVisualPanelOpen)
    })

    arrowInput.addEventListener('input', () => {
      const next = Number(arrowInput.value)
      if (!Number.isFinite(next)) return
      setGlobalVisualSettings({ arrowScale: next })
    })
    markerInput.addEventListener('input', () => {
      const next = Number(markerInput.value)
      if (!Number.isFinite(next)) return
      setGlobalVisualSettings({ markerScale: next })
    })
    symbolInput.addEventListener('input', () => {
      const next = Number(symbolInput.value)
      if (!Number.isFinite(next)) return
      setGlobalVisualSettings({ symbolScale: next })
    })
    globalResetBtn.addEventListener('click', () => {
      resetGlobalVisualSettings()
    })

    this.globalArrowInputEl = arrowInput
    this.globalMarkerInputEl = markerInput
    this.globalSymbolInputEl = symbolInput
    this.globalArrowValueEl = arrowValue
    this.globalMarkerValueEl = markerValue
    this.globalSymbolValueEl = symbolValue
    this.coordinateFrameBtnEl = coordinateBtn

    ;(this.panel3dEl ?? this.root).append(coordinateBtn, btn, panel)
    this.syncCoordinateFrameButton()
    this.syncGlobalVisualPanel(getGlobalVisualSettings())
  }

  private syncGlobalVisualPanel(settings: GlobalVisualSettings): void {
    if (this.globalArrowInputEl) this.globalArrowInputEl.value = settings.arrowScale.toFixed(2)
    if (this.globalMarkerInputEl) this.globalMarkerInputEl.value = settings.markerScale.toFixed(2)
    if (this.globalSymbolInputEl) this.globalSymbolInputEl.value = settings.symbolScale.toFixed(2)
    if (this.globalArrowValueEl) this.globalArrowValueEl.textContent = settings.arrowScale.toFixed(2)
    if (this.globalMarkerValueEl) this.globalMarkerValueEl.textContent = settings.markerScale.toFixed(2)
    if (this.globalSymbolValueEl) this.globalSymbolValueEl.textContent = settings.symbolScale.toFixed(2)
  }

  private setCoordinateFrameEnabled(enabled: boolean): void {
    this.coordinateFrameEnabled = enabled
    this._view3d?.setCoordinateFrameVisible(enabled)
    this.syncCoordinateFrameButton()
  }

  private syncCoordinateFrameButton(): void {
    if (!this.coordinateFrameBtnEl) return
    this.coordinateFrameBtnEl.classList.toggle('active', this.coordinateFrameEnabled)
    this.coordinateFrameBtnEl.setAttribute('aria-pressed', this.coordinateFrameEnabled ? 'true' : 'false')
  }

  private tabButtonStyle(active: boolean): string {
    return `
      height:24px;padding:0 10px;border-radius:6px;border:1px solid #2a3045;
      cursor:pointer;font-size:11px;font-family:monospace;
      background:${active ? '#1f2937' : '#0f1722'};
      color:${active ? '#7db3ff' : '#9ca3af'};
    `
  }

  private renderLessonList(lessons: LessonListItem[]): void {
    if (!this.lessonListEl) return
    this.lessonListEl.innerHTML = ''

    for (const lesson of lessons) {
      const item = document.createElement('button')
      item.type = 'button'
      item.className = 'lesson-item'
      item.dataset.lessonId = lesson.id
      item.innerHTML = `
        <div class="lesson-title">${escapeHtml(lesson.title)}</div>
        <div class="lesson-tags">${escapeHtml((lesson.tags ?? []).join(', '))}</div>
      `
      item.addEventListener('click', () => this.lessonSelectHandler?.(lesson.id))
      this.lessonListEl.appendChild(item)
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function renderLessonDocHtml(title: string, markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const parts: string[] = []
  let inList = false
  let hasMainTitle = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      if (inList) {
        parts.push('</ul>')
        inList = false
      }
      continue
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      if (inList) {
        parts.push('</ul>')
        inList = false
      }
      const level = heading[1].length
      if (level === 1) hasMainTitle = true
      parts.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const bullet = trimmed.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      if (!inList) {
        parts.push('<ul>')
        inList = true
      }
      parts.push(`<li>${renderInlineMarkdown(bullet[1])}</li>`)
      continue
    }

    if (inList) {
      parts.push('</ul>')
      inList = false
    }
    parts.push(`<p>${renderInlineMarkdown(trimmed)}</p>`)
  }

  if (inList) parts.push('</ul>')
  if (parts.length === 0) {
    parts.push('<p>暂无课程文档。</p>')
  }
  if (!hasMainTitle) {
    parts.unshift(`<h1>${escapeHtml(title)}</h1>`)
  }
  return parts.join('\n')
}

function renderInlineMarkdown(value: string): string {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function formatSliderValue(value: number, step?: number): string {
  if (step !== undefined && step >= 1) return String(Math.round(value))
  if (step !== undefined && step >= 0.1) return value.toFixed(1)
  return value.toFixed(2)
}

function clampSlider(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
