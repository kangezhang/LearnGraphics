#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = process.cwd()
const DEFAULT_REQUEST_PATH = path.join(ROOT, 'content', 'ai', 'examples', 'course-request.sample.json')
const COURSE_REQUEST_SCHEMA_PATH = path.join(
  ROOT,
  'content',
  'ai',
  'schemas',
  'course-request.schema.json'
)
const COURSE_PLAN_SCHEMA_PATH = path.join(ROOT, 'content', 'ai', 'schemas', 'course-plan.schema.json')
const CARDS_DIR = path.join(ROOT, 'content', 'ai', 'capability-cards')
const CAPABILITY_ALIASES_PATH = path.join(ROOT, 'content', 'ai', 'capability-aliases.json')

const DOMAIN_KEYWORDS = {
  geometry: ['几何', '向量', '投影', '角度', '平面', '交点', 'geometry', 'vector', 'projection', 'angle'],
  algorithm: ['算法', '图', '队列', '遍历', '调度', 'bfs', 'dag', 'algorithm', 'graph'],
  calculus: ['微积分', '梯度', '下降', '优化', '损失', 'gradient', 'descent', 'loss', 'optimize'],
  graphics: ['图形学', '射线', '光线', '命中', 'ray', 'intersection', 'render'],
  pedagogy: ['练习', '测验', '讲解', '引入', 'story', 'quiz', 'assessment'],
}

const CONCEPT_ALIASES = {
  vector: ['向量', 'vector'],
  projection: ['投影', 'projection'],
  angle: ['角度', '夹角', 'angle'],
  plane: ['平面', 'plane'],
  intersection: ['相交', '交点', 'intersection', 'hit'],
  bfs: ['bfs', '广度优先', '队列', 'queue'],
  dag: ['dag', '有向无环', '调度', 'schedule'],
  gradient: ['梯度', 'gradient'],
  descent: ['下降', 'descent'],
  loss: ['损失', 'loss'],
  ray: ['射线', '光线', 'ray'],
  assessment: ['评估', '测验', '练习', 'quiz'],
  story: ['引入', '故事', '案例', 'context'],
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const requestPath = args.request ?? DEFAULT_REQUEST_PATH
  const outPath = args.out

  const request = loadJson(requestPath)
  const requestSchema = loadJson(COURSE_REQUEST_SCHEMA_PATH)
  const planSchema = loadJson(COURSE_PLAN_SCHEMA_PATH)

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validateRequest = ajv.compile(requestSchema)
  const validatePlan = ajv.compile(planSchema)

  if (!validateRequest(request)) {
    fail(
      `[generate-course-plan] invalid course_request:\n${formatErrors(validateRequest.errors || [])}`
    )
  }

  const cards = loadCapabilityCards(CARDS_DIR)
  const aliases = loadCapabilityAliases(CAPABILITY_ALIASES_PATH)
  const plan = buildCoursePlan(request, cards, aliases)

  if (!validatePlan(plan)) {
    fail(`[generate-course-plan] generated course_plan invalid:\n${formatErrors(validatePlan.errors || [])}`)
  }

  const output = JSON.stringify(plan, null, 2)
  if (outPath) {
    const outAbs = path.isAbsolute(outPath) ? outPath : path.join(ROOT, outPath)
    ensureDir(path.dirname(outAbs))
    writeFileSync(outAbs, output + '\n', 'utf8')
    console.log(`[generate-course-plan] wrote ${path.relative(ROOT, outAbs).replaceAll('\\', '/')}`)
    return
  }

  console.log(output)
}

function buildCoursePlan(request, cards, aliases) {
  const text = `${request.topic} ${request.goal} ${(request.must_include || []).join(' ')} ${(request.style || '')}`
  const inferredDomain = inferDomain(text)
  const requestConcepts = extractConcepts(text)

  const cardsById = new Map(cards.map(card => [card.capability_id, card]))
  const candidateCards = buildPlanningCandidates(cards, cardsById, aliases)
  if (candidateCards.length === 0) {
    fail('[generate-course-plan] no available capability cards (all removed or invalid lifecycle)')
  }
  const scored = candidateCards.map(card => ({
    card,
    score: scoreCard(card, request, inferredDomain, requestConcepts),
  }))

  const pedagogyCards = candidateCards.filter(card => card.domain === 'pedagogy')
  const nonPedCandidates = scored
    .filter(item => item.card.domain !== 'pedagogy')
    .sort((a, b) => b.score - a.score)

  const primaryCount = request.duration_min <= 15 ? 1 : request.duration_min <= 35 ? 2 : 3
  const selected = []
  for (const item of nonPedCandidates) {
    if (selected.length >= primaryCount) break
    if (item.score <= 0 && selected.length > 0) break
    selected.push(item.card.capability_id)
  }
  if (selected.length === 0 && nonPedCandidates.length > 0) {
    selected.push(nonPedCandidates[0].card.capability_id)
  }

  // Add in-graph dependencies when dependency itself is also a capability card.
  const selectedSet = new Set(selected)
  let changed = true
  while (changed) {
    changed = false
    for (const id of [...selectedSet]) {
      const card = cardsById.get(id)
      for (const dep of card?.dependencies || []) {
        const depCard = resolveCapabilityCard(dep, aliases, cardsById, { mustExist: false })
        if (!depCard || depCard.status === 'removed') continue
        if (selectedSet.has(depCard.capability_id)) continue
        if (candidateCards.some(candidate => candidate.capability_id === depCard.capability_id)) {
          selectedSet.add(depCard.capability_id)
          changed = true
        }
      }
    }
  }

  const includeStory = shouldIncludeStory(request, pedagogyCards)
  const includeAssessment = shouldIncludeAssessment(request, pedagogyCards)
  const storyCard = pedagogyCards.find(c => c.capability_id.includes('story_context'))
  const assessmentCard = pedagogyCards.find(c => c.capability_id.includes('assessment.quick_check'))

  const selectedDomainCards = [...selectedSet].map(id => cardsById.get(id)).filter(Boolean)
  const sortedDomainCards = sortDomainCards(selectedDomainCards, scored)

  const segments = []
  if (includeStory && storyCard) {
    segments.push(makeSegment('s1', '问题引入', [storyCard]))
  }

  if (sortedDomainCards.length === 1) {
    segments.push(makeSegment(nextSegmentId(segments.length), '核心概念', [sortedDomainCards[0]]))
  } else if (sortedDomainCards.length > 1) {
    const splitIndex = Math.ceil(sortedDomainCards.length / 2)
    const first = sortedDomainCards.slice(0, splitIndex)
    const second = sortedDomainCards.slice(splitIndex)
    segments.push(makeSegment(nextSegmentId(segments.length), '核心概念', first))
    if (second.length > 0) {
      segments.push(makeSegment(nextSegmentId(segments.length), '过程演示', second))
    }
  } else {
    const fallback = candidateCards.find(c => c.domain === inferredDomain) || candidateCards[0]
    segments.push(makeSegment(nextSegmentId(segments.length), '核心概念', [fallback]))
  }

  if (includeAssessment && assessmentCard) {
    segments.push(makeSegment(nextSegmentId(segments.length), '练习与评估', [assessmentCard]))
  }

  assignDurations(segments, request.duration_min)
  const planIdSuffix = request.request_id.replace(/[^a-zA-Z0-9_-]/g, '_')

  const plan = {
    plan_id: `plan_${planIdSuffix}`,
    request_id: request.request_id,
    topic: request.topic,
    total_duration_min: request.duration_min,
    segments,
    quality_targets: {
      min_rubric_score: 4.0,
      must_pass_hard_rules: true,
    },
  }
  return normalizeSegmentDependencies(plan, aliases, cardsById)
}

function makeSegment(segmentId, title, cards) {
  const capabilities = cards.map(card => card.capability_id)
  const expectedSet = new Set()
  const dependencySet = new Set()
  for (const card of cards) {
    for (const output of card.outputs || []) expectedSet.add(output)
    for (const dep of card.dependencies || []) dependencySet.add(dep)
  }

  return {
    segment_id: segmentId,
    title,
    duration_min: 1,
    capabilities,
    expected_output: [...expectedSet].length > 0 ? [...expectedSet] : ['lesson_script'],
    dependencies: [...dependencySet],
  }
}

function assignDurations(segments, total) {
  if (segments.length === 1) {
    segments[0].duration_min = total
    return
  }

  const weights = segments.map(segment => {
    if (segment.title.includes('引入')) return 0.18
    if (segment.title.includes('评估')) return 0.22
    return 0.3
  })
  const weightSum = weights.reduce((a, b) => a + b, 0)
  const normalized = weights.map(w => w / weightSum)
  const raw = normalized.map(w => w * total)
  const durations = raw.map(v => Math.max(1, Math.floor(v)))
  let assigned = durations.reduce((a, b) => a + b, 0)

  while (assigned < total) {
    const idx = indexOfMaxResidual(raw, durations)
    durations[idx] += 1
    assigned += 1
  }
  while (assigned > total) {
    const idx = indexOfReducible(durations)
    if (idx < 0) break
    durations[idx] -= 1
    assigned -= 1
  }

  for (let i = 0; i < segments.length; i += 1) {
    segments[i].duration_min = durations[i]
  }
}

function scoreCard(card, request, inferredDomain, requestConcepts) {
  let score = 0
  if (card.domain === inferredDomain) score += 8
  score += levelScore(card.level, request.learner_profile.level)
  if (card.status === 'deprecated') score -= 4

  const cardText = normalizeText(
    [
      card.capability_id,
      card.name,
      card.domain,
      ...(card.constraints || []),
      ...(card.quality_criteria || []),
      ...(card.examples || []).map(item => item.output_summary || ''),
    ].join(' ')
  )

  const cardConcepts = extractConcepts(cardText)
  let overlap = 0
  for (const concept of requestConcepts) {
    if (cardConcepts.has(concept)) overlap += 1
  }
  score += overlap * 3

  const requestText = normalizeText(`${request.topic} ${request.goal}`)
  if (requestText.includes(card.domain)) score += 2
  if (requestText.includes('dsl') && (card.outputs || []).includes('dsl_patch')) score += 2
  if ((request.must_include || []).some(item => normalizeText(item).includes('练习'))) {
    if (card.capability_id.includes('assessment')) score += 2
  }

  return score
}

function levelScore(cardLevel, requestLevel) {
  if (cardLevel === requestLevel) return 3
  if (requestLevel === 'beginner' && cardLevel === 'intermediate') return -1
  if (requestLevel === 'beginner' && cardLevel === 'advanced') return -3
  if (requestLevel === 'intermediate' && cardLevel === 'beginner') return 1
  if (requestLevel === 'advanced' && cardLevel === 'intermediate') return 1
  return 0
}

function inferDomain(text) {
  const normalized = normalizeText(text)
  let bestDomain = 'geometry'
  let bestScore = Number.NEGATIVE_INFINITY
  for (const [domain, words] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0
    for (const word of words) {
      if (normalized.includes(normalizeText(word))) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      bestDomain = domain
    }
  }
  return bestDomain
}

function extractConcepts(text) {
  const normalized = normalizeText(text)
  const concepts = new Set()
  for (const [canonical, aliases] of Object.entries(CONCEPT_ALIASES)) {
    if (aliases.some(alias => normalized.includes(normalizeText(alias)))) {
      concepts.add(canonical)
    }
  }
  return concepts
}

function shouldIncludeStory(request, pedagogyCards) {
  if (!pedagogyCards.some(card => card.capability_id.includes('story_context'))) return false
  if (request.duration_min >= 12) return true
  const includeText = `${(request.must_include || []).join(' ')} ${request.goal}`
  return /案例|故事|引入|context|story/i.test(includeText)
}

function shouldIncludeAssessment(request, pedagogyCards) {
  if (!pedagogyCards.some(card => card.capability_id.includes('assessment.quick_check'))) return false
  if (request.duration_min >= 10) return true
  const includeText = `${(request.must_include || []).join(' ')} ${request.goal}`
  return /练习|评估|测验|quiz|check/i.test(includeText)
}

function sortDomainCards(cards, scored) {
  const scoreMap = new Map(scored.map(item => [item.card.capability_id, item.score]))
  return [...cards].sort((a, b) => (scoreMap.get(b.capability_id) || 0) - (scoreMap.get(a.capability_id) || 0))
}

function buildPlanningCandidates(cards, cardsById, aliases) {
  const out = []
  for (const card of cards) {
    if (card.status === 'removed') continue
    if (card.status === 'deprecated' && card.replaced_by) {
      const replacement = resolveCapabilityCard(card.replaced_by, aliases, cardsById, { mustExist: false })
      if (replacement && replacement.status !== 'removed') continue
    }
    out.push(card)
  }
  return out
}

function normalizeSegmentDependencies(plan, aliases, cardsById) {
  for (const segment of plan.segments || []) {
    const normalized = new Set()
    for (const dep of segment.dependencies || []) {
      if (!dep.startsWith('teach.')) {
        normalized.add(dep)
        continue
      }
      const depCard = resolveCapabilityCard(dep, aliases, cardsById, { mustExist: false })
      normalized.add(depCard?.capability_id || dep)
    }
    segment.dependencies = [...normalized]
  }
  return plan
}

function loadCapabilityCards(dir) {
  const files = listFilesRecursive(dir).filter(file => file.endsWith('.json'))
  return files.map(loadJson)
}

function loadCapabilityAliases(filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(`[generate-course-plan] file not found: ${path.relative(ROOT, filePath).replaceAll('\\', '/')}`)
  }
  const data = loadJson(filePath)
  return data.aliases || {}
}

function listFilesRecursive(dirPath) {
  const out = []
  const names = readdirSync(dirPath).sort((a, b) => a.localeCompare(b))
  for (const name of names) {
    const full = path.join(dirPath, name)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...listFilesRecursive(full))
    else out.push(full)
  }
  return out
}

function resolveCapabilityCard(id, aliases, cardsById, options = { mustExist: true }) {
  const seen = new Set()
  let current = id
  for (let i = 0; i < 32; i += 1) {
    if (seen.has(current)) {
      fail(`[generate-course-plan] capability alias cycle detected at ${current}`)
    }
    seen.add(current)
    const next = aliases[current]
    if (!next) break
    current = next
  }
  const card = cardsById.get(current)
  if (!card && options.mustExist) return null
  return card || null
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--request' || token === '-r') {
      args.request = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--out' || token === '-o') {
      args.out = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--help' || token === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return args
}

function printHelp() {
  console.log(`Usage:
  node scripts/generate-course-plan.mjs --request <path> [--out <path>]

Defaults:
  --request content/ai/examples/course-request.sample.json
  --out omitted -> print JSON to stdout`)
}

function loadJson(filePath) {
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    fail(`[generate-course-plan] file not found: ${path.relative(ROOT, absolute).replaceAll('\\', '/')}`)
  }
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    fail(`[generate-course-plan] invalid JSON: ${path.relative(ROOT, absolute).replaceAll('\\', '/')} -> ${error.message}`)
  }
}

function normalizeText(text) {
  return String(text || '').toLowerCase()
}

function indexOfMaxResidual(raw, durations) {
  let bestIdx = 0
  let bestResidual = Number.NEGATIVE_INFINITY
  for (let i = 0; i < raw.length; i += 1) {
    const residual = raw[i] - durations[i]
    if (residual > bestResidual) {
      bestResidual = residual
      bestIdx = i
    }
  }
  return bestIdx
}

function indexOfReducible(durations) {
  let bestIdx = -1
  let bestValue = Number.NEGATIVE_INFINITY
  for (let i = 0; i < durations.length; i += 1) {
    if (durations[i] > 1 && durations[i] > bestValue) {
      bestValue = durations[i]
      bestIdx = i
    }
  }
  return bestIdx
}

function nextSegmentId(count) {
  return `s${count + 1}`
}

function formatErrors(errors) {
  return errors.map(error => `- ${error.instancePath || '/'} ${error.message}`).join('\n')
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main()
