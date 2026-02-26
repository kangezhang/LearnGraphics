import { SelectionStore } from '@/semantic/SelectionStore'
import { ViewManager } from '@/views/ViewManager'
import { View3D } from '@/views/View3D'
import { GraphView } from '@/views/GraphView'
import { InspectorView } from '@/views/InspectorView'
import { SemanticGraph } from '@/semantic/model/SemanticGraph'
import { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import { TimelineBar } from '@/timeline/ui/TimelineBar'
import { TimelineEditorUI } from '@/timeline/ui/TimelineEditorUI'

const BAR_H = 44
const EDITOR_H = 180

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

  constructor(root: HTMLElement) {
    this.root = root
    this.viewManager = new ViewManager(this.selection)
    this.buildLayout()
  }

  private buildLayout(): void {
    this.root.innerHTML = ''
    this.root.style.cssText = `
      display:grid;
      grid-template-columns:1fr 1fr 280px;
      grid-template-rows:1fr ${BAR_H}px;
      width:100vw;height:100vh;overflow:hidden;background:#0f1116;
      transition:grid-template-rows 0.2s ease;
    `

    const panel3d = this.makePanel()
    const panelGraph = this.makePanel()
    const panelInspector = this.makePanel('inspector-panel')

    const panelTimeline = document.createElement('div')
    panelTimeline.style.cssText = `grid-column:1/-1;display:flex;flex-direction:column;overflow:hidden;`

    const editorArea = document.createElement('div')
    editorArea.style.cssText = `flex:1;overflow:hidden;display:none;`

    const barArea = document.createElement('div')
    barArea.style.cssText = `height:${BAR_H}px;flex-shrink:0;`

    panelTimeline.append(editorArea, barArea)
    this.root.append(panel3d, panelGraph, panelInspector, panelTimeline)

    this._editorPanel = editorArea
    this._timelinePanel = barArea
    const view3d = new View3D()
    const graphView = new GraphView()
    const inspector = new InspectorView()

    this._view3d = view3d

    this.viewManager.register(view3d, panel3d)
    this.viewManager.register(graphView, panelGraph)
    this.viewManager.register(inspector, panelInspector)

    // forward entity-click events from GraphView to SelectionStore
    panelGraph.addEventListener('entity-click', (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id
      const current = this.selection.getSelected()
      if (current.includes(id)) {
        this.selection.select([])
      } else {
        this.selection.select([id])
      }
    })

    // resize observer for each panel
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
    panelInspector.dataset.viewId = inspector.id

    ro.observe(panel3d)
    ro.observe(panelGraph)
    ro.observe(panelInspector)
  }

  setTimeline(runtime: TimelineRuntime): void {
    this._timelineBar?.dispose()
    this._timelineEditor?.dispose()

    this._timelineBar = new TimelineBar(runtime, () => this.toggleEditor())
    if (this._timelinePanel) this._timelineBar.mount(this._timelinePanel)

    this._timelineEditor = new TimelineEditorUI(runtime)
    if (this._editorPanel) this._timelineEditor.mount(this._editorPanel)
  }

  private toggleEditor(): void {
    this._expanded = !this._expanded
    const editorArea = this._editorPanel
    if (!editorArea) return

    if (this._expanded) {
      editorArea.style.display = 'block'
      this.root.style.gridTemplateRows = `1fr ${BAR_H + EDITOR_H}px`
      requestAnimationFrame(() => this._timelineEditor?.resize())
    } else {
      editorArea.style.display = 'none'
      this.root.style.gridTemplateRows = `1fr ${BAR_H}px`
    }
  }

  loadGraph(graph: SemanticGraph): void {
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
}
