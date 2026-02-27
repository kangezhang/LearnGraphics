#!/usr/bin/env node
import { execSync } from 'node:child_process'

const DOC_FILES = new Set([
  'README.md',
  '开发路线图.md',
  '架构设计方案.md',
  '通用学习可视化工具.md',
])

const CODE_PREFIXES = ['src/']

function main() {
  const stagedOnly = process.argv.includes('--staged')
  const files = stagedOnly ? getStagedFiles() : getWorkingTreeFiles()
  if (files.length === 0) process.exit(0)

  const normalized = files.map(normalizePath)
  const hasCodeChanges = normalized.some(isCodeFile)
  if (!hasCodeChanges) process.exit(0)

  const hasDocChanges = normalized.some(file => DOC_FILES.has(file))
  if (hasDocChanges) process.exit(0)

  console.error('\n[doc-sync] 检查失败：检测到代码变更，但未检测到文档变更。')
  console.error(`[doc-sync] 请至少更新以下文档之一并加入提交：${Array.from(DOC_FILES).join(', ')}`)
  console.error('[doc-sync] 若本次确实无需文档更新，请在提交信息中说明原因后再提交。\n')
  process.exit(1)
}

function getStagedFiles() {
  const output = run('git diff --cached --name-only --diff-filter=ACMR')
  return splitLines(output)
}

function getWorkingTreeFiles() {
  const output = run('git diff --name-only --diff-filter=ACMR')
  return splitLines(output)
}

function run(command) {
  return execSync(command, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8')
}

function splitLines(text) {
  return text
    .split(/\r?\n/u)
    .map(s => s.trim())
    .filter(Boolean)
}

function normalizePath(path) {
  return path.replace(/\\/gu, '/')
}

function isCodeFile(path) {
  return CODE_PREFIXES.some(prefix => path.startsWith(prefix))
}

main()
