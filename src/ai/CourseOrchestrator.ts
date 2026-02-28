import { LessonAIService } from '@/ai/LessonAIService'
import { CapabilityRegistry, type CapabilitySelection } from '@/ai/CapabilityRegistry'
import type {
  AISettings,
  AILessonRequest,
  AILessonUpdateRequest,
  GeneratedLessonPayload,
  OrchestratedLessonPayload,
  OrchestrationMetadata,
} from '@/ai/types'

export interface CourseOrchestrator {
  loadSettings(): AISettings
  saveSettings(next: AISettings): void
  generateCourse(request: AILessonRequest): Promise<OrchestratedLessonPayload>
  updateCourse(request: AILessonUpdateRequest, options?: UpdateCourseOptions): Promise<OrchestratedLessonPayload>
}

export interface UpdateCourseOptions {
  baseCapabilitySnapshotId?: string | null
  forceOnCapabilityMismatch?: boolean
}

export class CapabilityDriftError extends Error {
  readonly baseCapabilitySnapshotId: string | null
  readonly currentCapabilitySnapshotId: string
  readonly drift: 'mismatch' | 'missing_base'

  constructor(params: {
    baseCapabilitySnapshotId: string | null
    currentCapabilitySnapshotId: string
    drift: 'mismatch' | 'missing_base'
    message: string
  }) {
    super(params.message)
    this.name = 'CapabilityDriftError'
    this.baseCapabilitySnapshotId = params.baseCapabilitySnapshotId
    this.currentCapabilitySnapshotId = params.currentCapabilitySnapshotId
    this.drift = params.drift
  }
}

export class DefaultCourseOrchestrator implements CourseOrchestrator {
  private readonly lessonAI: LessonAIService
  private readonly capabilityRegistry: CapabilityRegistry

  constructor(lessonAI: LessonAIService) {
    this.lessonAI = lessonAI
    this.capabilityRegistry = new CapabilityRegistry()
  }

  loadSettings(): AISettings {
    return this.lessonAI.loadSettings()
  }

  saveSettings(next: AISettings): void {
    this.lessonAI.saveSettings(next)
  }

  async generateCourse(request: AILessonRequest): Promise<OrchestratedLessonPayload> {
    const settings = this.lessonAI.loadSettings()
    const selection = await this.capabilityRegistry.selectForCreate(request)
    const context = buildOrchestrationContext(selection, 'create')
    const runtimeMode = resolveRuntimeMode(settings)
    let payload: GeneratedLessonPayload
    let upstreamRequestId: string | undefined
    if (runtimeMode === 'pipeline') {
      const call = await this.requestPipeline('generate', settings, request, selection, context)
      payload = call.payload
      upstreamRequestId = call.requestId
    } else {
      payload = await this.lessonAI.generateLesson(request, context)
    }
    return {
      ...payload,
      metadata: buildMetadata(settings, 'generate', selection, runtimeMode, upstreamRequestId),
    }
  }

  async updateCourse(
    request: AILessonUpdateRequest,
    options: UpdateCourseOptions = {},
  ): Promise<OrchestratedLessonPayload> {
    const settings = this.lessonAI.loadSettings()
    const selection = await this.capabilityRegistry.selectForUpdate(request)
    const context = buildOrchestrationContext(selection, 'update')
    const drift = resolveCapabilityDrift(options.baseCapabilitySnapshotId, selection.snapshotId)
    if (drift !== 'none' && !options.forceOnCapabilityMismatch) {
      throw buildCapabilityDriftError(options.baseCapabilitySnapshotId ?? null, selection.snapshotId, drift)
    }
    const runtimeMode = resolveRuntimeMode(settings)
    let payload: GeneratedLessonPayload
    let upstreamRequestId: string | undefined
    if (runtimeMode === 'pipeline') {
      const call = await this.requestPipeline('update', settings, request, selection, context)
      payload = call.payload
      upstreamRequestId = call.requestId
    } else {
      payload = await this.lessonAI.updateLesson(request, context)
    }
    return {
      ...payload,
      metadata: buildMetadata(
        settings,
        'update',
        selection,
        runtimeMode,
        upstreamRequestId,
        options.baseCapabilitySnapshotId ?? null,
        drift,
      ),
    }
  }

  private async requestPipeline(
    action: 'generate' | 'update',
    settings: AISettings,
    request: AILessonRequest | AILessonUpdateRequest,
    selection: CapabilitySelection,
    context: string,
  ): Promise<PipelineCallResult> {
    const endpoint = settings.orchestratorEndpoint.trim()
    if (!endpoint) {
      throw new Error('Pipeline mode is enabled but orchestrator endpoint is empty.')
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify(buildPipelineRequest(action, request, selection, context, settings)),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Orchestrator API failed (${response.status}): ${text.slice(0, 400)}`)
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      const contentType = response.headers.get('content-type') ?? 'unknown'
      throw new Error(`Orchestrator API returned non-JSON response (content-type: ${contentType})`)
    }

    const extracted = parsePipelineResponseContract(payload)
    if (!extracted) {
      throw new Error(
        'Orchestrator response contract invalid. Expected { request_id?, lesson_package: { dsl, doc_markdown }, quality_report? }',
      )
    }
    if (extracted.quality?.hardRulePass === false) {
      const details = extracted.quality.violations.length > 0
        ? extracted.quality.violations.join('; ')
        : 'quality gate failed with no violation details'
      throw new Error(`Orchestrator quality gate failed: ${details}`)
    }
    return extracted
  }
}

function buildMetadata(
  settings: AISettings,
  mode: 'generate' | 'update',
  selection: CapabilitySelection,
  runtimeMode: 'direct' | 'pipeline',
  upstreamRequestId?: string,
  baseCapabilitySnapshotId: string | null = null,
  capabilityDrift: 'none' | 'mismatch' | 'missing_base' = 'none',
): OrchestrationMetadata {
  const now = new Date().toISOString()
  return {
    requestId: upstreamRequestId ?? `req_${mode}_${Date.now().toString(36)}`,
    orchestrator: runtimeMode === 'pipeline' ? 'backend-pipeline-orchestrator' : 'browser-capability-orchestrator',
    pipelineVersion: '1.3.0',
    strategy: isConfigured(settings, runtimeMode) ? 'remote' : 'fallback',
    generatedAt: now,
    capabilitySnapshotId: selection.snapshotId,
    capabilityIds: selection.selectedCards.map(item => item.capability_id),
    baseCapabilitySnapshotId,
    capabilityDrift,
  }
}

function isConfigured(settings: AISettings, runtimeMode: 'direct' | 'pipeline'): boolean {
  if (runtimeMode === 'pipeline') {
    return Boolean(settings.orchestratorEndpoint.trim())
  }
  return Boolean(settings.endpoint && settings.apiKey && settings.model)
}

function resolveRuntimeMode(settings: AISettings): 'direct' | 'pipeline' {
  return settings.orchestratorMode === 'pipeline' ? 'pipeline' : 'direct'
}

function buildPipelineRequest(
  action: 'generate' | 'update',
  request: AILessonRequest | AILessonUpdateRequest,
  selection: CapabilitySelection,
  context: string,
  settings: AISettings,
): Record<string, unknown> {
  return {
    action,
    request:
      action === 'generate'
        ? buildPipelineCreateRequest(request as AILessonRequest)
        : buildPipelineUpdateRequest(request as AILessonUpdateRequest),
    orchestration: {
      context,
      capability_snapshot: selection.snapshotId,
      capability_ids: selection.selectedCards.map(item => item.capability_id),
      hard_rules_version: selection.hardRulesVersion,
    },
    options: {
      model: settings.model || undefined,
      source: 'learngraphics-web',
      llm_endpoint: settings.endpoint || undefined,
    },
  }
}

function buildPipelineCreateRequest(request: AILessonRequest): Record<string, unknown> {
  return {
    topic: request.title,
    goal: request.description,
    tags: request.tags ?? [],
    learner_profile: {
      level: request.level ?? 'beginner',
    },
  }
}

function buildPipelineUpdateRequest(request: AILessonUpdateRequest): Record<string, unknown> {
  return {
    feedback: request.feedback,
    existing_dsl: request.existingDSL,
    existing_doc: request.existingDoc,
    topic: request.existingDSL.meta.title,
    tags: request.existingDSL.meta.tags ?? [],
    learner_profile: {
      level: request.existingDSL.meta.level ?? 'beginner',
    },
  }
}

function buildOrchestrationContext(
  selection: CapabilitySelection,
  mode: 'create' | 'update',
): string {
  const capabilities = selection.selectedCards.map(card => ({
    capability_id: card.capability_id,
    name: card.name,
    version: card.version,
    domain: card.domain,
    level: card.level ?? 'unknown',
    constraints: card.constraints ?? [],
    quality_criteria: card.quality_criteria ?? [],
  }))

  return [
    `orchestration_mode: ${mode}`,
    `capability_snapshot: ${selection.snapshotId}`,
    `capability_aliases_version: ${selection.aliasesVersion}`,
    `hard_rules_version: ${selection.hardRulesVersion}`,
    'selected_capabilities:',
    JSON.stringify(capabilities, null, 2),
    'hard_rules_error_checks:',
    JSON.stringify(selection.hardRulesSummary, null, 2),
    'requirements:',
    '- Keep terminology consistent with selected capability names and constraints.',
    '- Ensure generated lesson can pass hard rule checks and semantic validation.',
    '- If ambiguity exists, prioritize pedagogy + domain core capability sequence.',
  ].join('\n')
}

interface PipelineQualityReport {
  hardRulePass: boolean | null
  rubricScore: number | null
  violations: string[]
}

interface PipelineCallResult {
  requestId?: string
  payload: GeneratedLessonPayload
  quality?: PipelineQualityReport
}

function parsePipelineResponseContract(value: unknown): PipelineCallResult | null {
  const root = asRecord(value)
  if (!root) return null

  const lessonPackage = asRecord(root.lesson_package)
  if (!lessonPackage) return null
  const dsl = asRecord(lessonPackage.dsl)
  if (!dsl) return null
  const docMarkdown = typeof lessonPackage.doc_markdown === 'string'
    ? lessonPackage.doc_markdown
    : (typeof lessonPackage.docMarkdown === 'string' ? lessonPackage.docMarkdown : null)
  if (!docMarkdown || docMarkdown.trim().length === 0) return null

  const requestId = typeof root.request_id === 'string' && root.request_id.trim().length > 0
    ? root.request_id
    : undefined
  const quality = parsePipelineQuality(root.quality_report)

  return {
    requestId,
    payload: {
      dsl: dsl as unknown as GeneratedLessonPayload['dsl'],
      docMarkdown,
    },
    quality,
  }
}

function parsePipelineQuality(value: unknown): PipelineQualityReport | undefined {
  const report = asRecord(value)
  if (!report) return undefined
  const hardRulePass = typeof report.hard_rule_pass === 'boolean' ? report.hard_rule_pass : null
  const rubricScore = typeof report.rubric_score === 'number' && Number.isFinite(report.rubric_score)
    ? report.rubric_score
    : null
  const violations = Array.isArray(report.violations)
    ? report.violations.filter((item): item is string => typeof item === 'string')
    : []
  return {
    hardRulePass,
    rubricScore,
    violations,
  }
}

function resolveCapabilityDrift(
  baseCapabilitySnapshotId: string | null | undefined,
  currentCapabilitySnapshotId: string,
): 'none' | 'mismatch' | 'missing_base' {
  const base = (baseCapabilitySnapshotId ?? '').trim()
  if (!base) return 'missing_base'
  if (base !== currentCapabilitySnapshotId) return 'mismatch'
  return 'none'
}

function buildCapabilityDriftError(
  baseCapabilitySnapshotId: string | null,
  currentCapabilitySnapshotId: string,
  drift: 'mismatch' | 'missing_base',
): CapabilityDriftError {
  if (drift === 'missing_base') {
    return new CapabilityDriftError({
      baseCapabilitySnapshotId,
      currentCapabilitySnapshotId,
      drift,
      message: `Capability snapshot is missing for this lesson. Current snapshot is ${currentCapabilitySnapshotId}. Enable force update to continue.`,
    })
  }
  return new CapabilityDriftError({
    baseCapabilitySnapshotId,
    currentCapabilitySnapshotId,
    drift,
    message: `Capability snapshot mismatch: lesson=${baseCapabilitySnapshotId ?? 'unknown'}, current=${currentCapabilitySnapshotId}. Enable force update to continue.`,
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}
