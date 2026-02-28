#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = process.cwd()
const DEFAULT_PLAN_PATH = path.join(ROOT, 'content', 'ai', 'examples', 'course-plan.sample.json')
const DEFAULT_REQUEST_PATH = path.join(ROOT, 'content', 'ai', 'examples', 'course-request.sample.json')
const COURSE_PLAN_SCHEMA_PATH = path.join(ROOT, 'content', 'ai', 'schemas', 'course-plan.schema.json')
const LESSON_PACKAGE_SCHEMA_PATH = path.join(ROOT, 'content', 'ai', 'schemas', 'lesson-package.schema.json')
const HARD_RULES_PATH = path.join(ROOT, 'content', 'ai', 'rules', 'hard-rules.json')
const RUBRIC_PATH = path.join(ROOT, 'content', 'ai', 'rules', 'rubric.json')
const CARDS_DIR = path.join(ROOT, 'content', 'ai', 'capability-cards')
const ALIASES_PATH = path.join(ROOT, 'content', 'ai', 'capability-aliases.json')

function main() {
  const args = parseArgs(process.argv.slice(2))
  const planPath = args.plan ?? DEFAULT_PLAN_PATH
  const requestPath = args.request ?? DEFAULT_REQUEST_PATH
  const outPath = args.out

  const plan = loadJson(planPath)
  const request = existsSync(resolvePath(requestPath)) ? loadJson(requestPath) : null
  const planSchema = loadJson(COURSE_PLAN_SCHEMA_PATH)
  const lessonPackageSchema = loadJson(LESSON_PACKAGE_SCHEMA_PATH)
  const hardRules = loadJson(HARD_RULES_PATH)
  const rubric = loadJson(RUBRIC_PATH)

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validatePlan = ajv.compile(planSchema)
  const validateLessonPackage = ajv.compile(lessonPackageSchema)

  if (!validatePlan(plan)) {
    fail(`[generate-lesson-package] invalid course_plan:\n${formatErrors(validatePlan.errors || [])}`)
  }

  const cards = loadCapabilityCards(CARDS_DIR)
  const aliases = (loadJson(ALIASES_PATH).aliases || {})
  const cardsById = new Map(cards.map(card => [card.capability_id, card]))

  const lessonPackage = buildLessonPackage(plan, request, hardRules, rubric, aliases, cardsById)

  if (!validateLessonPackage(lessonPackage)) {
    fail(
      `[generate-lesson-package] generated lesson_package invalid:\n${formatErrors(
        validateLessonPackage.errors || []
      )}`
    )
  }

  const output = JSON.stringify(lessonPackage, null, 2)
  if (outPath) {
    const outAbs = resolvePath(outPath)
    ensureDir(path.dirname(outAbs))
    writeFileSync(outAbs, output + '\n', 'utf8')
    console.log(`[generate-lesson-package] wrote ${relative(outAbs)}`)
    return
  }
  console.log(output)
}

function buildLessonPackage(plan, request, hardRules, rubric, aliases, cardsById) {
  const sections = buildLessonSections(plan, request, aliases, cardsById)
  const exercises = buildExercises(plan, request, aliases, cardsById)
  const rubricDoc = buildAssessmentRubric(rubric)
  const dslPatch = buildDslPatch(plan)

  const lessonPackage = {
    request_id: plan.request_id,
    course_plan: plan,
    lesson_script: {
      sections,
    },
    exercise_set: {
      items: exercises,
    },
    assessment_rubric: rubricDoc,
    dsl_patch: dslPatch,
    quality_report: {
      hard_rule_pass: true,
      rubric_score: 4.0,
      violations: [],
    },
  }

  lessonPackage.quality_report = evaluateQuality(
    lessonPackage,
    hardRules,
    rubric,
    request,
    plan.total_duration_min
  )
  return lessonPackage
}

function buildLessonSections(plan, request, aliases, cardsById) {
  const topic = request?.topic || plan.topic
  const learnerLevel = request?.learner_profile?.level || 'beginner'
  return (plan.segments || []).map((segment, idx) => {
    const resolvedCards = resolveCards(segment.capabilities || [], aliases, cardsById)
    const capabilityNames = resolvedCards.map(card => card?.name).filter(Boolean)
    const capText = capabilityNames.length > 0 ? capabilityNames.join('、') : '核心能力'

    const narration = [
      `本段聚焦「${segment.title}」，围绕主题「${topic}」进行讲解。`,
      `将调用能力：${capText}，面向 ${learnerLevel} 学习者逐步展开。`,
      `预计时长 ${segment.duration_min} 分钟，目标是让学习者能复述关键概念并完成对应操作。`,
    ].join('')

    const steps = [
      `定位本段目标与前置依赖：${formatDependencies(segment.dependencies || [])}。`,
      `演示本段关键动作，并解释与「${topic}」的关系。`,
      `让学习者按步骤复现，记录结果并与预期对比。`,
    ]

    const checkQuestions = [
      `请用一句话说明本段「${segment.title}」解决了什么问题？`,
      `如果减少 ${segment.duration_min > 4 ? '一步' : '一个条件'}，结果会发生什么变化？`,
    ]

    return {
      segment_id: segment.segment_id,
      title: segment.title,
      narration,
      steps,
      check_questions: checkQuestions,
    }
  })
}

function buildExercises(plan, request, aliases, cardsById) {
  const topic = request?.topic || plan.topic
  const count = Math.max(2, Math.min(4, Math.ceil((plan.segments || []).length / 2)))
  const items = []
  for (let i = 0; i < count; i += 1) {
    const segment = plan.segments[i % plan.segments.length]
    const resolvedCards = resolveCards(segment.capabilities || [], aliases, cardsById)
    const capName = resolvedCards.find(Boolean)?.name || segment.title
    const difficulty = i === 0 ? 'easy' : i === count - 1 ? 'hard' : 'medium'
    items.push({
      exercise_id: `ex_${i + 1}`,
      title: `${segment.title}练习 ${i + 1}`,
      input: `给定「${topic}」场景与能力「${capName}」的一个实例输入。`,
      steps: [
        `根据题目识别需要调用的能力与依赖。`,
        `按课堂步骤执行并记录关键中间结果。`,
        `对照预期结果自检，说明差异原因。`,
      ],
      expected_output: `完成 ${segment.title} 的关键结论，并能解释其在「${topic}」中的作用。`,
      difficulty,
    })
  }
  return items
}

function buildAssessmentRubric(rubric) {
  const dimensions = (rubric.dimensions || []).map(dim => ({
    id: dim.id,
    name: dim.name,
    scale_min: 1,
    scale_max: 5,
    criteria: {
      '1': `${dim.name} 明显不足，关键点缺失。`,
      '2': `${dim.name} 偏弱，存在多个错误或遗漏。`,
      '3': `${dim.name} 基本达标，但仍有可改进之处。`,
      '4': `${dim.name} 良好，能稳定完成目标任务。`,
      '5': `${dim.name} 优秀，解释清晰且迁移能力强。`,
    },
  }))
  return { dimensions }
}

function buildDslPatch(plan) {
  const markerValues = (plan.segments || []).map(segment => ({
    id: `m_${segment.segment_id}`,
    time: markerTimeHint(segment),
    label: `${segment.title}（${segment.duration_min}m）`,
  }))
  return [
    {
      op: 'add',
      path: '/timeline/markers',
      value: markerValues,
    },
    {
      op: 'add',
      path: '/meta/generatedBy',
      value: 'generate-lesson-package.mjs',
    },
  ]
}

function evaluateQuality(lessonPackage, hardRulesDoc, rubricDoc, request, requestedDurationFallback) {
  const violations = []
  const rules = hardRulesDoc.rules || []
  const requestedDuration = request?.duration_min || requestedDurationFallback || 0
  const actualDuration = sumDuration(lessonPackage.course_plan?.segments || [])
  const durationLower = Math.floor(requestedDuration * 0.9)
  const durationUpper = Math.ceil(requestedDuration * 1.1)

  for (const rule of rules) {
    const result = evaluateRule(rule.id, lessonPackage, {
      requestedDuration,
      actualDuration,
      durationLower,
      durationUpper,
    })
    if (!result.pass) {
      violations.push({
        code: rule.id,
        message: result.message,
        severity: rule.level === 'error' ? 'high' : 'low',
        suggestion: result.suggestion,
      })
    }
  }

  const baseScore = scoreRubricFromViolations(rubricDoc, violations)
  const errorCount = violations.filter(v => v.severity === 'high').length
  const hardRulePass = errorCount === 0
  const rubricScore = clampNumber(baseScore - errorCount * 0.3, 0, 5)

  return {
    hard_rule_pass: hardRulePass,
    rubric_score: round2(rubricScore),
    violations,
  }
}

function evaluateRule(ruleId, lessonPackage, ctx) {
  if (ruleId === 'STRUCTURE_COMPLETE') {
    const required = [
      'course_plan',
      'lesson_script',
      'exercise_set',
      'assessment_rubric',
      'dsl_patch',
      'quality_report',
    ]
    const missing = required.filter(key => lessonPackage[key] === undefined)
    if (missing.length > 0) {
      return {
        pass: false,
        message: `Missing fields: ${missing.join(', ')}`,
        suggestion: '补全 lesson_package 顶层必填字段。',
      }
    }
    return { pass: true }
  }

  if (ruleId === 'DURATION_MATCH') {
    if (ctx.requestedDuration <= 0) return { pass: true }
    const ok = ctx.actualDuration >= ctx.durationLower && ctx.actualDuration <= ctx.durationUpper
    if (!ok) {
      return {
        pass: false,
        message: `Duration out of range: actual=${ctx.actualDuration}, expected=${ctx.requestedDuration}±10%`,
        suggestion: '调整 course_plan 各段时长使总和回到目标区间。',
      }
    }
    return { pass: true }
  }

  if (ruleId === 'TERMINOLOGY_CONSISTENT') {
    return { pass: true }
  }

  if (ruleId === 'EXERCISE_ACTIONABLE') {
    const bad = (lessonPackage.exercise_set?.items || []).find(
      item => !item.input || !item.expected_output || !Array.isArray(item.steps) || item.steps.length < 1
    )
    if (bad) {
      return {
        pass: false,
        message: `Exercise not actionable: ${bad.exercise_id}`,
        suggestion: '为每个练习补齐 input/steps/expected_output。',
      }
    }
    return { pass: true }
  }

  if (ruleId === 'RUBRIC_SCORABLE') {
    const bad = (lessonPackage.assessment_rubric?.dimensions || []).find(dim => {
      const c = dim.criteria || {}
      return !(c['1'] && c['2'] && c['3'] && c['4'] && c['5'])
    })
    if (bad) {
      return {
        pass: false,
        message: `Rubric criteria incomplete: ${bad.id}`,
        suggestion: '确保每个 rubric 维度具备 1~5 分判据。',
      }
    }
    return { pass: true }
  }

  if (ruleId === 'DSL_PATCH_VALID') {
    const patch = lessonPackage.dsl_patch || []
    if (!Array.isArray(patch) || patch.length === 0) {
      return {
        pass: false,
        message: 'dsl_patch is empty',
        suggestion: '至少生成一条 add/replace patch 操作。',
      }
    }
    return { pass: true }
  }

  if (ruleId === 'CHECK_QUESTION_PRESENT') {
    const bad = (lessonPackage.lesson_script?.sections || []).find(
      section => !Array.isArray(section.check_questions) || section.check_questions.length < 1
    )
    if (bad) {
      return {
        pass: false,
        message: `Section missing check_questions: ${bad.segment_id}`,
        suggestion: '每个 section 至少补充 1 个 check question。',
      }
    }
    return { pass: true }
  }

  return { pass: true }
}

function scoreRubricFromViolations(rubricDoc, violations) {
  const dims = rubricDoc.dimensions || []
  if (dims.length === 0) return 4.0
  const hasError = violations.some(v => v.severity === 'high')
  const hasWarn = violations.some(v => v.severity !== 'high')
  if (hasError) return 3.6
  if (hasWarn) return 4.0
  return 4.4
}

function resolveCards(ids, aliases, cardsById) {
  return ids.map(id => resolveCapabilityCard(id, aliases, cardsById)).filter(Boolean)
}

function resolveCapabilityCard(id, aliases, cardsById) {
  const seen = new Set()
  let current = id
  for (let i = 0; i < 32; i += 1) {
    if (seen.has(current)) break
    seen.add(current)
    const next = aliases[current]
    if (!next) break
    current = next
  }
  return cardsById.get(current) || null
}

function markerTimeHint(segment) {
  return Math.max(0, Number(segment.duration_min || 0))
}

function formatDependencies(deps) {
  if (!deps || deps.length === 0) return '无'
  return deps.join('、')
}

function sumDuration(segments) {
  return segments.reduce((sum, segment) => sum + Number(segment.duration_min || 0), 0)
}

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--plan' || token === '-p') {
      args.plan = argv[i + 1]
      i += 1
      continue
    }
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
  node scripts/generate-lesson-package.mjs --plan <path> [--request <path>] [--out <path>]

Defaults:
  --plan content/ai/examples/course-plan.sample.json
  --request content/ai/examples/course-request.sample.json
  --out omitted -> print JSON to stdout`)
}

function loadCapabilityCards(dir) {
  const files = listFilesRecursive(dir).filter(file => file.endsWith('.json'))
  return files.map(loadJson)
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

function resolvePath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath)
}

function loadJson(filePath) {
  const absolute = resolvePath(filePath)
  if (!existsSync(absolute) || !statSync(absolute).isFile()) {
    fail(`[generate-lesson-package] file not found: ${relative(absolute)}`)
  }
  try {
    return JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (error) {
    fail(`[generate-lesson-package] invalid JSON: ${relative(absolute)} -> ${error.message}`)
  }
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
}

function formatErrors(errors) {
  return errors.map(error => `- ${error.instancePath || '/'} ${error.message}`).join('\n')
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

main()
