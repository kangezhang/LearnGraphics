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
const AI_ICON = {
  create:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
  update:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7"></path><path d="M4 5v6h6"></path></svg>',
  settings:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"></circle><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h.1a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"></path></svg>',
  delete:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="M7 7l1 12h8l1-12"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>',
} as const

export interface LessonListItem {
  id: string
  title: string
  tags?: string[]
  source?: 'builtin' | 'ai'
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

export interface AIPanelCreatePayload {
  title: string
  description: string
  tags: string[]
}

export interface AIPanelUpdatePayload {
  feedback: string
  forceOnCapabilityMismatch: boolean
}

export interface AIPanelSettingsPayload {
  endpoint: string
  apiKey: string
  model: string
  orchestratorMode: 'direct' | 'pipeline'
  orchestratorEndpoint: string
}

export type AIPanelStatusKind = 'info' | 'success' | 'error'
type AIPanelMode = 'create' | 'update' | 'settings' | 'delete'

export interface LessonActionHandlers {
  onCreateAI: (payload: AIPanelCreatePayload) => void | Promise<void>
  onUpdateAI: (activeLessonId: string | null, payload: AIPanelUpdatePayload) => void | Promise<void>
  onDeleteAI: (activeLessonId: string | null) => void | Promise<void>
  onConfigureAI: (settings: AIPanelSettingsPayload) => void | Promise<void>
}

export interface LessonVersionEntry {
  revision: number
  createdAt: string
  action: string
  note: string
  isCurrent: boolean
  orchestration: {
    strategy: string
    requestId: string
    orchestrator: string
    generatedAt: string
    capabilitySnapshotId: string | null
    capabilityCount: number
  } | null
}

export interface LessonVersionPanelData {
  lessonId: string
  source: 'builtin' | 'ai'
  currentRevision: number | null
  metadata: {
    headRevision: number
    headUpdatedAt: string
    lastAction: string
    lastNote: string
    historyTruncated: boolean
    lastStrategy: string | null
  } | null
  entries: LessonVersionEntry[]
}

export interface LessonVersionHandlers {
  onSwitchVersion: (lessonId: string, revision: number) => void | Promise<void>
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
  private lessonActionsEl: HTMLElement | null = null
  private aiPanelStatusEl: HTMLElement | null = null
  private aiPanelOverlayEl: HTMLDivElement | null = null
  private aiPanelBodyEl: HTMLDivElement | null = null
  private aiPanelTitleEl: HTMLHeadingElement | null = null
  private aiPanelConfirmEl: HTMLButtonElement | null = null
  private aiPanelMode: AIPanelMode | null = null
  private aiCreateTitleEl: HTMLInputElement | null = null
  private aiCreateDescEl: HTMLTextAreaElement | null = null
  private aiCreateTagsEl: HTMLInputElement | null = null
  private aiFeedbackEl: HTMLTextAreaElement | null = null
  private aiForceCapabilityMismatchEl: HTMLInputElement | null = null
  private aiEndpointEl: HTMLInputElement | null = null
  private aiApiKeyEl: HTMLInputElement | null = null
  private aiModelEl: HTMLInputElement | null = null
  private aiOrchestratorModeEl: HTMLSelectElement | null = null
  private aiOrchestratorEndpointEl: HTMLInputElement | null = null
  private lessonControlsEl: HTMLElement | null = null
  private lessonVersionRootEl: HTMLElement | null = null
  private lessonVersionData: LessonVersionPanelData | null = null
  private lessonVersionHandlers: LessonVersionHandlers | null = null
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
  private lessonActionHandlers: LessonActionHandlers | null = null
  private activeLessonId: string | null = null
  private activeLessonSource: 'builtin' | 'ai' | null = null
  private lessonSourceById = new Map<string, 'builtin' | 'ai'>()
  private aiFormDraft = {
    createTitle: '',
    createDescription: '',
    createTags: '',
    feedback: '',
    forceOnCapabilityMismatch: false,
    endpoint: '',
    apiKey: '',
    model: '',
    orchestratorMode: 'direct',
    orchestratorEndpoint: '',
  }
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
    this.lessonSourceById = new Map(
      lessons.map(lesson => [
        lesson.id,
        lesson.source === 'ai' ? 'ai' : 'builtin',
      ]),
    )
    this.renderLessonList(lessons)
    if (activeId) this.setActiveLesson(activeId)
  }

  setActiveLesson(id: string): void {
    this.activeLessonId = id
    this.activeLessonSource = this.lessonSourceById.get(id) ?? null
    if (!this.lessonListEl) return
    const nodes = this.lessonListEl.querySelectorAll<HTMLElement>('[data-lesson-id]')
    nodes.forEach(node => {
      const isActive = node.dataset.lessonId === id
      node.classList.toggle('active', isActive)
    })
    this.renderLessonActions()
  }

  setLessonActions(handlers: LessonActionHandlers): void {
    this.lessonActionHandlers = handlers
    this.renderLessonActions()
  }

  setLessonVersionHandlers(handlers: LessonVersionHandlers): void {
    this.lessonVersionHandlers = handlers
    this.renderLessonVersions()
  }

  setLessonVersions(data: LessonVersionPanelData): void {
    this.lessonVersionData = data
    this.renderLessonVersions()
  }

  setAISettings(settings: AIPanelSettingsPayload): void {
    this.aiFormDraft.endpoint = settings.endpoint ?? ''
    this.aiFormDraft.apiKey = settings.apiKey ?? ''
    this.aiFormDraft.model = settings.model ?? ''
    this.aiFormDraft.orchestratorMode = settings.orchestratorMode === 'pipeline' ? 'pipeline' : 'direct'
    this.aiFormDraft.orchestratorEndpoint = settings.orchestratorEndpoint ?? ''
    if (this.aiEndpointEl) this.aiEndpointEl.value = this.aiFormDraft.endpoint
    if (this.aiApiKeyEl) this.aiApiKeyEl.value = this.aiFormDraft.apiKey
    if (this.aiModelEl) this.aiModelEl.value = this.aiFormDraft.model
    if (this.aiOrchestratorModeEl) this.aiOrchestratorModeEl.value = this.aiFormDraft.orchestratorMode
    if (this.aiOrchestratorEndpointEl) this.aiOrchestratorEndpointEl.value = this.aiFormDraft.orchestratorEndpoint
  }

  setAIStatus(message: string, kind: AIPanelStatusKind = 'info'): void {
    if (!this.aiPanelStatusEl) return
    this.aiPanelStatusEl.textContent = message
    this.aiPanelStatusEl.dataset.kind = kind
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
    const lessonActions = document.createElement('div')
    lessonActions.className = 'lesson-actions'
    const aiStatus = document.createElement('div')
    aiStatus.className = 'ai-status'
    aiStatus.dataset.kind = 'info'
    aiStatus.textContent = 'Ready'
    this.aiPanelStatusEl = aiStatus
    const lessonControls = document.createElement('div')
    lessonControls.className = 'lesson-controls'
    sidebar.append(brand, lessonActions, aiStatus, lessonList, lessonControls)
    this.lessonListEl = lessonList
    this.lessonActionsEl = lessonActions
    this.lessonControlsEl = lessonControls
    this.renderLessonActions()

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
    const versionTabBtn = document.createElement('button')
    versionTabBtn.textContent = 'Version'
    versionTabBtn.style.cssText = this.tabButtonStyle(false)
    rightTabs.append(plotTabBtn, docTabBtn, inspectorTabBtn, versionTabBtn)

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
    const versionHost = document.createElement('div')
    versionHost.style.cssText = 'position:absolute;inset:0;display:none;overflow:auto;background:#0d1018;'
    const versionRoot = document.createElement('article')
    versionRoot.className = 'lesson-version-root'
    versionHost.appendChild(versionRoot)
    this.lessonDocRoot = docRoot
    this.lessonVersionRootEl = versionRoot
    rightBody.append(inspectorHost, plotHost, docHost, versionHost)
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
    const aiPanel = this.createAIFloatingPanel()
    this.root.append(sidebar, panel3d, panelGraph, panelRight, panelTimeline, aiPanel)

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

    const setRightTab = (tab: 'inspector' | 'plot' | 'doc' | 'version'): void => {
      const inspectorActive = tab === 'inspector'
      const plotActive = tab === 'plot'
      const docActive = tab === 'doc'
      const versionActive = tab === 'version'
      inspectorHost.style.display = inspectorActive ? 'block' : 'none'
      plotHost.style.display = plotActive ? 'block' : 'none'
      docHost.style.display = docActive ? 'block' : 'none'
      versionHost.style.display = versionActive ? 'block' : 'none'
      plotTabBtn.style.cssText = this.tabButtonStyle(plotActive)
      docTabBtn.style.cssText = this.tabButtonStyle(docActive)
      inspectorTabBtn.style.cssText = this.tabButtonStyle(inspectorActive)
      versionTabBtn.style.cssText = this.tabButtonStyle(versionActive)
      requestAnimationFrame(() => {
        this.viewManager.resize(inspector.id, inspectorHost.clientWidth, inspectorHost.clientHeight)
        this.viewManager.resize(plot.id, plotHost.clientWidth, plotHost.clientHeight)
      })
    }
    setRightTab('doc')
    inspectorTabBtn.addEventListener('click', () => setRightTab('inspector'))
    plotTabBtn.addEventListener('click', () => setRightTab('plot'))
    docTabBtn.addEventListener('click', () => setRightTab('doc'))
    versionTabBtn.addEventListener('click', () => setRightTab('version'))

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
    this.renderLessonVersions()
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
    this.closeAIPanel()
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
      item.dataset.lessonSource = lesson.source ?? 'builtin'
      item.innerHTML = `
        <div class="lesson-title">${escapeHtml(lesson.title)}</div>
        <div class="lesson-tags">${escapeHtml((lesson.tags ?? []).join(', '))}</div>
      `
      item.addEventListener('click', () => this.lessonSelectHandler?.(lesson.id))
      this.lessonListEl.appendChild(item)
    }
  }

  private renderLessonVersions(): void {
    if (!this.lessonVersionRootEl) return

    const root = this.lessonVersionRootEl
    root.innerHTML = ''
    const data = this.lessonVersionData
    if (!data) {
      root.innerHTML = '<p class="version-empty">No version data.</p>'
      return
    }

    const title = document.createElement('h3')
    title.className = 'version-panel-title'
    title.textContent = data.source === 'ai' ? `Version · ${data.lessonId}` : 'Version'
    root.appendChild(title)

    if (data.source !== 'ai') {
      const empty = document.createElement('p')
      empty.className = 'version-empty'
      empty.textContent = 'Built-in lesson does not have editable history.'
      root.appendChild(empty)
      return
    }

    const summary = document.createElement('p')
    summary.className = 'version-summary'
    summary.textContent = data.currentRevision
      ? `Current revision: r${data.currentRevision}`
      : 'No revision available.'
    root.appendChild(summary)

    if (data.metadata) {
      const meta = document.createElement('p')
      meta.className = 'version-summary'
      const strategyText = data.metadata.lastStrategy ? `, strategy: ${data.metadata.lastStrategy}` : ''
      const truncatedText = data.metadata.historyTruncated ? ', history trimmed' : ''
      meta.textContent = `Head r${data.metadata.headRevision} @ ${formatTimeText(data.metadata.headUpdatedAt)}, last action: ${data.metadata.lastAction}${strategyText}${truncatedText}`
      root.appendChild(meta)

      const note = document.createElement('p')
      note.className = 'version-summary'
      note.textContent = `Head note: ${data.metadata.lastNote || '(No note)'}`
      root.appendChild(note)
    }

    if (data.entries.length === 0) {
      const empty = document.createElement('p')
      empty.className = 'version-empty'
      empty.textContent = 'No history entries yet.'
      root.appendChild(empty)
      return
    }

    for (const entry of data.entries) {
      const card = document.createElement('div')
      card.className = 'version-card'
      if (entry.isCurrent) card.classList.add('current')

      const head = document.createElement('div')
      head.className = 'version-card-head'
      head.textContent = `r${entry.revision} · ${entry.action} · ${formatTimeText(entry.createdAt)}`

      const note = document.createElement('p')
      note.className = 'version-note'
      note.textContent = entry.note || '(No note)'

      card.append(head, note)

      if (entry.orchestration) {
        const orchestration = document.createElement('p')
        orchestration.className = 'version-note'
        const capabilityInfo = entry.orchestration.capabilitySnapshotId
          ? ` · ${entry.orchestration.capabilitySnapshotId} · caps:${entry.orchestration.capabilityCount}`
          : ''
        orchestration.textContent = `orchestration: ${entry.orchestration.strategy} · ${entry.orchestration.requestId} · ${formatTimeText(entry.orchestration.generatedAt)}${capabilityInfo}`
        card.appendChild(orchestration)
      }

      const actionWrap = document.createElement('div')
      actionWrap.className = 'version-actions'
      const switchBtn = document.createElement('button')
      switchBtn.type = 'button'
      switchBtn.className = 'version-switch-btn'
      switchBtn.textContent = entry.isCurrent ? 'Current' : 'Switch'
      switchBtn.disabled = entry.isCurrent
      switchBtn.addEventListener('click', () => {
        void this.lessonVersionHandlers?.onSwitchVersion(data.lessonId, entry.revision)
      })
      actionWrap.appendChild(switchBtn)
      card.appendChild(actionWrap)

      root.appendChild(card)
    }
  }

  private renderLessonActions(): void {
    if (!this.lessonActionsEl) return
    this.lessonActionsEl.innerHTML = ''
    if (!this.lessonActionHandlers) return

    const createBtn = this.makeLessonActionIcon('create', 'AI create course')
    createBtn.addEventListener('click', () => this.openAIPanel('create'))

    const updateBtn = this.makeLessonActionIcon('update', 'AI update active course')
    updateBtn.disabled = !this.activeLessonId
    updateBtn.addEventListener('click', () => this.openAIPanel('update'))

    const configBtn = this.makeLessonActionIcon('settings', 'Configure AI API')
    configBtn.addEventListener('click', () => this.openAIPanel('settings'))

    const deleteBtn = this.makeLessonActionIcon('delete', 'Delete active AI course')
    deleteBtn.classList.add('danger')
    const canDelete = Boolean(this.activeLessonId) && this.activeLessonSource === 'ai'
    deleteBtn.disabled = !canDelete
    deleteBtn.addEventListener('click', () => {
      if (!canDelete) return
      this.setAIStatus('Double-click the delete icon to confirm removal.', 'info')
    })
    deleteBtn.addEventListener('dblclick', () => {
      if (!canDelete) return
      this.openAIPanel('delete')
    })

    this.lessonActionsEl.append(createBtn, updateBtn, configBtn, deleteBtn)
  }

  private createAIFloatingPanel(): HTMLDivElement {
    const overlay = document.createElement('div')
    overlay.className = 'ai-floating-overlay'
    overlay.setAttribute('aria-hidden', 'true')

    const panel = document.createElement('section')
    panel.className = 'ai-floating-panel'
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')

    const header = document.createElement('header')
    header.className = 'ai-floating-header'
    const title = document.createElement('h3')
    title.className = 'ai-floating-title'
    title.textContent = 'AI Action'
    header.appendChild(title)

    const body = document.createElement('div')
    body.className = 'ai-floating-body'

    const actions = document.createElement('footer')
    actions.className = 'ai-floating-actions'
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'ai-modal-btn'
    cancelBtn.textContent = 'Cancel'

    const confirmBtn = document.createElement('button')
    confirmBtn.type = 'button'
    confirmBtn.className = 'ai-modal-btn confirm'
    confirmBtn.textContent = 'Confirm'

    actions.append(cancelBtn, confirmBtn)
    panel.append(header, body, actions)
    overlay.appendChild(panel)

    overlay.addEventListener('click', () => this.closeAIPanel())
    panel.addEventListener('click', (event) => event.stopPropagation())
    cancelBtn.addEventListener('click', () => this.closeAIPanel())
    confirmBtn.addEventListener('click', () => {
      void this.handleAIPanelConfirm()
    })

    this.aiPanelOverlayEl = overlay
    this.aiPanelBodyEl = body
    this.aiPanelTitleEl = title
    this.aiPanelConfirmEl = confirmBtn

    return overlay
  }

  private openAIPanel(mode: AIPanelMode): void {
    if (!this.lessonActionHandlers) return
    if ((mode === 'update' || mode === 'delete') && !this.activeLessonId) {
      this.setAIStatus('Please select a lesson first.', 'error')
      return
    }
    if (mode === 'delete' && this.activeLessonSource !== 'ai') {
      this.setAIStatus('Only AI lessons can be deleted.', 'error')
      return
    }

    this.aiPanelMode = mode
    this.renderAIPanelMode(mode)
    if (!this.aiPanelOverlayEl) return
    this.aiPanelOverlayEl.classList.add('open')
    this.aiPanelOverlayEl.setAttribute('aria-hidden', 'false')
  }

  private closeAIPanel(): void {
    this.aiPanelMode = null
    if (!this.aiPanelOverlayEl) return
    this.aiPanelOverlayEl.classList.remove('open')
    this.aiPanelOverlayEl.setAttribute('aria-hidden', 'true')
  }

  private async handleAIPanelConfirm(): Promise<void> {
    if (!this.aiPanelMode || !this.lessonActionHandlers) return

    if (this.aiPanelMode === 'create') {
      const payload = this.collectAICreatePayload()
      if (!payload) {
        this.setAIStatus('Please fill title and description.', 'error')
        return
      }
      this.setAIStatus('Requesting AI to create a course...', 'info')
      this.closeAIPanel()
      await this.lessonActionHandlers.onCreateAI(payload)
      return
    }

    if (this.aiPanelMode === 'update') {
      const payload = this.collectAIUpdatePayload()
      if (!payload) {
        this.setAIStatus('Please provide update feedback.', 'error')
        return
      }
      this.setAIStatus('Requesting AI to update this course...', 'info')
      this.closeAIPanel()
      await this.lessonActionHandlers.onUpdateAI(this.activeLessonId, payload)
      return
    }

    if (this.aiPanelMode === 'settings') {
      const settings = this.collectAISettingsPayload()
      this.setAIStatus('Saving AI settings...', 'info')
      this.closeAIPanel()
      await this.lessonActionHandlers.onConfigureAI(settings)
      return
    }

    if (!this.activeLessonId) {
      this.setAIStatus('Please select a lesson first.', 'error')
      return
    }
    this.setAIStatus('Deleting AI course...', 'info')
    this.closeAIPanel()
    await this.lessonActionHandlers.onDeleteAI(this.activeLessonId)
  }

  private renderAIPanelMode(mode: AIPanelMode): void {
    if (!this.aiPanelBodyEl || !this.aiPanelTitleEl || !this.aiPanelConfirmEl) return

    this.aiPanelBodyEl.innerHTML = ''
    this.resetAIFormElements()
    this.aiPanelConfirmEl.classList.remove('danger')

    if (mode === 'create') {
      this.aiPanelTitleEl.textContent = 'Create AI Course'
      this.aiPanelConfirmEl.textContent = 'Create'
      this.renderCreateFields(this.aiPanelBodyEl)
      return
    }

    if (mode === 'update') {
      this.aiPanelTitleEl.textContent = 'Update Active Course'
      this.aiPanelConfirmEl.textContent = 'Update'
      this.renderUpdateFields(this.aiPanelBodyEl)
      return
    }

    if (mode === 'settings') {
      this.aiPanelTitleEl.textContent = 'AI Settings'
      this.aiPanelConfirmEl.textContent = 'Save'
      this.renderSettingsFields(this.aiPanelBodyEl)
      return
    }

    this.aiPanelTitleEl.textContent = 'Delete Course'
    this.aiPanelConfirmEl.textContent = 'Delete'
    this.aiPanelConfirmEl.classList.add('danger')
    this.renderDeleteFields(this.aiPanelBodyEl)
  }

  private renderCreateFields(container: HTMLElement): void {
    const titleInput = this.createDraftInput('createTitle', 'Course title')
    const descInput = this.createDraftTextarea('createDescription', 'Describe goal, audience, length, and expected output', 4)
    const tagsInput = this.createDraftInput('createTags', 'Tags, separated by commas')

    this.aiCreateTitleEl = titleInput
    this.aiCreateDescEl = descInput
    this.aiCreateTagsEl = tagsInput

    this.appendAIPanelField(container, 'Title', titleInput)
    this.appendAIPanelField(container, 'Description', descInput)
    this.appendAIPanelField(container, 'Tags', tagsInput)
  }

  private renderUpdateFields(container: HTMLElement): void {
    const feedbackInput = this.createDraftTextarea('feedback', 'Describe what should be changed', 4)
    const forceCheckbox = this.createDraftCheckbox(
      'forceOnCapabilityMismatch',
      'Force update when capability snapshot drift/missing',
    )
    const forceWrap = document.createElement('label')
    forceWrap.className = 'ai-floating-note'
    forceWrap.style.display = 'flex'
    forceWrap.style.alignItems = 'center'
    forceWrap.style.gap = '8px'
    const forceText = document.createElement('span')
    forceText.textContent = 'Force update if capability snapshot has drift/missing'
    forceWrap.append(forceCheckbox, forceText)
    this.aiFeedbackEl = feedbackInput
    this.aiForceCapabilityMismatchEl = forceCheckbox

    this.appendAIPanelField(container, 'Feedback', feedbackInput)
    this.appendAIPanelField(container, 'Compatibility Override', forceWrap)
  }

  private renderSettingsFields(container: HTMLElement): void {
    const endpointInput = this.createDraftInput('endpoint', 'OpenAI-compatible endpoint')
    const modelInput = this.createDraftInput('model', 'Model name, e.g. gpt-4o-mini')
    const keyInput = this.createDraftInput('apiKey', 'API key', 'password')
    const modeSelect = this.createDraftSelect('orchestratorMode', [
      { value: 'direct', label: 'Direct (LLM API)' },
      { value: 'pipeline', label: 'Pipeline (Backend)' },
    ])
    const orchestratorEndpointInput = this.createDraftInput(
      'orchestratorEndpoint',
      'Pipeline endpoint, e.g. https://api.example.com/course/orchestrate',
    )

    this.aiEndpointEl = endpointInput
    this.aiModelEl = modelInput
    this.aiApiKeyEl = keyInput
    this.aiOrchestratorModeEl = modeSelect
    this.aiOrchestratorEndpointEl = orchestratorEndpointInput

    this.appendAIPanelField(container, 'Endpoint', endpointInput)
    this.appendAIPanelField(container, 'Model', modelInput)
    this.appendAIPanelField(container, 'API Key', keyInput)
    this.appendAIPanelField(container, 'Orchestrator Mode', modeSelect)
    this.appendAIPanelField(container, 'Orchestrator Endpoint', orchestratorEndpointInput)
  }

  private renderDeleteFields(container: HTMLElement): void {
    const description = document.createElement('p')
    description.className = 'ai-floating-note'
    description.textContent = this.activeLessonId
      ? `Delete current lesson: ${this.activeLessonId}`
      : 'No selected lesson.'
    container.appendChild(description)
  }

  private appendAIPanelField(container: HTMLElement, labelText: string, control: HTMLElement): void {
    const field = document.createElement('label')
    field.className = 'ai-floating-field'

    const label = document.createElement('span')
    label.className = 'ai-floating-label'
    label.textContent = labelText

    field.append(label, control)
    container.appendChild(field)
  }

  private createDraftInput(
    key: 'createTitle' | 'createTags' | 'endpoint' | 'apiKey' | 'model' | 'orchestratorEndpoint',
    placeholder: string,
    type: string = 'text'
  ): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'ai-input'
    input.type = type
    input.placeholder = placeholder
    input.value = this.aiFormDraft[key]
    input.addEventListener('input', () => {
      this.aiFormDraft[key] = input.value
    })
    return input
  }

  private createDraftTextarea(
    key: 'createDescription' | 'feedback',
    placeholder: string,
    rows = 3
  ): HTMLTextAreaElement {
    const textarea = document.createElement('textarea')
    textarea.className = 'ai-textarea'
    textarea.placeholder = placeholder
    textarea.rows = rows
    textarea.value = this.aiFormDraft[key]
    textarea.addEventListener('input', () => {
      this.aiFormDraft[key] = textarea.value
    })
    return textarea
  }

  private createDraftSelect(
    key: 'orchestratorMode',
    options: Array<{ value: string; label: string }>,
  ): HTMLSelectElement {
    const select = document.createElement('select')
    select.className = 'ai-input'
    for (const option of options) {
      const node = document.createElement('option')
      node.value = option.value
      node.textContent = option.label
      select.appendChild(node)
    }
    select.value = typeof this.aiFormDraft[key] === 'string' ? String(this.aiFormDraft[key]) : options[0]?.value ?? ''
    select.addEventListener('change', () => {
      this.aiFormDraft[key] = select.value as typeof this.aiFormDraft[typeof key]
    })
    return select
  }

  private createDraftCheckbox(
    key: 'forceOnCapabilityMismatch',
    label: string,
  ): HTMLInputElement {
    const input = document.createElement('input')
    input.className = 'ai-checkbox'
    input.type = 'checkbox'
    input.title = label
    input.checked = Boolean(this.aiFormDraft[key])
    input.addEventListener('change', () => {
      this.aiFormDraft[key] = input.checked as typeof this.aiFormDraft[typeof key]
    })
    return input
  }

  private resetAIFormElements(): void {
    this.aiCreateTitleEl = null
    this.aiCreateDescEl = null
    this.aiCreateTagsEl = null
    this.aiFeedbackEl = null
    this.aiForceCapabilityMismatchEl = null
    this.aiEndpointEl = null
    this.aiApiKeyEl = null
    this.aiModelEl = null
    this.aiOrchestratorModeEl = null
    this.aiOrchestratorEndpointEl = null
  }
  private makeLessonActionIcon(icon: keyof typeof AI_ICON, title: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'lesson-action-icon'
    button.title = title
    button.setAttribute('aria-label', title)
    button.innerHTML = AI_ICON[icon]
    return button
  }

  private collectAICreatePayload(): AIPanelCreatePayload | null {
    const rawTitle = this.aiCreateTitleEl?.value ?? this.aiFormDraft.createTitle
    const rawDescription = this.aiCreateDescEl?.value ?? this.aiFormDraft.createDescription
    const rawTags = this.aiCreateTagsEl?.value ?? this.aiFormDraft.createTags
    const title = rawTitle.trim()
    const description = rawDescription.trim()
    const tags = this.parseTags(rawTags)
    this.aiFormDraft.createTitle = rawTitle
    this.aiFormDraft.createDescription = rawDescription
    this.aiFormDraft.createTags = rawTags
    if (!title || !description) return null
    return { title, description, tags }
  }

  private collectAIUpdatePayload(): AIPanelUpdatePayload | null {
    const rawFeedback = this.aiFeedbackEl?.value ?? this.aiFormDraft.feedback
    const feedback = rawFeedback.trim()
    this.aiFormDraft.feedback = rawFeedback
    const forceOnCapabilityMismatch = Boolean(
      this.aiForceCapabilityMismatchEl?.checked ?? this.aiFormDraft.forceOnCapabilityMismatch
    )
    this.aiFormDraft.forceOnCapabilityMismatch = forceOnCapabilityMismatch
    if (!feedback) return null
    return { feedback, forceOnCapabilityMismatch }
  }

  private collectAISettingsPayload(): AIPanelSettingsPayload {
    const endpoint = (this.aiEndpointEl?.value ?? this.aiFormDraft.endpoint).trim()
    const apiKey = (this.aiApiKeyEl?.value ?? this.aiFormDraft.apiKey).trim()
    const model = (this.aiModelEl?.value ?? this.aiFormDraft.model).trim()
    const orchestratorModeRaw = this.aiOrchestratorModeEl?.value ?? this.aiFormDraft.orchestratorMode
    const orchestratorMode = orchestratorModeRaw === 'pipeline' ? 'pipeline' : 'direct'
    const orchestratorEndpoint = (this.aiOrchestratorEndpointEl?.value ?? this.aiFormDraft.orchestratorEndpoint).trim()
    this.aiFormDraft.endpoint = endpoint
    this.aiFormDraft.apiKey = apiKey
    this.aiFormDraft.model = model
    this.aiFormDraft.orchestratorMode = orchestratorMode
    this.aiFormDraft.orchestratorEndpoint = orchestratorEndpoint
    return {
      endpoint,
      apiKey,
      model,
      orchestratorMode,
      orchestratorEndpoint,
    }
  }

  private parseTags(raw: string): string[] {
    return raw
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
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
    parts.push('<p>鏆傛棤璇剧▼鏂囨。銆?/p>')
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

function formatTimeText(value: string): string {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return value
  return `${time.getFullYear()}-${String(time.getMonth() + 1).padStart(2, '0')}-${String(time.getDate()).padStart(2, '0')} ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`
}

