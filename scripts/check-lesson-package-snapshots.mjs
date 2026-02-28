#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const REQUESTS_DIR = path.join(ROOT, 'content', 'ai', 'regression', 'requests')
const SNAPSHOTS_DIR = path.join(ROOT, 'content', 'ai', 'regression', 'lesson-package-snapshots')
const PLAN_GENERATOR = path.join(ROOT, 'scripts', 'generate-course-plan.mjs')
const PACKAGE_GENERATOR = path.join(ROOT, 'scripts', 'generate-lesson-package.mjs')
const TMP_DIR = path.join(ROOT, 'content', 'ai', 'regression', '.tmp')

function main() {
  const args = parseArgs(process.argv.slice(2))
  const update = Boolean(args.update)

  assertDirExists(REQUESTS_DIR, 'Regression requests directory is missing: content/ai/regression/requests')
  assertFileExists(PLAN_GENERATOR, 'Missing script: scripts/generate-course-plan.mjs')
  assertFileExists(PACKAGE_GENERATOR, 'Missing script: scripts/generate-lesson-package.mjs')

  const requestFiles = listFilesRecursive(REQUESTS_DIR).filter(file => file.endsWith('.json'))
  if (requestFiles.length === 0) fail('No regression request files found.')

  ensureDir(TMP_DIR)
  const failures = []
  let updated = 0

  for (const requestFile of requestFiles) {
    const lessonPackage = generateLessonPackage(requestFile)
    const normalized = JSON.stringify(lessonPackage, null, 2) + '\n'
    const snapshotFile = getSnapshotPath(requestFile)

    if (update) {
      ensureDir(path.dirname(snapshotFile))
      writeFileSync(snapshotFile, normalized, 'utf8')
      updated += 1
      continue
    }

    if (!existsSync(snapshotFile) || !statSync(snapshotFile).isFile()) {
      failures.push(`Missing snapshot: ${relative(snapshotFile)} (request: ${relative(requestFile)})`)
      continue
    }

    const expected = normalizeNewlines(readFileSync(snapshotFile, 'utf8'))
    if (expected !== normalized) {
      failures.push(`Snapshot mismatch: ${relative(snapshotFile)} (request: ${relative(requestFile)})`)
    }
  }

  if (update) {
    console.log(`[check:lesson-package-snapshots] updated ${updated} snapshot files`)
    return
  }

  if (failures.length > 0) {
    console.error('[check:lesson-package-snapshots] failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    console.error('Run: npm run check:lesson-package-snapshots -- --update')
    process.exit(1)
  }

  console.log(`[check:lesson-package-snapshots] OK - ${requestFiles.length} request snapshots matched`)
}

function generateLessonPackage(requestFile) {
  const requestBase = path.basename(requestFile).replace(/\.json$/i, '')
  const planTmp = path.join(TMP_DIR, `${requestBase}.plan.tmp.json`)
  try {
    execFileSync(
      process.execPath,
      [PLAN_GENERATOR, '--request', requestFile, '--out', planTmp],
      { cwd: ROOT, encoding: 'utf8' }
    )
    const output = execFileSync(
      process.execPath,
      [PACKAGE_GENERATOR, '--plan', planTmp, '--request', requestFile],
      { cwd: ROOT, encoding: 'utf8' }
    )
    return JSON.parse(output)
  } catch (error) {
    fail(`Failed generating lesson package for ${relative(requestFile)} -> ${error.message}`)
  } finally {
    if (existsSync(planTmp)) unlinkSync(planTmp)
  }
}

function getSnapshotPath(requestFile) {
  const rel = path.relative(REQUESTS_DIR, requestFile)
  const snapshotRel = rel.replace(/\.json$/i, '.lesson-package.snapshot.json')
  return path.join(SNAPSHOTS_DIR, snapshotRel)
}

function parseArgs(argv) {
  return {
    update: argv.includes('--update'),
  }
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

function assertDirExists(dirPath, message) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) fail(message)
}

function assertFileExists(filePath, message) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) fail(message)
}

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) mkdirSync(dirPath, { recursive: true })
}

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/gu, '\n')
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/')
}

function fail(message) {
  console.error(`[check:lesson-package-snapshots] ${message}`)
  process.exit(1)
}

main()
