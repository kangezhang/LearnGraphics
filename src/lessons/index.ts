import type { Lesson } from '@/core/types'

type LessonConfig = {
  title?: string
  tags?: string[]
  summary?: string
  order?: number
}

export type LessonEntry = {
  id: string
  title: string
  tags: string[]
  summary?: string
  order: number
  doc?: string
  load: () => Promise<Lesson>
}

const lessonModules = import.meta.glob('./*/lesson.ts')
const docModules = import.meta.glob('./*/doc.md', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const configModules = import.meta.glob('./*/config.json', { eager: true })

const buildEntries = (): LessonEntry[] => {
  return Object.keys(lessonModules).map((path) => {
    const id = path.split('/')[1]
    const configModule = configModules[`./${id}/config.json`] as { default: LessonConfig } | undefined
    const config = configModule?.default ?? {}
    const doc = docModules[`./${id}/doc.md`] as string | undefined

    return {
      id,
      title: config.title ?? id,
      tags: config.tags ?? [],
      summary: config.summary,
      order: config.order ?? 0,
      doc,
      load: async () => {
        const mod = await lessonModules[`./${id}/lesson.ts`]()
        return (mod as { default: Lesson }).default
      },
    }
  })
}

export const lessons = buildEntries().sort((a, b) => {
  const orderDiff = a.order - b.order
  if (orderDiff !== 0) return orderDiff
  return a.title.localeCompare(b.title)
})
