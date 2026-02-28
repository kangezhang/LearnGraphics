import type { LessonDSL } from '@/semantic/compiler/dslTypes'

export interface AISettings {
  endpoint: string
  apiKey: string
  model: string
  orchestratorMode: 'direct' | 'pipeline'
  orchestratorEndpoint: string
}

export interface AILessonRequest {
  title: string
  description: string
  tags?: string[]
  level?: string
}

export interface AILessonUpdateRequest {
  feedback: string
  existingDSL: LessonDSL
  existingDoc: string
}

export interface GeneratedLessonPayload {
  dsl: LessonDSL
  docMarkdown: string
}

export type OrchestrationStrategy = 'remote' | 'fallback'

export interface OrchestrationMetadata {
  requestId: string
  orchestrator: string
  pipelineVersion: string
  strategy: OrchestrationStrategy
  generatedAt: string
  capabilitySnapshotId?: string
  capabilityIds?: string[]
  baseCapabilitySnapshotId?: string | null
  capabilityDrift?: 'none' | 'mismatch' | 'missing_base'
}

export interface OrchestratedLessonPayload extends GeneratedLessonPayload {
  metadata: OrchestrationMetadata
}

export type LessonRevisionAction = 'create' | 'update' | 'rollback' | 'migrate'

export interface StoredAILessonRevision {
  revision: number
  action: LessonRevisionAction
  note: string
  createdAt: string
  title: string
  tags: string[]
  doc: string
  dsl: LessonDSL
  orchestration?: OrchestrationMetadata
}

export interface StoredAILessonMetadata {
  schemaVersion: number
  lastAction: LessonRevisionAction
  lastNote: string
  headRevision: number
  headUpdatedAt: string
  historyTruncated: boolean
  lastOrchestration: OrchestrationMetadata | null
}

export interface StoredAILessonInput {
  id: string
  title: string
  tags: string[]
  doc: string
  dsl: LessonDSL
  createdAt: string
  updatedAt: string
}

export interface StoredAILesson {
  id: string
  title: string
  tags: string[]
  doc: string
  dsl: LessonDSL
  createdAt: string
  updatedAt: string
  revision: number
  history: StoredAILessonRevision[]
  metadata: StoredAILessonMetadata
}
