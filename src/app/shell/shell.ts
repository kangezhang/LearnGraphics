import type { LessonMeta } from '@/core/types'
import { UIBridge } from './ui'

type LessonSelectHandler = (id: string) => void

export class Shell {
  private canvas: HTMLCanvasElement
  private lessonList: HTMLElement
  private docPanel: HTMLElement
  private paramsPanel: HTMLElement
  private tabButtons: Record<'doc' | 'params', HTMLButtonElement>
  private tabBodies: Record<'doc' | 'params', HTMLElement>
  private ui: UIBridge

  constructor(root: HTMLElement) {
    root.innerHTML = ''
    root.classList.add('app-shell')

    const sidebar = document.createElement('aside')
    sidebar.className = 'sidebar'

    const brand = document.createElement('div')
    brand.className = 'brand'
    brand.textContent = 'LearnGraphics'

    this.lessonList = document.createElement('div')
    this.lessonList.className = 'lesson-list'

    sidebar.append(brand, this.lessonList)

    const main = document.createElement('main')
    main.className = 'stage'
    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'canvas-wrap'
    this.canvas = document.createElement('canvas')
    this.canvas.id = 'viewer'
    canvasWrap.appendChild(this.canvas)
    main.appendChild(canvasWrap)

    const panel = document.createElement('aside')
    panel.className = 'panel'
    const tabs = document.createElement('div')
    tabs.className = 'tabs'
    const docTab = document.createElement('button')
    docTab.textContent = '说明'
    docTab.className = 'active'
    const paramsTab = document.createElement('button')
    paramsTab.textContent = '参数'
    this.tabButtons = { doc: docTab, params: paramsTab }
    tabs.append(docTab, paramsTab)

    const tabBody = document.createElement('div')
    tabBody.className = 'tab-body'
    this.docPanel = document.createElement('div')
    this.docPanel.className = 'tab-panel active doc-panel'
    this.paramsPanel = document.createElement('div')
    this.paramsPanel.className = 'tab-panel params-panel'
    this.tabBodies = { doc: this.docPanel, params: this.paramsPanel }
    tabBody.append(this.docPanel, this.paramsPanel)

    panel.append(tabs, tabBody)

    root.append(sidebar, main, panel)

    this.ui = new UIBridge(this.paramsPanel)
    this.bindTabs()
  }

  getCanvas() {
    return this.canvas
  }

  getUI() {
    return this.ui
  }

  setLessons(lessons: LessonMeta[], onSelect: LessonSelectHandler) {
    this.lessonList.innerHTML = ''
    lessons.forEach((lesson) => {
      const item = document.createElement('button')
      item.className = 'lesson-item'
      item.dataset.id = lesson.id
      item.innerHTML = `<div class="lesson-title">${lesson.title}</div><div class="lesson-tags">${lesson.tags?.join(', ') ?? ''}</div>`
      item.addEventListener('click', () => onSelect(lesson.id))
      this.lessonList.appendChild(item)
    })
  }

  markActiveLesson(id: string) {
    const items = Array.from(this.lessonList.querySelectorAll<HTMLButtonElement>('.lesson-item'))
    items.forEach((item) => {
      item.classList.toggle('active', item.dataset.id === id)
    })
  }

  setDoc(content?: string) {
    this.docPanel.textContent = content?.trim() || '暂无文档'
  }

  private bindTabs() {
    this.tabButtons.doc.addEventListener('click', () => this.showTab('doc'))
    this.tabButtons.params.addEventListener('click', () => this.showTab('params'))
  }

  private showTab(tab: 'doc' | 'params') {
    Object.entries(this.tabButtons).forEach(([key, btn]) => {
      btn.classList.toggle('active', key === tab)
    })
    Object.entries(this.tabBodies).forEach(([key, el]) => {
      el.classList.toggle('active', key === tab)
    })
  }
}
