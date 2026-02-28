import type {
  AISettings,
  AILessonRequest,
  AILessonUpdateRequest,
  GeneratedLessonPayload,
} from '@/ai/types'
import type { LessonDSL } from '@/semantic/compiler/dslTypes'

const SETTINGS_KEY = 'lg.ai.settings.v1'
const UPDATE_DSL_CHAR_BUDGET = 12000
const UPDATE_DOC_CHAR_BUDGET = 4000
const UPDATE_SAMPLE_LIMIT = 80

const DEFAULT_SYSTEM_PROMPT = [
  '你是 LearnGraphics 的课程 DSL 生成器。',
  '仅输出 JSON，不输出 markdown 代码块。',
  'JSON 格式必须为 {"dsl": LessonDSL, "docMarkdown": string}。',
  'LessonDSL 必须满足：',
  '- meta.id / meta.title 必填；',
  '- entities 的 type 只能使用 node, edge, point, line, plane, model, arrow, symbol, label, marker, badge, step_sequence, state_overlay, trace_trail, scalar_field, surface_field, vector_field, sample_probe；',
  '- 若有 timeline，必须包含 duration；',
  '- 保证 relation 引用的实体 id 存在。',
  '优先生成可运行的最小课程结构（3d + graph + inspector/plot 视图，带基础 timeline markers）。',
].join('\n')

export class LessonAIService {
  loadSettings(): AISettings {
    if (typeof window === 'undefined') {
      return { endpoint: '', apiKey: '', model: '', orchestratorMode: 'direct', orchestratorEndpoint: '' }
    }
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return { endpoint: '', apiKey: '', model: '', orchestratorMode: 'direct', orchestratorEndpoint: '' }
    try {
      const parsed = JSON.parse(raw) as Partial<AISettings>
      return {
        endpoint: parsed.endpoint ?? '',
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? '',
        orchestratorMode: parsed.orchestratorMode === 'pipeline' ? 'pipeline' : 'direct',
        orchestratorEndpoint: parsed.orchestratorEndpoint ?? '',
      }
    } catch {
      return { endpoint: '', apiKey: '', model: '', orchestratorMode: 'direct', orchestratorEndpoint: '' }
    }
  }

  saveSettings(next: AISettings): void {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  }

  async generateLesson(
    request: AILessonRequest,
    orchestrationContext?: string,
  ): Promise<GeneratedLessonPayload> {
    const settings = this.loadSettings()
    if (!isConfigured(settings)) {
      return { dsl: buildFallbackDSL(request), docMarkdown: buildFallbackDoc(request) }
    }

    const userPrompt = [
      `课程标题: ${request.title}`,
      `课程描述: ${request.description}`,
      `课程标签: ${(request.tags ?? []).join(', ') || '未指定'}`,
      `课程难度: ${request.level ?? 'beginner'}`,
      orchestrationContext ? `编排上下文:\n${orchestrationContext}` : '',
      '请生成完整课程 DSL 与讲义 markdown。',
    ].join('\n')

    return this.requestRemote(settings, userPrompt)
  }

  async updateLesson(
    request: AILessonUpdateRequest,
    orchestrationContext?: string,
  ): Promise<GeneratedLessonPayload> {
    const settings = this.loadSettings()
    if (!isConfigured(settings)) {
      return {
        dsl: mutateFallbackDSL(request.existingDSL, request.feedback),
        docMarkdown: `${request.existingDoc}\n\n## AI 更新\n- ${request.feedback}`,
      }
    }

    const compacted = buildUpdateCompactedContext(request.existingDSL, request.existingDoc)
    const userPrompt = [
      '你将收到一份已有课程，请根据用户反馈进行改写。',
      `用户反馈: ${request.feedback}`,
      orchestrationContext ? `编排上下文:\n${orchestrationContext}` : '',
      `现有课程摘要: ${JSON.stringify(compacted.summary, null, 2)}`,
      `现有 DSL 上下文(JSON): ${compacted.dslContext}`,
      `现有文档上下文(markdown): ${compacted.docContext}`,
      compacted.isCompacted
        ? '注意：为节省上下文长度，原课程已做压缩摘要，请保持课程结构语义连续。'
        : '注意：已提供完整课程上下文。',
      '返回完整新版本，不要返回 patch。',
    ].join('\n')

    return this.requestRemote(settings, userPrompt)
  }

  private async requestRemote(settings: AISettings, userPrompt: string): Promise<GeneratedLessonPayload> {
    const response = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`AI API failed (${response.status}): ${text.slice(0, 400)}`)
    }

    let data: Record<string, unknown>
    try {
      data = (await response.json()) as Record<string, unknown>
    } catch {
      const contentType = response.headers.get('content-type') ?? 'unknown'
      throw new Error(`AI API returned non-JSON response (content-type: ${contentType})`)
    }
    const content = extractContentText(data)
    const parsed = parseGeneratedPayload(content)
    if (!parsed) throw new Error('AI response JSON is missing required fields: dsl/docMarkdown')
    return parsed
  }
}

function extractContentText(data: Record<string, unknown>): string {
  const choices = data.choices
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>
    const message = first.message as Record<string, unknown> | undefined
    const content = message?.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const text = content
        .map(item => {
          if (typeof item === 'string') return item
          if (typeof item === 'object' && item && typeof (item as Record<string, unknown>).text === 'string') {
            return String((item as Record<string, unknown>).text)
          }
          return ''
        })
        .join('')
      if (text.trim()) return text
    }
  }

  if (typeof data.output_text === 'string') return data.output_text
  throw new Error('Unable to read AI response content.')
}

function parseGeneratedPayload(content: string): GeneratedLessonPayload | null {
  const parsed = tryParseJSON(content) ?? tryParseJSON(extractJSONObject(content))
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (typeof obj.docMarkdown !== 'string') return null
  if (typeof obj.dsl !== 'object' || obj.dsl === null) return null
  return {
    dsl: obj.dsl as LessonDSL,
    docMarkdown: obj.docMarkdown,
  }
}

function tryParseJSON(value: string): unknown | null {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractJSONObject(text: string): string {
  const start = text.indexOf('{')
  if (start < 0) return text
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return text.slice(start)
}

function isConfigured(settings: AISettings): boolean {
  return Boolean(settings.endpoint && settings.apiKey && settings.model)
}

function buildFallbackDSL(request: AILessonRequest): LessonDSL {
  const id = sanitizeLessonId(request.title)
  return {
    meta: {
      id,
      title: request.title,
      tags: request.tags ?? ['ai-generated'],
      level: request.level ?? 'beginner',
    },
    entities: [
      { id: 'origin', type: 'point', position: [0, 0, 0], label: 'O' },
      { id: 'v', type: 'arrow', position: [0, 0, 0], direction: [1, 0.5, 0], label: 'v' },
      { id: 'axis', type: 'arrow', position: [0, 0, 0], direction: [1, 0, 0], label: 'axis' },
      { id: 'desc', type: 'label', position: [0, 1.2, 0], label: request.description },
    ],
    relations: [
      { id: 'angle', type: 'measureAngle', source: 'v', target: 'axis' },
      { id: 'proj', type: 'projection', source: 'v', target: 'axis' },
    ],
    views: [
      { id: 'main3d', type: '3d', overlays: ['axes'] },
      { id: 'graph', type: 'graph' },
      { id: 'inspector', type: 'inspector' },
      { id: 'plot', type: 'plot' },
    ],
    timeline: {
      duration: 12,
      markers: [
        { time: 0, label: '问题引入', description: '说明课程目标' },
        { time: 5, label: '核心概念', description: '讲解向量与角度关系' },
        { time: 10, label: '练习', description: '尝试修改方向观察变化' },
      ],
      tracks: [],
    },
  }
}

function mutateFallbackDSL(existing: LessonDSL, feedback: string): LessonDSL {
  const next = JSON.parse(JSON.stringify(existing)) as LessonDSL
  const markerLabel = feedback.slice(0, 20)
  if (!next.timeline) {
    next.timeline = { duration: 12, markers: [], tracks: [] }
  }
  if (!Array.isArray(next.timeline.markers)) next.timeline.markers = []
  next.timeline.markers.push({
    time: Math.max(0, Number(next.timeline.duration ?? 0) - 1),
    label: `AI更新:${markerLabel}`,
    description: feedback,
  })
  if (!next.meta.tags) next.meta.tags = []
  if (!next.meta.tags.includes('ai-updated')) next.meta.tags.push('ai-updated')
  return next
}

function buildFallbackDoc(request: AILessonRequest): string {
  return [
    `# ${request.title}`,
    '',
    '## 学习目标',
    `- ${request.description}`,
    '',
    '## 课程结构',
    '- 问题引入：明确场景与目标',
    '- 核心概念：观察向量方向与角度关系',
    '- 练习反馈：修改参数并记录现象',
    '',
    '## 练习建议',
    '- 调整向量方向，观察角度变化与投影变化。',
  ].join('\n')
}

function sanitizeLessonId(raw: string): string {
  const base = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const normalized = base || `lesson-${Date.now()}`
  return normalized.length <= 48 ? normalized : normalized.slice(0, 48)
}

interface CompactedUpdateContext {
  summary: {
    title: string
    tags: string[]
    level: string
    entityCount: number
    relationCount: number
    viewCount: number
    markerCount: number
    trackCount: number
    docChars: number
  }
  dslContext: string
  docContext: string
  isCompacted: boolean
}

function buildUpdateCompactedContext(existingDSL: LessonDSL, existingDoc: string): CompactedUpdateContext {
  const entities = Array.isArray(existingDSL.entities) ? existingDSL.entities : []
  const relations = Array.isArray(existingDSL.relations) ? existingDSL.relations : []
  const views = Array.isArray(existingDSL.views) ? existingDSL.views : []
  const markers = Array.isArray(existingDSL.timeline?.markers) ? existingDSL.timeline?.markers ?? [] : []
  const tracks = Array.isArray(existingDSL.timeline?.tracks) ? existingDSL.timeline?.tracks ?? [] : []

  const summary = {
    title: existingDSL.meta?.title ?? '',
    tags: existingDSL.meta?.tags ?? [],
    level: existingDSL.meta?.level ?? 'unknown',
    entityCount: entities.length,
    relationCount: relations.length,
    viewCount: views.length,
    markerCount: markers.length,
    trackCount: tracks.length,
    docChars: existingDoc.length,
  }

  const rawDSLContext = JSON.stringify(existingDSL)
  const rawDocContext = existingDoc
  if (rawDSLContext.length <= UPDATE_DSL_CHAR_BUDGET && rawDocContext.length <= UPDATE_DOC_CHAR_BUDGET) {
    return {
      summary,
      dslContext: rawDSLContext,
      docContext: rawDocContext,
      isCompacted: false,
    }
  }

  const compactDSL = {
    meta: existingDSL.meta,
    views: views.map(view => ({ id: view.id, type: view.type, overlays: view.overlays ?? [] })),
    ui: {
      sliderCount: Array.isArray(existingDSL.ui?.sliders) ? existingDSL.ui?.sliders.length : 0,
      bindingCount: Array.isArray(existingDSL.ui?.bindings) ? existingDSL.ui?.bindings.length : 0,
    },
    entities_sample: entities.slice(0, UPDATE_SAMPLE_LIMIT).map(entity => ({
      id: entity.id,
      type: entity.type,
      label: entity.label,
    })),
    relations_sample: relations.slice(0, UPDATE_SAMPLE_LIMIT).map(relation => ({
      id: relation.id,
      type: relation.type,
      source: relation.source,
      target: relation.target,
    })),
    timeline: {
      duration: existingDSL.timeline?.duration ?? null,
      markers_sample: markers.slice(0, UPDATE_SAMPLE_LIMIT).map(item => ({
        time: item.time,
        label: item.label,
      })),
      track_count: tracks.length,
    },
  }

  return {
    summary,
    dslContext: JSON.stringify(compactDSL),
    docContext: rawDocContext.length <= UPDATE_DOC_CHAR_BUDGET
      ? rawDocContext
      : `${rawDocContext.slice(0, UPDATE_DOC_CHAR_BUDGET)}\n\n...(truncated for context budget)`,
    isCompacted: true,
  }
}
