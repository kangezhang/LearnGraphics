import './style.css'
import {
  Shell,
  type AIPanelCreatePayload,
  type AIPanelSettingsPayload,
  type AIPanelUpdatePayload,
  type LessonControlSlider,
  type LessonListItem,
} from '@/app/Shell'
import { DSLParser } from '@/semantic/compiler/DSLParser'
import { DSLCompiler } from '@/semantic/compiler/DSLCompiler'
import type { TimelineRuntime } from '@/timeline/runtime/TimelineRuntime'
import type { SemanticGraph } from '@/semantic/model/SemanticGraph'
import type { BindingRegistry } from '@/semantic/bindings/BindingManager'
import { PropertyTrack } from '@/timeline/runtime/PropertyTrack'
import { LessonStore } from '@/ai/LessonStore'
import { LessonAIService } from '@/ai/LessonAIService'
import { CapabilityDriftError, DefaultCourseOrchestrator } from '@/ai/CourseOrchestrator'
import type { GeneratedLessonPayload, StoredAILesson, StoredAILessonRevision } from '@/ai/types'
import type { DSLUIBinding, DSLUISlider, LessonDSL } from '@/semantic/compiler/dslTypes'

interface LoadedLesson {
  id: string
  source: 'builtin' | 'ai'
  revision: number | null
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

const lessonStore = new LessonStore()
const lessonAI = new LessonAIService()
const courseOrchestrator = new DefaultCourseOrchestrator(lessonAI)
const lessonDocsById = loadLessonDocsById(lessonDocFiles)
const builtInLessons = loadBuiltInLessons(lessonFiles, lessonDocsById)
let loadedLessons: LoadedLesson[] = []
let activeLessonId: string | null = null
let activeCleanup: Array<() => void> = []
let activeRuntime: TimelineRuntime | null = null

shell.setLessonActions({
  onCreateAI: (payload) => handleCreateAILesson(payload),
  onUpdateAI: (id, payload) => handleUpdateAILesson(id, payload),
  onDeleteAI: (id) => handleDeleteAILesson(id),
  onConfigureAI: (settings) => handleConfigureAI(settings),
})
shell.setLessonVersionHandlers({
  onSwitchVersion: (lessonId, revision) => handleSwitchLessonVersion(lessonId, revision),
})
shell.setAISettings(courseOrchestrator.loadSettings())
shell.setAIStatus('Fill in course info and click the + button to create.', 'info')
refreshLessons()

function switchLesson(id: string): void {
  const lesson = loadedLessons.find(l => l.id === id)
  if (!lesson) return
  activeLessonId = lesson.id

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
  shell.setLessonVersions(buildVersionPanelData(lesson))

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

function refreshLessons(preferredActiveId?: string): void {
  const aiLessons = loadAILessons(lessonStore.loadAll())
  loadedLessons = [...builtInLessons, ...aiLessons]
  loadedLessons.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.title.localeCompare(b.title)
  })

  if (loadedLessons.length === 0) {
    shell.setAIStatus('无可用课程，请检查内置 DSL 文件或添加 AI 课程。', 'error')
    return
  }

  const lessonList: LessonListItem[] = loadedLessons.map(lesson => ({
    id: lesson.id,
    title: lesson.title,
    tags: lesson.tags,
    source: lesson.source,
  }))

  const nextActiveId = pickNextActiveLessonId(preferredActiveId)
  shell.setLessons(lessonList, (id) => {
    switchLesson(id)
  }, nextActiveId)
  switchLesson(nextActiveId)
}

function loadLessonDocsById(docFiles: Record<string, string>): Map<string, string> {
  const docs = new Map<string, string>()
  for (const [path, raw] of Object.entries(docFiles)) {
    const fileName = path.split('/').pop()
    if (!fileName || !fileName.endsWith('.md')) continue
    const id = fileName.slice(0, -3)
    if (id.toLowerCase() === 'readme') continue
    docs.set(id, raw)
  }
  return docs
}

function loadBuiltInLessons(
  files: Record<string, string>,
  docsById: Map<string, string>,
): LoadedLesson[] {
  const missingDocs: string[] = []
  const lessons: LoadedLesson[] = []

  for (const [path, raw] of Object.entries(files)) {
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
    const lessonDoc = docsById.get(lessonId)
    if (!lessonDoc) missingDocs.push(lessonId)

    lessons.push({
      id: lessonId,
      source: 'builtin',
      revision: null,
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

  return lessons
}

function loadAILessons(storedLessons: StoredAILesson[]): LoadedLesson[] {
  const lessons: LoadedLesson[] = []
  for (const entry of storedLessons) {
    const parsed = parser.parse(JSON.stringify(entry.dsl), 'json')
    if (!parsed.lesson) {
      console.warn(`[AI] skip invalid stored lesson "${entry.id}"`, parsed.issues)
      continue
    }
    const compiled = compiler.compile(parsed.lesson)
    const hasBlockingError = compiled.diagnostics.some(diag => diag.type === 'error')
    if (hasBlockingError) {
      console.warn(`[AI] skip lesson "${entry.id}" due to diagnostics`, compiled.diagnostics)
      continue
    }
    lessons.push({
      id: parsed.lesson.meta.id,
      source: 'ai',
      revision: entry.revision,
      title: parsed.lesson.meta.title,
      tags: parsed.lesson.meta.tags ?? ['ai'],
      order: parsed.lesson.meta.order ?? 9000,
      doc: entry.doc,
      dsl: parsed.lesson,
      graph: compiled.graph,
      runtime: compiled.timeline,
      bindings: compiled.bindings,
    })
  }
  return lessons
}

function pickNextActiveLessonId(preferredActiveId?: string): string {
  const preferred = preferredActiveId ?? activeLessonId
  if (preferred && loadedLessons.some(lesson => lesson.id === preferred)) return preferred
  return loadedLessons[0].id
}

function buildVersionPanelData(lesson: LoadedLesson): {
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
  entries: Array<{
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
  }>
} {
  if (lesson.source !== 'ai') {
    return {
      lessonId: lesson.id,
      source: lesson.source,
      currentRevision: null,
      metadata: null,
      entries: [],
    }
  }

  const stored = lessonStore.findById(lesson.id)
  const currentRevision = lesson.revision ?? null
  const history = lessonStore.getHistory(lesson.id)
  return {
    lessonId: lesson.id,
    source: lesson.source,
    currentRevision,
    metadata: stored
      ? {
          headRevision: stored.metadata.headRevision,
          headUpdatedAt: stored.metadata.headUpdatedAt,
          lastAction: stored.metadata.lastAction,
          lastNote: stored.metadata.lastNote,
          historyTruncated: stored.metadata.historyTruncated,
          lastStrategy: stored.metadata.lastOrchestration?.strategy ?? null,
        }
      : null,
    entries: history.map((item) => mapHistoryEntry(item, currentRevision)),
  }
}

function mapHistoryEntry(
  item: StoredAILessonRevision,
  currentRevision: number | null,
): {
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
} {
  return {
    revision: item.revision,
    createdAt: item.createdAt,
    action: item.action,
    note: item.note,
    isCurrent: currentRevision !== null && item.revision === currentRevision,
    orchestration: item.orchestration
      ? {
          strategy: item.orchestration.strategy,
          requestId: item.orchestration.requestId,
          orchestrator: item.orchestration.orchestrator,
          generatedAt: item.orchestration.generatedAt,
          capabilitySnapshotId: item.orchestration.capabilitySnapshotId ?? null,
          capabilityCount: item.orchestration.capabilityIds?.length ?? 0,
        }
      : null,
  }
}

async function handleSwitchLessonVersion(lessonId: string, revision: number): Promise<void> {
  const lesson = loadedLessons.find(item => item.id === lessonId)
  if (!lesson || lesson.source !== 'ai') {
    shell.setAIStatus('Only AI lessons support version switching.', 'error')
    return
  }

  const result = lessonStore.rollbackToRevision(lessonId, revision, `Switch from panel to r${revision}`)
  if (!result) {
    shell.setAIStatus(`Failed to switch: revision r${revision} not found.`, 'error')
    return
  }

  refreshLessons(result.id)
  shell.setAIStatus(`Switched to r${revision}. New head revision is r${result.revision}.`, 'success')
}

async function handleCreateAILesson(payload: AIPanelCreatePayload): Promise<void> {
  const normalizedTitle = payload.title.trim()
  const normalizedDescription = payload.description.trim()
  const tags = payload.tags
  if (!normalizedTitle || !normalizedDescription) {
    shell.setAIStatus('请填写课程标题与课程描述。', 'error')
    return
  }

  await runWithBusy('AI 正在生成课程，请稍候...', async () => {
    const generated = await courseOrchestrator.generateCourse({
      title: normalizedTitle,
      description: normalizedDescription,
      tags,
      level: 'beginner',
    })
    const prepared = prepareGeneratedLesson(generated, normalizedTitle)
    const now = new Date().toISOString()
    const { lesson: saved, compacted } = lessonStore.upsert(
      {
        id: prepared.dsl.meta.id,
        title: prepared.dsl.meta.title,
        tags: prepared.dsl.meta.tags ?? tags,
        doc: prepared.docMarkdown,
        dsl: prepared.dsl,
        createdAt: now,
        updatedAt: now,
      },
      {
        action: 'create',
        note: buildRevisionNote('create', normalizedDescription),
        orchestration: generated.metadata,
      },
    )
    refreshLessons(prepared.dsl.meta.id)
    const compactedNote = compacted ? '（存储空间不足，部分旧历史已自动清理）' : ''
    shell.setAIStatus(`课程「${prepared.dsl.meta.title}」已生成并保存（r${saved.revision}）。${compactedNote}`, 'success')
  })
}

async function handleUpdateAILesson(
  targetId: string | null,
  payload: AIPanelUpdatePayload,
): Promise<void> {
  if (!targetId) return
  const lesson = loadedLessons.find(item => item.id === targetId)
  if (!lesson) return

  const normalizedFeedback = payload.feedback.trim()
  if (!normalizedFeedback) {
    shell.setAIStatus('请填写反馈后再更新课程。', 'error')
    return
  }

  await runWithBusy('AI 正在更新课程，请稍候...', async () => {
    const storedCurrent = lesson.source === 'ai' ? lessonStore.findById(lesson.id) : null
    const baseCapabilitySnapshotId = storedCurrent?.metadata.lastOrchestration?.capabilitySnapshotId ?? null

    const generated = await courseOrchestrator.updateCourse({
      feedback: normalizedFeedback,
      existingDSL: lesson.dsl,
      existingDoc: lesson.doc,
    }, {
      baseCapabilitySnapshotId,
      forceOnCapabilityMismatch: payload.forceOnCapabilityMismatch,
    })

    const isBuiltin = lesson.source === 'builtin'
    const defaultTitle = isBuiltin ? `${lesson.title}(AI更新)` : lesson.title
    const preferredId = isBuiltin ? `${lesson.id}-ai` : lesson.id
    const prepared = prepareGeneratedLesson(
      generated,
      defaultTitle,
      preferredId,
      isBuiltin ? undefined : lesson.id,
    )

    const existing = lessonStore.findById(prepared.dsl.meta.id)
    const now = new Date().toISOString()
    const { lesson: saved, compacted } = lessonStore.upsert(
      {
        id: prepared.dsl.meta.id,
        title: prepared.dsl.meta.title,
        tags: prepared.dsl.meta.tags ?? lesson.tags,
        doc: prepared.docMarkdown,
        dsl: prepared.dsl,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      },
      {
        action: existing ? 'update' : 'create',
        note: buildRevisionNote(existing ? 'update' : 'create', normalizedFeedback),
        orchestration: generated.metadata,
      },
    )

    refreshLessons(prepared.dsl.meta.id)
    const compactedNote = compacted ? '（存储空间不足，部分旧历史已自动清理）' : ''
    shell.setAIStatus(`课程「${prepared.dsl.meta.title}」已根据反馈更新（r${saved.revision}）。${compactedNote}`, 'success')
  })
}
async function handleDeleteAILesson(targetId: string | null): Promise<void> {
  if (!targetId) return
  const lesson = loadedLessons.find(item => item.id === targetId)
  if (!lesson) return
  if (lesson.source !== 'ai') {
    shell.setAIStatus('Built-in lessons cannot be deleted. Use AI update to create a derived version.', 'error')
    return
  }

  lessonStore.remove(lesson.id)
  refreshLessons()
  shell.setAIStatus(`Deleted AI lesson "${lesson.title}".`, 'success')
}

function handleConfigureAI(settings: AIPanelSettingsPayload): void {
  courseOrchestrator.saveSettings({
    endpoint: settings.endpoint.trim(),
    apiKey: settings.apiKey.trim(),
    model: settings.model.trim(),
    orchestratorMode: settings.orchestratorMode,
    orchestratorEndpoint: settings.orchestratorEndpoint.trim(),
  })
  shell.setAISettings(courseOrchestrator.loadSettings())
  const modeText = settings.orchestratorMode === 'pipeline' ? 'pipeline' : 'direct'
  shell.setAIStatus(
    `AI settings saved (mode: ${modeText}). Direct mode can use local fallback; pipeline mode requires orchestrator endpoint.`,
    'success',
  )
}

async function runWithBusy(message: string, task: () => Promise<void>): Promise<void> {
  const previousCursor = document.body.style.cursor
  document.body.style.cursor = 'progress'
  try {
    await task()
    console.info(message)
  } catch (error) {
    const text = error instanceof CapabilityDriftError
      ? `Capability drift check blocked update: ${error.message}`
      : (error instanceof Error ? error.message : 'Unknown error')
    shell.setAIStatus(`Operation failed: ${text}`, 'error')
  } finally {
    document.body.style.cursor = previousCursor
  }
}

function prepareGeneratedLesson(
  payload: GeneratedLessonPayload,
  fallbackTitle: string,
  preferredId?: string,
  reusableId?: string,
): GeneratedLessonPayload {
  const rawDSL = payload.dsl ?? ({ meta: { id: '', title: '' } } as LessonDSL)
  const nextDSL: LessonDSL = JSON.parse(JSON.stringify(rawDSL))

  if (!nextDSL.meta) nextDSL.meta = { id: '', title: fallbackTitle }
  if (!nextDSL.meta.title || !nextDSL.meta.title.trim()) nextDSL.meta.title = fallbackTitle

  const baseId = preferredId ?? nextDSL.meta.id ?? fallbackTitle
  const uniqueId = ensureUniqueLessonId(baseId, reusableId)
  nextDSL.meta.id = uniqueId
  if (!Array.isArray(nextDSL.meta.tags)) nextDSL.meta.tags = []
  if (!nextDSL.meta.tags.includes('ai-generated')) nextDSL.meta.tags.push('ai-generated')
  if (!nextDSL.views || nextDSL.views.length === 0) {
    nextDSL.views = [
      { id: 'main3d', type: '3d', overlays: ['axes'] },
      { id: 'graph', type: 'graph' },
      { id: 'inspector', type: 'inspector' },
      { id: 'plot', type: 'plot' },
    ]
  }
  if (!nextDSL.timeline) {
    nextDSL.timeline = { duration: 12, markers: [], tracks: [] }
  }

  const parsed = parser.parse(JSON.stringify(nextDSL), 'json')
  if (!parsed.lesson) {
    const msg = parsed.issues.map(item => `${item.location}: ${item.message}`).join('\n')
    throw new Error(`AI returned invalid DSL structure:\n${msg}`)
  }

  const compiled = compiler.compile(parsed.lesson)
  const blocking = compiled.diagnostics.filter(diag => diag.type === 'error')
  if (blocking.length > 0) {
    const msg = blocking.map(diag => `${diag.location}: ${diag.message}`).join('\n')
    throw new Error(`AI returned DSL semantic errors:\n${msg}`)
  }

  return {
    dsl: parsed.lesson,
    docMarkdown: payload.docMarkdown?.trim() || `# ${parsed.lesson.meta.title}\n\nAI generated content.`,
  }
}

function ensureUniqueLessonId(rawId: string, reusableId?: string): string {
  const base = normalizeLessonId(rawId)
  let candidate = base
  let suffix = 1
  while (
    loadedLessons.some(item => item.id === candidate && item.id !== reusableId)
    || (lessonStore.findById(candidate) && candidate !== reusableId)
  ) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function normalizeLessonId(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (normalized.length > 0) return normalized.slice(0, 48)
  return `lesson-${Date.now()}`
}

function buildRevisionNote(action: 'create' | 'update', text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim()
  const preview = normalized.slice(0, 80)
  if (preview.length === 0) {
    return action === 'create' ? 'Created by AI' : 'Updated by AI'
  }
  return action === 'create' ? `Create: ${preview}` : `Update: ${preview}`
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
    if (!isSafeBindingExpression(expr)) {
      console.warn(`[ui] blocked unsafe binding expression: ${expr}`)
      return () => undefined
    }
    let fn = cache.get(expr)
    if (!fn) {
      try {
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
          `"use strict"; return (${expr});`
        ) as (...args: unknown[]) => unknown
      } catch (error) {
        console.warn(`[ui] failed to compile binding expression: ${expr}`, error)
        return () => undefined
      }
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

const BINDING_EXPR_DISALLOWED_PATTERNS: RegExp[] = [
  /=>/,
  /[{}\[\];`]/,
  /\b(?:window|document|globalThis|global|self|top|parent|frames|localStorage|sessionStorage|indexedDB|caches|navigator|location|history|cookieStore|XMLHttpRequest|fetch|WebSocket|Worker|SharedWorker|Function|eval|import|constructor|prototype|__proto__|this|new|alert|prompt|confirm|open|postMessage|setTimeout|setInterval)\b/i,
]

function isSafeBindingExpression(expression: string): boolean {
  const normalized = expression.trim()
  if (normalized.length === 0 || normalized.length > 800) return false
  return BINDING_EXPR_DISALLOWED_PATTERNS.every(pattern => !pattern.test(normalized))
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
