import './style.css'
import { Shell, type LessonControlSlider, type LessonListItem } from '@/app/Shell'
import { DSLParser } from '@/semantic/compiler/DSLParser'
import { DSLCompiler } from '@/semantic/compiler/DSLCompiler'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { BindingRegistry } from '@/semantic/bindings/BindingManager'
import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import type { DSLUIBinding, DSLUISlider, LessonDSL } from '@/semantic/compiler/dslTypes'

interface LoadedLesson {
  id: string
  title: string
  tags: string[]
  order: number
  doc: string
  dsl: LessonDSL
  graph: SemanticGraph
  runtime: TimelineRuntime
  bindings: BindingRegistry
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
const lessonDocFiles = import.meta.glob('../content/lessons/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const lessonDocsById = new Map<string, string>()
for (const [path, raw] of Object.entries(lessonDocFiles)) {
  const fileName = path.split('/').pop()
  if (!fileName || !fileName.endsWith('.md')) continue
  const id = fileName.slice(0, -3)
  if (id.toLowerCase() === 'readme') continue
  lessonDocsById.set(id, raw)
}

const loadedLessons: LoadedLesson[] = []
const missingDocs: string[] = []
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

  const lessonId = parsed.lesson.meta.id
  const lessonDoc = lessonDocsById.get(lessonId)
  if (!lessonDoc) missingDocs.push(lessonId)

  loadedLessons.push({
    id: lessonId,
    title: parsed.lesson.meta.title,
    tags: parsed.lesson.meta.tags ?? [],
    order: parsed.lesson.meta.order ?? Number.MAX_SAFE_INTEGER,
    doc: lessonDoc ?? '',
    dsl: parsed.lesson,
    graph: compiled.graph,
    runtime: compiled.timeline,
    bindings: compiled.bindings,
  })
}

if (missingDocs.length > 0) {
  const expected = missingDocs.map(id => `content/lessons/${id}.md`).join(', ')
  throw new Error(`Missing lesson docs: ${expected}`)
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

  shell.loadGraph(lesson.graph, lesson.bindings)
  shell.setTimeline(lesson.runtime)
  shell.setActiveLesson(lesson.id)
  shell.setLessonDoc(lesson.title, lesson.doc)
  shell.setLessonLayout({
    showGraphPanel: resolveGraphPanelVisibility(lesson),
  })
  shell.setCoordinateFramePreference(resolveCoordinateFramePreference(lesson.dsl))
  const controls = buildLessonControls(lesson)
  shell.setLessonControls(controls.sliders)

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
      handler: (time) => {
        applyVisitedColors(time)
        controls.onTimelineTick(time)
      },
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
  controls.onTimelineTick(lesson.runtime.time)
}

type DeclaredViewType = '3d' | 'graph' | 'inspector' | 'plot'

function resolveGraphPanelVisibility(lesson: LoadedLesson): boolean {
  const declaredViews = resolveDeclaredViews(lesson.dsl)
  if (declaredViews.size > 0) {
    return declaredViews.has('graph')
  }
  return lesson.graph.allEntities().some(entity => entity.type === 'node')
}

function resolveDeclaredViews(dsl: LessonDSL): Set<DeclaredViewType> {
  const supported = new Set<DeclaredViewType>(['3d', 'graph', 'inspector', 'plot'])
  const resolved = new Set<DeclaredViewType>()
  for (const view of dsl.views ?? []) {
    const type = typeof view.type === 'string' ? view.type : ''
    if (supported.has(type as DeclaredViewType)) {
      resolved.add(type as DeclaredViewType)
    }
  }
  return resolved
}

function resolveCoordinateFramePreference(dsl: LessonDSL): boolean | null {
  const view3d = (dsl.views ?? []).find(view => view.type === '3d')
  if (!view3d || !Array.isArray(view3d.overlays) || view3d.overlays.length === 0) return null

  const overlays = new Set(
    view3d.overlays
      .map(item => (typeof item === 'string' ? item.trim().toLowerCase() : ''))
      .filter(Boolean)
  )

  if (
    overlays.has('no_coordinate_frame')
    || overlays.has('hide_coordinate_frame')
    || overlays.has('no_axes')
    || overlays.has('hide_axes')
  ) {
    return false
  }

  if (
    overlays.has('coordinate_frame')
    || overlays.has('world_axes')
    || overlays.has('axes')
    || overlays.has('grid')
  ) {
    return true
  }

  return null
}

interface BuiltLessonControls {
  sliders: LessonControlSlider[]
  onTimelineTick: (time: number) => void
}

interface SliderFrameBinding {
  targetId: string
  property: string
}

function buildLessonControls(lesson: LoadedLesson): BuiltLessonControls {
  const ui = lesson.dsl.ui
  if (!ui) return { sliders: [], onTimelineTick: () => {} }

  const sliders = normalizeSliders(ui.sliders ?? [])
  if (sliders.length === 0) return { sliders: [], onTimelineTick: () => {} }

  const state: Record<string, number> = {}
  for (const slider of sliders) {
    state[slider.id] = slider.value
  }

  const consts = { ...(ui.constants ?? {}) }
  const bindings = compileUIBindings(sliders, ui.bindings ?? [])
  const frameBindingMap = buildSliderFrameBindingMap(sliders, bindings)

  const applyBindings = (options: { persistToTimeline: boolean }): void => {
    const ctx: UIEvalContext = {
      state,
      consts,
      entity: (id) => lesson.graph.getEntity(id)?.props ?? {},
      relation: (id) => lesson.graph.getRelation(id)?.props ?? {},
    }
    const changedEntityIds = new Set<string>()

    for (const binding of bindings) {
      let value: unknown
      try {
        value = binding.evaluate(ctx)
      } catch (err) {
        console.warn(`[ui] failed to evaluate binding "${binding.id}" in lesson "${lesson.id}"`, err)
        continue
      }

      if (binding.targetKind === 'relation') {
        const relation = lesson.graph.getRelation(binding.target)
        if (!relation) continue
        setPathValue(relation.props, binding.property, value)
        changedEntityIds.add(relation.sourceId)
        changedEntityIds.add(relation.targetId)
        continue
      }

      const entity = lesson.graph.getEntity(binding.target)
      if (entity) {
        setPathValue(entity.props, binding.property, value)
        changedEntityIds.add(entity.id)
        if (options.persistToTimeline) {
          syncPropertyTrackAtTime(lesson.runtime, entity.id, binding.property, value, lesson.runtime.time)
        }
        continue
      }

      const relation = lesson.graph.getRelation(binding.target)
      if (relation) {
        setPathValue(relation.props, binding.property, value)
        changedEntityIds.add(relation.sourceId)
        changedEntityIds.add(relation.targetId)
      }
    }

    shell.notifyGraphMutation(Array.from(changedEntityIds))
  }

  applyBindings({ persistToTimeline: false })

  const onTimelineTick = (time: number): void => {
    if (frameBindingMap.size === 0) return
    const evalResult = lesson.runtime.evaluateAt(time)
    const valueByBinding = new Map<string, number | string>()
    for (const prop of evalResult.properties) {
      valueByBinding.set(`${prop.targetId}.${prop.propName}`, prop.value)
    }

    for (const slider of sliders) {
      const frameBinding = frameBindingMap.get(slider.id)
      if (!frameBinding) continue

      const bindingKey = `${frameBinding.targetId}.${frameBinding.property}`
      const fromTrack = valueByBinding.get(bindingKey)
      const fromEntity = getPathValue(lesson.graph.getEntity(frameBinding.targetId)?.props ?? {}, frameBinding.property)
      const resolved = typeof fromTrack === 'number'
        ? fromTrack
        : (typeof fromEntity === 'number' ? fromEntity : undefined)
      if (!Number.isFinite(resolved)) continue

      const next = clamp(Number(resolved), slider.min, slider.max)
      if (Math.abs((state[slider.id] ?? next) - next) < 1e-6) continue

      state[slider.id] = next
      shell.setLessonControlValue(slider.id, next, false)
    }
  }

  return {
    sliders: sliders.map(slider => ({
      id: slider.id,
      label: slider.label,
      min: slider.min,
      max: slider.max,
      step: slider.step,
      value: state[slider.id],
      defaultValue: slider.value,
      onChange: (value: number) => {
        state[slider.id] = clamp(value, slider.min, slider.max)
        applyBindings({ persistToTimeline: true })
      },
    })),
    onTimelineTick,
  }
}

interface CompiledUIBinding {
  id: string
  target: string
  targetKind: 'entity' | 'relation'
  property: string
  sourceSliderId?: string
  expression?: string
  evaluate: (ctx: UIEvalContext) => unknown
}

interface UIEvalContext {
  state: Record<string, number>
  consts: Record<string, number | string | boolean>
  entity: (id: string) => Record<string, unknown>
  relation: (id: string) => Record<string, unknown>
}

function normalizeSliders(sliders: DSLUISlider[]): DSLUISlider[] {
  const normalized: DSLUISlider[] = []
  for (const slider of sliders) {
    if (!slider || typeof slider.id !== 'string' || slider.id.trim().length === 0) continue
    const min = Number(slider.min)
    const max = Number(slider.max)
    const value = Number(slider.value)
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value)) continue
    normalized.push({
      ...slider,
      id: slider.id.trim(),
      min: Math.min(min, max),
      max: Math.max(min, max),
      value: clamp(value, Math.min(min, max), Math.max(min, max)),
      step: Number.isFinite(Number(slider.step)) ? Number(slider.step) : undefined,
      bindings: slider.bindings ?? [],
    })
  }
  return normalized
}

function compileUIBindings(sliders: DSLUISlider[], globalBindings: DSLUIBinding[]): CompiledUIBinding[] {
  const compiled: CompiledUIBinding[] = []
  const seen = new Set<string>()
  const cache = new Map<string, (...args: unknown[]) => unknown>()

  for (const binding of globalBindings) {
    const item = compileSingleBinding(binding, undefined, cache)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    compiled.push(item)
  }
  for (const slider of sliders) {
    for (const binding of slider.bindings ?? []) {
      const item = compileSingleBinding(binding, slider.id, cache)
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      compiled.push(item)
    }
  }
  return compiled
}

function compileSingleBinding(
  binding: DSLUIBinding,
  sliderId: string | undefined,
  cache: Map<string, (...args: unknown[]) => unknown>
): CompiledUIBinding | null {
  if (!binding || typeof binding.target !== 'string' || typeof binding.property !== 'string') return null
  const target = binding.target.trim()
  const property = binding.property.trim()
  if (target.length === 0 || property.length === 0) return null

  const targetKind = binding.targetKind === 'relation' ? 'relation' : 'entity'
  const bindingId = binding.id?.trim() || `${sliderId ?? 'global'}:${target}.${property}`
  const evaluate = compileBindingEvaluator(binding, sliderId, cache)

  return {
    id: bindingId,
    target,
    targetKind,
    property,
    sourceSliderId: sliderId,
    expression: typeof binding.expr === 'string' ? binding.expr.trim() : undefined,
    evaluate,
  }
}

function compileBindingEvaluator(
  binding: DSLUIBinding,
  sliderId: string | undefined,
  cache: Map<string, (...args: unknown[]) => unknown>
): (ctx: UIEvalContext) => unknown {
  if (typeof binding.expr === 'string' && binding.expr.trim().length > 0) {
    const expr = binding.expr.trim()
    let fn = cache.get(expr)
    if (!fn) {
      fn = new Function(
        'state',
        'consts',
        'entity',
        'relation',
        'degToRad',
        'radToDeg',
        'clamp',
        'formatNumber',
        'Math',
        `return (${expr});`
      ) as (...args: unknown[]) => unknown
      cache.set(expr, fn)
    }
    return (ctx: UIEvalContext): unknown => fn!(
      ctx.state,
      ctx.consts,
      ctx.entity,
      ctx.relation,
      degToRad,
      radToDeg,
      clamp,
      formatNumber,
      Math
    )
  }

  if (binding.value !== undefined) {
    return () => binding.value
  }

  if (sliderId) {
    return (ctx: UIEvalContext) => ctx.state[sliderId]
  }

  return () => undefined
}

function syncPropertyTrackAtTime(
  runtime: TimelineRuntime,
  targetId: string,
  property: string,
  value: unknown,
  time: number
): void {
  if (typeof value !== 'number' && typeof value !== 'string') return
  const EPS = 1e-6
  for (const track of runtime.getTracks().values()) {
    if (!(track instanceof PropertyTrack)) continue
    if (track.targetId !== targetId || track.propName !== property) continue
    const keyframe = track.getKeyframes().find(kf => Math.abs(kf.time - time) <= EPS)
    if (keyframe) {
      keyframe.value = value
      continue
    }
    track.addKeyframe({ time, value })
  }
}

function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.').map(segment => segment.trim()).filter(Boolean)
  if (parts.length === 0) return

  let current: Record<string, unknown> = target
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    const next = current[key]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[parts[parts.length - 1]] = value
}

function getPathValue(target: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.').map(segment => segment.trim()).filter(Boolean)
  if (parts.length === 0) return undefined
  let current: unknown = target
  for (const key of parts) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

function buildSliderFrameBindingMap(
  sliders: DSLUISlider[],
  bindings: CompiledUIBinding[]
): Map<string, SliderFrameBinding> {
  const sliderIds = new Set(sliders.map(slider => slider.id))
  const candidates = new Map<string, SliderFrameBinding[]>()

  for (const binding of bindings) {
    if (binding.targetKind !== 'entity') continue

    let sliderId: string | undefined
    if (binding.sourceSliderId && !binding.expression) {
      sliderId = binding.sourceSliderId
    } else if (binding.expression) {
      sliderId = extractDirectSliderRef(binding.expression)
    }

    if (!sliderId || !sliderIds.has(sliderId)) continue
    const list = candidates.get(sliderId) ?? []
    list.push({ targetId: binding.target, property: binding.property })
    candidates.set(sliderId, list)
  }

  const resolved = new Map<string, SliderFrameBinding>()
  for (const [sliderId, list] of candidates.entries()) {
    const uniq = new Map<string, SliderFrameBinding>()
    for (const entry of list) {
      uniq.set(`${entry.targetId}.${entry.property}`, entry)
    }
    if (uniq.size === 1) {
      resolved.set(sliderId, Array.from(uniq.values())[0])
    }
  }
  return resolved
}

function extractDirectSliderRef(expression: string): string | undefined {
  const normalized = expression.replace(/\s+/g, '')
  const direct = normalized.match(/^state\.([A-Za-z_][A-Za-z0-9_]*)$/)
  if (direct) return direct[1]

  const wrapped = normalized.match(/^Number\(state\.([A-Za-z_][A-Za-z0-9_]*)\)$/)
  if (wrapped) return wrapped[1]
  return undefined
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180
}

function radToDeg(value: number): number {
  return (value * 180) / Math.PI
}

function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '?'
  const roundedInt = Math.round(value)
  if (Math.abs(value - roundedInt) < 1e-6) return String(roundedInt)
  return value.toFixed(Math.max(0, Math.min(6, Math.floor(digits))))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
