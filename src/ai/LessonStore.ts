import type {
  LessonRevisionAction,
  OrchestrationMetadata,
  StoredAILesson,
  StoredAILessonInput,
  StoredAILessonMetadata,
  StoredAILessonRevision,
} from '@/ai/types'

const STORAGE_KEY = 'lg.ai.lessons.v1'
const METADATA_SCHEMA_VERSION = 3
const DEFAULT_MAX_HISTORY_PER_LESSON = 80

interface UpsertLessonOptions {
  action?: LessonRevisionAction
  note?: string
  orchestration?: OrchestrationMetadata | null
}

export interface UpsertLessonResult {
  lesson: StoredAILesson
  /** 本次写入触发了存储配额压缩（部分历史已被自动清理） */
  compacted: boolean
}

interface LessonStoreOptions {
  maxHistoryPerLesson?: number
}

export class LessonStore {
  private readonly maxHistoryPerLesson: number

  constructor(options: LessonStoreOptions = {}) {
    this.maxHistoryPerLesson = normalizeHistoryLimit(options.maxHistoryPerLesson)
  }

  loadAll(): StoredAILesson[] {
    const raw = this.getStorageValue()
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw) as unknown
      if (!Array.isArray(parsed)) return []
      return parsed
        .map(item => this.normalizeItem(item))
        .filter((item): item is StoredAILesson => item !== null)
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    } catch {
      return []
    }
  }

  upsert(entry: StoredAILessonInput, options: UpsertLessonOptions = {}): UpsertLessonResult {
    const all = this.loadAll()
    const existing = all.find(item => item.id === entry.id) ?? null
    const action = options.action ?? (existing ? 'update' : 'create')
    const note = normalizeNote(options.note) || defaultNote(action)
    const createdAt = existing?.createdAt ?? entry.createdAt
    const nextRevision = existing ? existing.revision + 1 : 1
    const nextUpdatedAt = entry.updatedAt

    const committed: StoredAILesson = {
      id: entry.id,
      title: entry.title,
      tags: [...entry.tags],
      doc: entry.doc,
      dsl: cloneDSL(entry.dsl),
      createdAt,
      updatedAt: nextUpdatedAt,
      revision: nextRevision,
      history: [],
      metadata: {
        schemaVersion: METADATA_SCHEMA_VERSION,
        lastAction: action,
        lastNote: note,
        headRevision: nextRevision,
        headUpdatedAt: nextUpdatedAt,
        historyTruncated: existing?.metadata.historyTruncated ?? false,
        lastOrchestration: cloneOrchestration(options.orchestration ?? null),
      },
    }

    const history = existing ? [...existing.history] : []
    history.push(this.buildRevisionSnapshot(committed, action, note, nextUpdatedAt, options.orchestration ?? null))
    const bounded = capHistory(history, this.maxHistoryPerLesson)
    committed.history = bounded.history
    committed.metadata.historyTruncated = committed.metadata.historyTruncated || bounded.truncated

    const nextAll = all.filter(item => item.id !== entry.id)
    nextAll.push(committed)
    const compacted = this.persistLessons(nextAll)
    return { lesson: committed, compacted }
  }

  remove(id: string): void {
    const all = this.loadAll().filter(item => item.id !== id)
    this.persistLessons(all)
  }

  findById(id: string): StoredAILesson | null {
    return this.loadAll().find(item => item.id === id) ?? null
  }

  getHistory(id: string): StoredAILessonRevision[] {
    const lesson = this.findById(id)
    if (!lesson) return []
    return lesson.history
      .slice()
      .sort((a, b) => b.revision - a.revision)
      .map(item => this.cloneRevision(item))
  }

  rollbackToRevision(id: string, targetRevision: number, note?: string): StoredAILesson | null {
    const lesson = this.findById(id)
    if (!lesson) return null
    const snapshot = lesson.history.find(item => item.revision === targetRevision)
    if (!snapshot) return null

    return this.upsert(
      {
        id: lesson.id,
        title: snapshot.title,
        tags: [...snapshot.tags],
        doc: snapshot.doc,
        dsl: cloneDSL(snapshot.dsl),
        createdAt: lesson.createdAt,
        updatedAt: new Date().toISOString(),
      },
      {
        action: 'rollback',
        note: normalizeNote(note) || `Rollback to r${targetRevision}`,
        orchestration: snapshot.orchestration ?? lesson.metadata.lastOrchestration,
      },
    ).lesson
  }

  private normalizeItem(value: unknown): StoredAILesson | null {
    if (typeof value !== 'object' || value === null) return null
    const obj = value as Record<string, unknown>
    if (!isString(obj.id) || !isString(obj.title) || !isString(obj.doc)) return null
    if (!isString(obj.createdAt) || !isString(obj.updatedAt)) return null
    if (!Array.isArray(obj.tags) || !obj.tags.every(isString)) return null
    if (typeof obj.dsl !== 'object' || obj.dsl === null) return null

    const baseLesson: StoredAILesson = {
      id: obj.id,
      title: obj.title,
      tags: obj.tags,
      doc: obj.doc,
      dsl: cloneDSL(obj.dsl as StoredAILesson['dsl']),
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
      revision: 1,
      history: [],
      metadata: {
        schemaVersion: METADATA_SCHEMA_VERSION,
        lastAction: 'migrate',
        lastNote: 'Migrated legacy lesson',
        headRevision: 1,
        headUpdatedAt: obj.updatedAt,
        historyTruncated: false,
        lastOrchestration: null,
      },
    }

    const parsedHistory = normalizeHistory(obj.history)
    const parsedRevision = toPositiveInt(obj.revision)
    const latestHistoryRevision = parsedHistory.reduce((max, item) => Math.max(max, item.revision), 0)
    const resolvedRevision = Math.max(parsedRevision ?? 1, latestHistoryRevision || 1)
    const metadata = normalizeMetadata(obj.metadata, parsedHistory, resolvedRevision, obj.updatedAt)

    const next: StoredAILesson = {
      ...baseLesson,
      revision: resolvedRevision,
      history: parsedHistory,
      metadata,
    }

    if (next.history.length === 0) {
      next.history = [this.buildRevisionSnapshot(next, 'migrate', 'Migrated legacy lesson', next.updatedAt, null)]
    } else if (!next.history.some(item => item.revision === next.revision)) {
      next.history.push(
        this.buildRevisionSnapshot(
          next,
          metadata.lastAction,
          metadata.lastNote || 'Recovered missing snapshot',
          next.updatedAt,
          metadata.lastOrchestration,
        ),
      )
    }

    next.history = next.history
      .slice()
      .sort((a, b) => a.revision - b.revision)
      .map(item => this.cloneRevision(item))

    const bounded = capHistory(next.history, this.maxHistoryPerLesson)
    next.history = bounded.history
    next.metadata = {
      ...next.metadata,
      headRevision: next.revision,
      headUpdatedAt: next.updatedAt,
      historyTruncated: next.metadata.historyTruncated
        || bounded.truncated
        || (next.history.length > 0 && next.history[0].revision > 1),
      lastOrchestration:
        next.metadata.lastOrchestration
        ?? cloneOrchestration(next.history[next.history.length - 1]?.orchestration ?? null),
    }

    return next
  }

  private buildRevisionSnapshot(
    lesson: StoredAILesson,
    action: LessonRevisionAction,
    note: string,
    createdAt: string,
    orchestration: OrchestrationMetadata | null,
  ): StoredAILessonRevision {
    return {
      revision: lesson.revision,
      action,
      note,
      createdAt,
      title: lesson.title,
      tags: [...lesson.tags],
      doc: lesson.doc,
      dsl: cloneDSL(lesson.dsl),
      orchestration: cloneOrchestration(orchestration) ?? undefined,
    }
  }

  private cloneRevision(value: StoredAILessonRevision): StoredAILessonRevision {
    return cloneRevisionEntry(value)
  }

  private getStorageValue(): string | null {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(STORAGE_KEY)
  }

  private setStorageValue(value: string): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, value)
  }

  /** 将课程列表写入 localStorage，返回是否发生了配额压缩。 */
  private persistLessons(lessons: StoredAILesson[]): boolean {
    if (typeof window === 'undefined') return false
    let nextLessons = lessons
    let attempts = 0
    let didCompact = false

    while (attempts < 256) {
      attempts += 1
      const serialized = JSON.stringify(nextLessons)
      try {
        this.setStorageValue(serialized)
        return didCompact
      } catch (error) {
        if (!isQuotaExceededError(error)) throw error
        const compacted = compactForQuota(nextLessons)
        if (!compacted) {
          throw new Error('AI lesson storage is full. Please delete some AI lessons and retry.')
        }
        nextLessons = compacted
        didCompact = true
      }
    }

    throw new Error('AI lesson storage compaction exceeded retry limit.')
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const next = Math.floor(value)
  return next > 0 ? next : null
}

function normalizeNote(value: string | undefined): string {
  return (value ?? '').trim()
}

function defaultNote(action: LessonRevisionAction): string {
  if (action === 'create') return 'Initial lesson created'
  if (action === 'update') return 'Lesson updated'
  if (action === 'rollback') return 'Lesson rolled back'
  return 'Lesson migrated'
}

function cloneDSL(dsl: StoredAILesson['dsl']): StoredAILesson['dsl'] {
  return JSON.parse(JSON.stringify(dsl)) as StoredAILesson['dsl']
}

function isRevisionAction(value: unknown): value is LessonRevisionAction {
  return value === 'create' || value === 'update' || value === 'rollback' || value === 'migrate'
}

function normalizeHistory(value: unknown): StoredAILessonRevision[] {
  if (!Array.isArray(value)) return []
  const items: StoredAILessonRevision[] = []

  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue
    const obj = row as Record<string, unknown>
    if (!isString(obj.title) || !isString(obj.doc) || !isString(obj.note) || !isString(obj.createdAt)) continue
    if (!Array.isArray(obj.tags) || !obj.tags.every(isString)) continue
    if (typeof obj.dsl !== 'object' || obj.dsl === null) continue
    const revision = toPositiveInt(obj.revision)
    if (!revision) continue
    const action = isRevisionAction(obj.action) ? obj.action : 'update'

    items.push({
      revision,
      action,
      note: obj.note,
      createdAt: obj.createdAt,
      title: obj.title,
      tags: [...obj.tags],
      doc: obj.doc,
      dsl: cloneDSL(obj.dsl as StoredAILesson['dsl']),
      orchestration: normalizeOrchestration(obj.orchestration) ?? undefined,
    })
  }

  return items
}

function normalizeMetadata(
  value: unknown,
  history: StoredAILessonRevision[],
  resolvedRevision: number,
  updatedAt: string,
): StoredAILessonMetadata {
  const latest = history
    .slice()
    .sort((a, b) => b.revision - a.revision)[0]
  const inferredLastAction = latest?.action ?? 'migrate'
  const inferredLastNote = latest?.note ?? 'Migrated legacy lesson'
  const inferredOrchestration = cloneOrchestration(latest?.orchestration ?? null)
  const historyTruncatedFromHistory = history.length > 0 && history
    .slice()
    .sort((a, b) => a.revision - b.revision)[0].revision > 1

  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    if (
      typeof obj.schemaVersion === 'number'
      && Number.isFinite(obj.schemaVersion)
      && isRevisionAction(obj.lastAction)
      && isString(obj.lastNote)
    ) {
      return {
        schemaVersion: Math.max(1, Math.floor(obj.schemaVersion)),
        lastAction: obj.lastAction,
        lastNote: obj.lastNote,
        headRevision: toPositiveInt(obj.headRevision) ?? resolvedRevision,
        headUpdatedAt: isString(obj.headUpdatedAt) ? obj.headUpdatedAt : updatedAt,
        historyTruncated: typeof obj.historyTruncated === 'boolean'
          ? obj.historyTruncated || historyTruncatedFromHistory
          : historyTruncatedFromHistory,
        lastOrchestration:
          normalizeOrchestration(obj.lastOrchestration)
          ?? inferredOrchestration,
      }
    }
  }

  return {
    schemaVersion: METADATA_SCHEMA_VERSION,
    lastAction: inferredLastAction,
    lastNote: inferredLastNote,
    headRevision: resolvedRevision,
    headUpdatedAt: updatedAt,
    historyTruncated: historyTruncatedFromHistory,
    lastOrchestration: inferredOrchestration,
  }
}

function normalizeOrchestration(value: unknown): OrchestrationMetadata | null {
  if (typeof value !== 'object' || value === null) return null
  const obj = value as Record<string, unknown>
  if (
    !isString(obj.requestId)
    || !isString(obj.orchestrator)
    || !isString(obj.pipelineVersion)
    || !isString(obj.generatedAt)
    || !isOrchestrationStrategy(obj.strategy)
  ) {
    return null
  }
  return {
    requestId: obj.requestId,
    orchestrator: obj.orchestrator,
    pipelineVersion: obj.pipelineVersion,
    strategy: obj.strategy,
    generatedAt: obj.generatedAt,
    capabilitySnapshotId:
      typeof obj.capabilitySnapshotId === 'string' ? obj.capabilitySnapshotId : undefined,
    capabilityIds:
      Array.isArray(obj.capabilityIds) ? obj.capabilityIds.filter(isString) : undefined,
    baseCapabilitySnapshotId:
      typeof obj.baseCapabilitySnapshotId === 'string' || obj.baseCapabilitySnapshotId === null
        ? obj.baseCapabilitySnapshotId
        : undefined,
    capabilityDrift: isCapabilityDrift(obj.capabilityDrift) ? obj.capabilityDrift : undefined,
  }
}

function cloneOrchestration(value: OrchestrationMetadata | null): OrchestrationMetadata | null {
  if (!value) return null
  return {
    requestId: value.requestId,
    orchestrator: value.orchestrator,
    pipelineVersion: value.pipelineVersion,
    strategy: value.strategy,
    generatedAt: value.generatedAt,
    capabilitySnapshotId: value.capabilitySnapshotId,
    capabilityIds: value.capabilityIds ? [...value.capabilityIds] : undefined,
    baseCapabilitySnapshotId: value.baseCapabilitySnapshotId,
    capabilityDrift: value.capabilityDrift,
  }
}

function isOrchestrationStrategy(value: unknown): value is OrchestrationMetadata['strategy'] {
  return value === 'remote' || value === 'fallback'
}

function isCapabilityDrift(value: unknown): value is NonNullable<OrchestrationMetadata['capabilityDrift']> {
  return value === 'none' || value === 'mismatch' || value === 'missing_base'
}

function cloneRevisionEntry(value: StoredAILessonRevision): StoredAILessonRevision {
  return {
    revision: value.revision,
    action: value.action,
    note: value.note,
    createdAt: value.createdAt,
    title: value.title,
    tags: [...value.tags],
    doc: value.doc,
    dsl: cloneDSL(value.dsl),
    orchestration: cloneOrchestration(value.orchestration ?? null) ?? undefined,
  }
}

function capHistory(
  history: StoredAILessonRevision[],
  limit: number,
): { history: StoredAILessonRevision[]; truncated: boolean } {
  const sorted = history
    .slice()
    .sort((a, b) => a.revision - b.revision)
    .map(item => cloneRevisionEntry(item))
  if (sorted.length <= limit) {
    return { history: sorted, truncated: false }
  }
  const keep = sorted.slice(sorted.length - limit)
  return { history: keep, truncated: true }
}

function normalizeHistoryLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_MAX_HISTORY_PER_LESSON
  const next = Math.floor(value)
  if (next < 5) return 5
  return next
}

function compactForQuota(lessons: StoredAILesson[]): StoredAILesson[] | null {
  const next = lessons.map(item => ({
    ...item,
    tags: [...item.tags],
    dsl: cloneDSL(item.dsl),
    history: item.history.map(historyItem => cloneRevisionEntry(historyItem)),
    metadata: {
      ...item.metadata,
      lastOrchestration: cloneOrchestration(item.metadata.lastOrchestration),
    },
  }))

  const candidateByHistory = next
    .filter(item => item.history.length > 1)
    .sort((a, b) => {
      const aTime = Date.parse(a.history[0]?.createdAt ?? a.updatedAt) || 0
      const bTime = Date.parse(b.history[0]?.createdAt ?? b.updatedAt) || 0
      return aTime - bTime
    })[0]

  if (candidateByHistory) {
    candidateByHistory.history = candidateByHistory.history.slice(1)
    candidateByHistory.metadata = {
      ...candidateByHistory.metadata,
      historyTruncated: true,
    }
    return next
  }

  return null
}

function isQuotaExceededError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  }
  if (error && typeof error === 'object' && 'name' in error) {
    return (error as { name?: string }).name === 'QuotaExceededError'
  }
  return false
}
