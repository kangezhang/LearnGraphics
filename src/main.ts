import './style.css'
import { Shell, type LessonListItem } from '@/app/Shell'
import { DSLParser } from '@/semantic/compiler/DSLParser'
import { DSLCompiler } from '@/semantic/compiler/DSLCompiler'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'

interface LoadedLesson {
  id: string
  title: string
  tags: string[]
  order: number
  graph: SemanticGraph
  runtime: TimelineRuntime
}

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (!appRoot) throw new Error('Missing #app root element')

const shell = new Shell(appRoot)
const parser = new DSLParser()
const compiler = new DSLCompiler()

const lessonFiles = import.meta.glob('./dsl/examples/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const loadedLessons: LoadedLesson[] = []
for (const [path, raw] of Object.entries(lessonFiles)) {
  const parsed = parser.parse(raw, 'yaml')
  if (!parsed.lesson) {
    console.error(`[DSL] parse failed for ${path}`, parsed.issues)
    continue
  }
  if (parsed.issues.length > 0) {
    console.warn(`[DSL] parse issues in ${path}`, parsed.issues)
  }

  const compiled = compiler.compile(parsed.lesson)
  if (compiled.diagnostics.length > 0) {
    console.warn(`[DSL] validation diagnostics in ${path}`, compiled.diagnostics)
  }

  loadedLessons.push({
    id: parsed.lesson.meta.id,
    title: parsed.lesson.meta.title,
    tags: parsed.lesson.meta.tags ?? [],
    order: parsed.lesson.meta.order ?? Number.MAX_SAFE_INTEGER,
    graph: compiled.graph,
    runtime: compiled.timeline,
  })
}

loadedLessons.sort((a, b) => {
  if (a.order !== b.order) return a.order - b.order
  return a.title.localeCompare(b.title)
})

if (loadedLessons.length === 0) {
  throw new Error('No valid lessons loaded from src/dsl/examples/*.yaml')
}

let activeCleanup: Array<() => void> = []
let activeRuntime: TimelineRuntime | null = null

const lessonList: LessonListItem[] = loadedLessons.map(lesson => ({
  id: lesson.id,
  title: lesson.title,
  tags: lesson.tags,
}))

shell.setLessons(lessonList, (id) => {
  switchLesson(id)
}, loadedLessons[0].id)

switchLesson(loadedLessons[0].id)

function switchLesson(id: string): void {
  const lesson = loadedLessons.find(l => l.id === id)
  if (!lesson) return

  if (activeRuntime) activeRuntime.stop()
  activeCleanup.forEach(fn => fn())
  activeCleanup = []
  activeRuntime = lesson.runtime

  shell.loadGraph(lesson.graph)
  shell.setTimeline(lesson.runtime)
  shell.setActiveLesson(lesson.id)

  const nodeIds = lesson.graph.allEntities().filter(e => e.type === 'node').map(e => e.id)
  const VISITED_COLOR = 0x00e5ff
  const DEFAULT_COLOR = 0x4488ff
  let lastVisitedSignature = ''

  const applyVisitedColors = (time: number): void => {
    const evalResult = lesson.runtime.evaluateAt(time)
    const stepEval = evalResult.steps.find(s => s.trackId === 'steps') ?? evalResult.steps[0]
    const completedSteps = stepEval?.completed ?? []
    const visitedNodeIds = new Set<string>()

    for (const step of completedSteps) {
      const payload = step.payload as { nodeId?: string } | undefined
      const nodeId = payload?.nodeId ?? step.label
      if (nodeId) visitedNodeIds.add(nodeId)
    }

    const signature = Array.from(visitedNodeIds).sort().join('|')
    if (signature === lastVisitedSignature) return
    lastVisitedSignature = signature

    for (const nodeId of nodeIds) {
      shell.getView3D()?.setNodeColor(nodeId, DEFAULT_COLOR)
    }
    for (const nodeId of visitedNodeIds) {
      shell.getView3D()?.setNodeColor(nodeId, VISITED_COLOR)
    }
  }

  activeCleanup.push(
    lesson.runtime.on({
      type: 'tick',
      handler: (time) => applyVisitedColors(time),
    }),
    lesson.runtime.on({
      type: 'event',
      handler: (evt) => {
        if (evt.name === 'visit') {
          const payload = evt.payload as { nodeId?: string; step?: number } | undefined
          const nodeId = payload?.nodeId ?? '(unknown)'
          const step = typeof payload?.step === 'number' ? payload.step + 1 : '?'
          console.log(`[${lesson.id}] step ${step}: visit ${nodeId}`)
        }
      },
    }),
    lesson.runtime.on({
      type: 'end',
      handler: () => {
        console.log(`[${lesson.id}] traversal complete`)
      },
    }),
  )

  applyVisitedColors(0)
}
