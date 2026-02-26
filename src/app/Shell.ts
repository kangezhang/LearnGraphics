import { SelectionStore } from '@/semantic/SelectionStore'
import { ViewManager } from '@/views/ViewManager'
import { View3D } from '@/views/View3D'
import { GraphView } from '@/views/GraphView'
import { InspectorView } from '@/views/InspectorView'
import { PlotView } from '@/views/PlotView'
import { SemanticGraph } from '@/semantic/model/SemanticGraph'
import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { TimelineBar } from '@/timeline/ui/TimelineBar'
import { TimelineEditorUI } from '@/timeline/ui/TimelineEditorUI'

const BAR_H = 44
const EDITOR_H = 180

export interface LessonListItem {
  id: string
  title: string
  tags?: string[]
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

  private lessonListEl: HTMLElement | null = null
  private lessonSelectHandler: ((id: string) => void) | null = null

  constructor(root: HTMLElement) {
    this.root = root
    this.viewManager = new ViewManager(this.selection)
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

  private buildLayout(): void {
    this.root.innerHTML = ''
    this.root.classList.add('app-shell')
    this.root.style.cssText = `
      display:grid;
      grid-template-columns:240px 1fr 1fr 280px;
      grid-template-rows:1fr ${BAR_H}px;
      width:100vw;height:100vh;overflow:hidden;background:#0f1116;
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
    sidebar.append(brand, lessonList)
    this.lessonListEl = lessonList

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
    const inspectorTabBtn = document.createElement('button')
    inspectorTabBtn.textContent = 'Inspector'
    inspectorTabBtn.style.cssText = this.tabButtonStyle(true)
    const plotTabBtn = document.createElement('button')
    plotTabBtn.textContent = 'Plot'
    plotTabBtn.style.cssText = this.tabButtonStyle(false)
    rightTabs.append(inspectorTabBtn, plotTabBtn)

    const rightBody = document.createElement('div')
    rightBody.style.cssText = 'position:relative;flex:1;overflow:hidden;'

    const inspectorHost = document.createElement('div')
    inspectorHost.style.cssText = 'position:absolute;inset:0;display:block;'
    const plotHost = document.createElement('div')
    plotHost.style.cssText = 'position:absolute;inset:0;display:none;'
    rightBody.append(inspectorHost, plotHost)
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
    const view3d = new View3D()
    const graphView = new GraphView()
    const inspector = new InspectorView()
    const plot = new PlotView()

    this._view3d = view3d

    this.viewManager.register(view3d, panel3d)
    this.viewManager.register(graphView, panelGraph)
    this.viewManager.register(inspector, inspectorHost)
    this.viewManager.register(plot, plotHost)

    const setRightTab = (tab: 'inspector' | 'plot'): void => {
      const inspectorActive = tab === 'inspector'
      inspectorHost.style.display = inspectorActive ? 'block' : 'none'
      plotHost.style.display = inspectorActive ? 'none' : 'block'
      inspectorTabBtn.style.cssText = this.tabButtonStyle(inspectorActive)
      plotTabBtn.style.cssText = this.tabButtonStyle(!inspectorActive)
      requestAnimationFrame(() => {
        this.viewManager.resize(inspector.id, inspectorHost.clientWidth, inspectorHost.clientHeight)
        this.viewManager.resize(plot.id, plotHost.clientWidth, plotHost.clientHeight)
      })
    }
    inspectorTabBtn.addEventListener('click', () => setRightTab('inspector'))
    plotTabBtn.addEventListener('click', () => setRightTab('plot'))

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

  loadGraph(graph: SemanticGraph): void {
    this.selection.select([])
    this.viewManager.loadGraph(graph)
  }

  getView3D(): View3D | null {
    return this._view3d
  }

  dispose(): void {
    this._timelineBar?.dispose()
    this._timelineEditor?.dispose()
    this.viewManager.dispose()
  }

  private makePanel(extraClass = ''): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = 'position:relative;overflow:hidden;border-right:1px solid #1e2330'
    if (extraClass) el.classList.add(extraClass)
    return el
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
