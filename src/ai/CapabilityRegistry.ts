import type { AILessonRequest, AILessonUpdateRequest } from '@/ai/types'

interface CapabilityCard {
  capability_id: string
  name: string
  version: string
  domain: string
  level?: string
  dependencies?: string[]
  constraints?: string[]
  quality_criteria?: string[]
  status?: 'active' | 'deprecated' | 'removed'
}

interface CapabilityAliasesDoc {
  version?: string
  aliases?: Record<string, string>
}

interface HardRulesDoc {
  version?: string
  rules?: Array<{ id?: string; description?: string; level?: string }>
}

interface RegistryState {
  cards: CapabilityCard[]
  cardsById: Map<string, CapabilityCard>
  aliases: Map<string, string>
  aliasesVersion: string
  hardRulesVersion: string
  hardRulesSummary: string[]
  snapshotId: string
}

export interface CapabilitySelection {
  selectedCards: CapabilityCard[]
  snapshotId: string
  aliasesVersion: string
  hardRulesVersion: string
  hardRulesSummary: string[]
}

const capabilityCardLoaders = import.meta.glob('../../content/ai/capability-cards/**/*.json', {
  import: 'default',
}) as Record<string, () => Promise<unknown>>

const aliasesLoader = (): Promise<{ default: CapabilityAliasesDoc }> => import('../../content/ai/capability-aliases.json')
const hardRulesLoader = (): Promise<{ default: HardRulesDoc }> => import('../../content/ai/rules/hard-rules.json')

export class CapabilityRegistry {
  private statePromise: Promise<RegistryState> | null = null

  async selectForCreate(request: AILessonRequest): Promise<CapabilitySelection> {
    const state = await this.loadState()
    const queryTokens = buildTokens([request.title, request.description, ...(request.tags ?? [])])
    return selectByTokens(state, queryTokens, request.level ?? 'beginner')
  }

  async selectForUpdate(request: AILessonUpdateRequest): Promise<CapabilitySelection> {
    const state = await this.loadState()
    const title = request.existingDSL?.meta?.title ?? ''
    const tags = request.existingDSL?.meta?.tags ?? []
    const queryTokens = buildTokens([title, request.feedback, ...tags])
    const level = request.existingDSL?.meta?.level ?? 'beginner'
    return selectByTokens(state, queryTokens, level)
  }

  async reload(): Promise<void> {
    this.statePromise = null
    await this.loadState()
  }

  private async loadState(): Promise<RegistryState> {
    if (!this.statePromise) {
      this.statePromise = loadRegistryState()
    }
    return this.statePromise
  }
}

async function loadRegistryState(): Promise<RegistryState> {
  const [aliasesModule, hardRulesModule, cards] = await Promise.all([
    aliasesLoader(),
    hardRulesLoader(),
    loadCapabilityCards(),
  ])

  const aliasesDoc = aliasesModule.default
  const hardRulesDoc = hardRulesModule.default

  const aliases = new Map(Object.entries(aliasesDoc.aliases ?? {}))
  const aliasesVersion = aliasesDoc.version ?? 'unknown'
  const hardRulesVersion = hardRulesDoc.version ?? 'unknown'
  const hardRulesSummary = (hardRulesDoc.rules ?? [])
    .filter(rule => rule.level === 'error')
    .slice(0, 6)
    .map(rule => `${rule.id ?? 'UNKNOWN'}: ${rule.description ?? ''}`.trim())

  return {
    cards,
    cardsById: new Map(cards.map(card => [card.capability_id, card])),
    aliases,
    aliasesVersion,
    hardRulesVersion,
    hardRulesSummary,
    snapshotId: buildSnapshotId(cards, aliasesVersion, hardRulesVersion),
  }
}

async function loadCapabilityCards(): Promise<CapabilityCard[]> {
  const raws = await Promise.all(
    Object.values(capabilityCardLoaders).map(loader => loader()),
  )
  return raws
    .map(raw => normalizeCard(raw))
    .filter((card): card is CapabilityCard => card !== null)
    .filter(card => card.status !== 'removed')
}

function selectByTokens(state: RegistryState, tokens: Set<string>, level: string): CapabilitySelection {
  const scored = state.cards
    .map(card => ({ card, score: scoreCard(card, tokens, level) }))
    .sort((a, b) => b.score - a.score || a.card.capability_id.localeCompare(b.card.capability_id))

  const selected: CapabilityCard[] = []
  const selectedIds = new Set<string>()

  for (const item of scored) {
    if (item.card.domain === 'pedagogy') continue
    if (selected.length >= 4) break
    addCard(item.card)
  }

  addPedagogy('story_context')
  addPedagogy('assessment.quick_check')

  const withDeps = [...selected]
  for (const card of withDeps) {
    for (const dep of card.dependencies ?? []) {
      const resolved = resolveCard(dep, state.aliases, state.cardsById)
      if (resolved) addCard(resolved)
    }
  }

  return {
    selectedCards: selected,
    snapshotId: state.snapshotId,
    aliasesVersion: state.aliasesVersion,
    hardRulesVersion: state.hardRulesVersion,
    hardRulesSummary: state.hardRulesSummary,
  }

  function addCard(card: CapabilityCard): void {
    if (selectedIds.has(card.capability_id)) return
    selectedIds.add(card.capability_id)
    selected.push(card)
  }

  function addPedagogy(keyword: string): void {
    const card = scored.find(item => item.card.domain === 'pedagogy' && item.card.capability_id.includes(keyword))?.card
    if (card) addCard(card)
  }
}

function resolveCard(
  id: string,
  aliases: Map<string, string>,
  cardsById: Map<string, CapabilityCard>,
): CapabilityCard | null {
  const resolvedId = resolveAlias(id, aliases)
  return cardsById.get(resolvedId) ?? null
}

function normalizeCard(raw: unknown): CapabilityCard | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  if (
    typeof obj.capability_id !== 'string'
    || typeof obj.name !== 'string'
    || typeof obj.version !== 'string'
    || typeof obj.domain !== 'string'
  ) {
    return null
  }

  return {
    capability_id: obj.capability_id,
    name: obj.name,
    version: obj.version,
    domain: obj.domain,
    level: typeof obj.level === 'string' ? obj.level : undefined,
    dependencies: Array.isArray(obj.dependencies) ? obj.dependencies.filter(isString) : [],
    constraints: Array.isArray(obj.constraints) ? obj.constraints.filter(isString) : [],
    quality_criteria: Array.isArray(obj.quality_criteria) ? obj.quality_criteria.filter(isString) : [],
    status: normalizeStatus(obj.status),
  }
}

function normalizeStatus(value: unknown): CapabilityCard['status'] {
  return value === 'active' || value === 'deprecated' || value === 'removed'
    ? value
    : 'active'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function buildTokens(parts: string[]): Set<string> {
  const tokens = new Set<string>()
  for (const part of parts) {
    const normalized = part.toLowerCase().trim()
    if (!normalized) continue
    const segments = normalized
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
    for (const seg of segments) {
      tokens.add(seg)
    }
  }
  return tokens
}

function scoreCard(card: CapabilityCard, tokens: Set<string>, level: string): number {
  const fields = [
    card.capability_id.toLowerCase(),
    card.name.toLowerCase(),
    card.domain.toLowerCase(),
    ...(card.constraints ?? []).map(item => item.toLowerCase()),
    ...(card.quality_criteria ?? []).map(item => item.toLowerCase()),
  ]
  let score = 0
  for (const token of tokens) {
    if (token.length <= 1) continue
    if (fields.some(field => field.includes(token))) score += 2
    if (card.capability_id.toLowerCase().includes(token)) score += 1
  }
  if ((card.level ?? '').toLowerCase() === level.toLowerCase()) score += 2
  if (card.domain === 'pedagogy') score += 1
  return score
}

function resolveAlias(id: string, aliases: Map<string, string>): string {
  let current = id
  const seen = new Set<string>()
  while (aliases.has(current)) {
    if (seen.has(current)) break
    seen.add(current)
    current = aliases.get(current) ?? current
  }
  return current
}

function buildSnapshotId(cards: CapabilityCard[], aliasesVersion: string, hardRulesVersion: string): string {
  const seed = cards
    .map(card => `${card.capability_id}@${card.version}`)
    .sort()
    .join('|')
    + `|aliases@${aliasesVersion}|hard_rules@${hardRulesVersion}`
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `cap_${(hash >>> 0).toString(36)}`
}
