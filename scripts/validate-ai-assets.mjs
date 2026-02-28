#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'

const ROOT = process.cwd()
const AI_DIR = path.join(ROOT, 'content', 'ai')
const SCHEMA_DIR = path.join(AI_DIR, 'schemas')
const CARDS_DIR = path.join(AI_DIR, 'capability-cards')
const EXAMPLES_DIR = path.join(AI_DIR, 'examples')
const ALIASES_FILE = path.join(AI_DIR, 'capability-aliases.json')
const TEMPLATE_FILE = path.join(AI_DIR, 'templates', 'lesson-templates.json')

const REQUIRED_SCHEMA_FILES = [
  'course-request.schema.json',
  'course-plan.schema.json',
  'lesson-package.schema.json',
  'capability-card.schema.json',
  'capability-aliases.schema.json',
]

function main() {
  assertDirExists(AI_DIR, 'content/ai directory is missing.')
  assertDirExists(SCHEMA_DIR, 'content/ai/schemas directory is missing.')
  assertDirExists(CARDS_DIR, 'content/ai/capability-cards directory is missing.')
  assertFileExists(TEMPLATE_FILE, 'content/ai/templates/lesson-templates.json is missing.')
  assertFileExists(ALIASES_FILE, 'content/ai/capability-aliases.json is missing.')

  for (const file of REQUIRED_SCHEMA_FILES) {
    assertFileExists(path.join(SCHEMA_DIR, file), `Required schema missing: ${file}`)
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const capabilityCardSchema = loadJson(path.join(SCHEMA_DIR, 'capability-card.schema.json'))
  const courseRequestSchema = loadJson(path.join(SCHEMA_DIR, 'course-request.schema.json'))
  const coursePlanSchema = loadJson(path.join(SCHEMA_DIR, 'course-plan.schema.json'))
  const lessonPackageSchema = loadJson(path.join(SCHEMA_DIR, 'lesson-package.schema.json'))
  const capabilityAliasesSchema = loadJson(path.join(SCHEMA_DIR, 'capability-aliases.schema.json'))
  const validateCapabilityCard = ajv.compile(capabilityCardSchema)
  const validateCourseRequest = ajv.compile(courseRequestSchema)
  const validateCoursePlan = ajv.compile(coursePlanSchema)
  const validateLessonPackage = ajv.compile(lessonPackageSchema)
  const validateCapabilityAliases = ajv.compile(capabilityAliasesSchema)

  // 1) JSON parse check for all AI assets
  const allJsonFiles = listFilesRecursive(AI_DIR).filter(file => file.endsWith('.json'))
  for (const file of allJsonFiles) {
    loadJson(file)
  }

  // 2) Alias schema check
  const aliasDoc = loadJson(ALIASES_FILE)
  if (!validateCapabilityAliases(aliasDoc)) {
    const details = (validateCapabilityAliases.errors || [])
      .map(err => `${err.instancePath || '/'} ${err.message}`)
      .join('; ')
    fail(`Capability aliases invalid: ${relative(ALIASES_FILE)} -> ${details}`)
  }
  const aliases = aliasDoc.aliases || {}

  // 3) Capability card schema check
  const cardFiles = listFilesRecursive(CARDS_DIR).filter(file => file.endsWith('.json'))
  const cards = []
  for (const file of cardFiles) {
    const card = loadJson(file)
    const valid = validateCapabilityCard(card)
    if (!valid) {
      const details = (validateCapabilityCard.errors || [])
        .map(err => `${err.instancePath || '/'} ${err.message}`)
        .join('; ')
      fail(`Capability card invalid: ${relative(file)} -> ${details}`)
    }
    cards.push({ file, card })
  }

  // 4) Unique capability_id check
  const idToFile = new Map()
  const cardsById = new Map()
  for (const item of cards) {
    const id = item.card.capability_id
    if (idToFile.has(id)) {
      fail(
        `Duplicate capability_id "${id}" in ${relative(item.file)} and ${relative(idToFile.get(id))}`
      )
    }
    idToFile.set(id, item.file)
    cardsById.set(id, item.card)
  }

  // 5) Lifecycle checks
  for (const item of cards) {
    const card = item.card
    const id = card.capability_id
    if (card.status === 'deprecated') {
      if (!card.replaced_by) {
        fail(`Deprecated capability missing replaced_by: ${id}`)
      }
      const replacement = resolveCapabilityId(card.replaced_by, aliases, cardsById)
      if (!replacement) {
        fail(`Deprecated capability replacement not found: ${id} -> ${card.replaced_by}`)
      }
      if (replacement.capability_id === id) {
        fail(`Deprecated capability replacement cannot point to itself: ${id}`)
      }
      if (replacement.status === 'removed') {
        fail(`Deprecated capability replacement is removed: ${id} -> ${replacement.capability_id}`)
      }
    }
    if (card.status !== 'deprecated' && card.replaced_by) {
      fail(`Only deprecated capability can set replaced_by: ${id}`)
    }
  }

  // 6) Alias checks
  for (const [from, to] of Object.entries(aliases)) {
    if (from === to) {
      fail(`Capability alias cannot map to itself: ${from}`)
    }
    const resolved = resolveCapabilityId(to, aliases, cardsById)
    if (!resolved) {
      fail(`Capability alias target not found: ${from} -> ${to}`)
    }
    if (resolved.status === 'removed') {
      fail(`Capability alias target is removed: ${from} -> ${resolved.capability_id}`)
    }
    // Ensure alias chain has no cycle from source.
    resolveCapabilityId(from, aliases, cardsById, { mustExist: false })
  }

  // 7) Dependency closure checks for teach.* dependencies
  for (const item of cards) {
    const card = item.card
    if (card.status === 'removed') continue
    for (const dep of card.dependencies || []) {
      if (!dep.startsWith('teach.')) continue
      const depCard = resolveCapabilityId(dep, aliases, cardsById)
      if (!depCard) {
        fail(`Dependency capability not found: ${card.capability_id} -> ${dep}`)
      }
      if (depCard.status === 'removed') {
        fail(`Dependency points to removed capability: ${card.capability_id} -> ${depCard.capability_id}`)
      }
    }
  }

  // 8) Template refs check
  const templates = loadJson(TEMPLATE_FILE)
  const templateIds = new Set((templates.templates || []).map(item => item.template_id))
  for (const item of cards) {
    for (const ref of item.card.template_refs || []) {
      if (!templateIds.has(ref)) {
        fail(`Unknown template_ref "${ref}" in ${relative(item.file)}`)
      }
    }
  }

  // 9) dsl_refs path existence check
  for (const item of cards) {
    for (const dslRef of item.card.dsl_refs || []) {
      if (!dslRef) continue
      const target = path.join(ROOT, dslRef)
      if (!existsSync(target)) {
        fail(`dsl_ref path does not exist: ${dslRef} (in ${relative(item.file)})`)
      }
    }
  }

  // 10) Example schema checks
  if (existsSync(EXAMPLES_DIR) && statSync(EXAMPLES_DIR).isDirectory()) {
    const exampleFiles = listFilesRecursive(EXAMPLES_DIR).filter(file => file.endsWith('.json'))
    for (const file of exampleFiles) {
      const data = loadJson(file)
      const base = path.basename(file).toLowerCase()
      if (base.startsWith('course-request')) {
        if (!validateCourseRequest(data)) {
          const details = (validateCourseRequest.errors || [])
            .map(err => `${err.instancePath || '/'} ${err.message}`)
            .join('; ')
          fail(`Example request invalid: ${relative(file)} -> ${details}`)
        }
      }
      if (base.startsWith('course-plan')) {
        if (!validateCoursePlan(data)) {
          const details = (validateCoursePlan.errors || [])
            .map(err => `${err.instancePath || '/'} ${err.message}`)
            .join('; ')
          fail(`Example plan invalid: ${relative(file)} -> ${details}`)
        }
      }
      if (base.startsWith('lesson-package')) {
        if (!validateLessonPackage(data)) {
          const details = (validateLessonPackage.errors || [])
            .map(err => `${err.instancePath || '/'} ${err.message}`)
            .join('; ')
          fail(`Example lesson package invalid: ${relative(file)} -> ${details}`)
        }
      }
    }
  }

  const statusCounts = summarizeStatus(cards.map(item => item.card))
  console.log(
    `[check:ai-assets] OK - ${allJsonFiles.length} JSON files, ${cardFiles.length} capability cards (${statusCounts})`
  )
}

function loadJson(filePath) {
  try {
    const raw = readFileSync(filePath, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    fail(`Invalid JSON: ${relative(filePath)} -> ${error.message}`)
  }
}

function listFilesRecursive(dirPath) {
  const out = []
  const names = readdirSync(dirPath).sort((a, b) => a.localeCompare(b))
  for (const name of names) {
    const full = path.join(dirPath, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...listFilesRecursive(full))
    } else {
      out.push(full)
    }
  }
  return out
}

function resolveCapabilityId(id, aliases, cardsById, options = { mustExist: true }) {
  const seen = new Set()
  let current = id
  for (let i = 0; i < 32; i += 1) {
    if (seen.has(current)) {
      fail(`Capability alias cycle detected at ${current}`)
    }
    seen.add(current)
    const next = aliases[current]
    if (!next) break
    current = next
  }
  const card = cardsById.get(current)
  if (!card && options.mustExist) {
    return null
  }
  return card || null
}

function summarizeStatus(cards) {
  const counts = { active: 0, deprecated: 0, removed: 0 }
  for (const card of cards) {
    if (counts[card.status] === undefined) continue
    counts[card.status] += 1
  }
  return `active=${counts.active}, deprecated=${counts.deprecated}, removed=${counts.removed}`
}

function assertDirExists(dirPath, message) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) {
    fail(message)
  }
}

function assertFileExists(filePath, message) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    fail(message)
  }
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function fail(message) {
  console.error(`[check:ai-assets] ${message}`)
  process.exit(1)
}

main()
