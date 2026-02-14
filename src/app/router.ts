type RouteChangeHandler = (lessonId: string) => void

const parseLessonId = (): string | null => {
  const pathMatch = window.location.pathname.match(/lesson\/([^/]+)/)
  if (pathMatch) return decodeURIComponent(pathMatch[1])

  const hashMatch = window.location.hash.match(/lesson\/([^/]+)/)
  if (hashMatch) return decodeURIComponent(hashMatch[1])

  const search = new URLSearchParams(window.location.search).get('lesson')
  return search
}

export class Router {
  private onLessonChange: RouteChangeHandler
  private defaultLesson: string

  constructor(onLessonChange: RouteChangeHandler, defaultLesson: string) {
    this.onLessonChange = onLessonChange
    this.defaultLesson = defaultLesson
    window.addEventListener('popstate', this.handlePopState)
  }

  init() {
    const initial = parseLessonId() ?? this.defaultLesson
    if (!parseLessonId()) {
      this.push(initial)
    }
    this.onLessonChange(initial)
  }

  navigate(id: string) {
    this.push(id)
    this.onLessonChange(id)
  }

  dispose() {
    window.removeEventListener('popstate', this.handlePopState)
  }

  private push(id: string) {
    const url = `/lesson/${encodeURIComponent(id)}`
    history.pushState({ lesson: id }, '', url)
  }

  private handlePopState = () => {
    const id = parseLessonId() ?? this.defaultLesson
    this.onLessonChange(id)
  }
}
