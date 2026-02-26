import YAML from 'yaml'
import Ajv2020 from 'ajv/dist/2020'
import type { ErrorObject, ValidateFunction } from 'ajv'
import lessonSchema from '@/dsl/schema/lesson-schema.json'
import type { LessonDSL } from '@/semantic/compiler/dslTypes'

export interface ParseIssue {
  type: 'error' | 'warning'
  code: 'PARSE_ERROR' | 'INVALID_SCHEMA'
  message: string
  location: string
}

export interface ParseResult {
  lesson: LessonDSL | null
  issues: ParseIssue[]
}

export class DSLParser {
  private validateSchema: ValidateFunction

  constructor() {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      allowUnionTypes: true,
    })
    this.validateSchema = ajv.compile(lessonSchema as object)
  }

  parse(content: string, format: 'auto' | 'json' | 'yaml' | 'yml' = 'auto'): ParseResult {
    const issues: ParseIssue[] = []
    const resolvedFormat = format === 'auto' ? detectFormat(content) : format

    let raw: unknown
    try {
      raw = resolvedFormat === 'json' ? JSON.parse(content) : YAML.parse(content)
    } catch (err) {
      issues.push({
        type: 'error',
        code: 'PARSE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to parse DSL content.',
        location: '$',
      })
      return { lesson: null, issues }
    }

    const valid = this.validateSchema(raw)
    if (!valid) {
      const schemaIssues = (this.validateSchema.errors ?? []).map(toParseIssue)
      issues.push(...schemaIssues)
      return { lesson: null, issues }
    }

    return { lesson: raw as LessonDSL, issues }
  }
}

function toParseIssue(err: ErrorObject): ParseIssue {
  const location = normalizeLocation(err)
  const message = humanizeMessage(err)
  return {
    type: 'error',
    code: 'INVALID_SCHEMA',
    message,
    location,
  }
}

function normalizeLocation(err: ErrorObject): string {
  const path = err.instancePath && err.instancePath.length > 0 ? err.instancePath : '$'
  if (err.keyword === 'required' && typeof err.params === 'object' && err.params !== null) {
    const missing = (err.params as { missingProperty?: unknown }).missingProperty
    if (typeof missing === 'string' && missing.length > 0) {
      return `${path}/${missing}`
    }
  }
  return path
}

function humanizeMessage(err: ErrorObject): string {
  const base = err.message ?? 'Invalid schema'
  if (err.keyword === 'required' && typeof err.params === 'object' && err.params !== null) {
    const missing = (err.params as { missingProperty?: unknown }).missingProperty
    if (typeof missing === 'string' && missing.length > 0) {
      return `Missing required property "${missing}".`
    }
  }
  if (err.keyword === 'enum' && Array.isArray((err.params as { allowedValues?: unknown[] }).allowedValues)) {
    const values = ((err.params as { allowedValues?: unknown[] }).allowedValues ?? []).join(', ')
    return `${base}. Allowed values: ${values}.`
  }
  return base
}

function detectFormat(content: string): 'json' | 'yaml' {
  const trimmed = content.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json'
  return 'yaml'
}
