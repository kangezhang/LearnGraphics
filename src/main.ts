import './style.css'
import { Shell } from '@/app/shell/shell'
import { Router } from '@/app/router'
import { RendererHost } from '@/core/renderer/RendererHost'
import { LessonHost } from '@/core/scene-host/LessonHost'
import { lessons } from '@/lessons'

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) {
  throw new Error('Missing #app root element')
}

const shell = new Shell(appRoot)
const rendererHost = new RendererHost(shell.getCanvas())
const lessonHost = new LessonHost(rendererHost, shell.getUI())

const availableLessons = lessons
const defaultLessonId = availableLessons[0]?.id ?? 'vector-dot'
let router: Router
let loadToken = 0

const loadLesson = async (id: string) => {
  const entry = availableLessons.find((l) => l.id === id) ?? availableLessons[0]
  if (!entry) return
  const token = ++loadToken
  shell.markActiveLesson(entry.id)
  shell.setDoc(entry.doc)
  try {
    await lessonHost.mount(entry.load)
  } catch (error) {
    console.error(`Failed to load lesson "${id}"`, error)
    shell.setDoc('Lesson 加载失败，请检查控制台日志。')
  }
  if (token !== loadToken) return
}

const handleLessonClick = (id: string) => {
  if (router) router.navigate(id)
}

shell.setLessons(
  availableLessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    tags: lesson.tags,
  })),
  handleLessonClick,
)

router = new Router((id) => {
  loadLesson(id)
}, defaultLessonId)

router.init()
rendererHost.setUpdate((dt) => lessonHost.update(dt))
rendererHost.start()
