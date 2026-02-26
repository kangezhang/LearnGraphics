import type { DSLPatch } from '@/dsl/patch/TimelinePatch'

type PointerSegment = string | number

export class PatchApplier {
  apply<T>(document: T, patches: DSLPatch[]): T {
    const root = deepClone(document)
    for (const patch of patches) {
      switch (patch.op) {
        case 'add':
          this.add(root, patch.path, patch.value)
          break
        case 'remove':
          this.remove(root, patch.path)
          break
        case 'replace':
          this.replace(root, patch.path, patch.value)
          break
        case 'move': {
          if (typeof patch.value !== 'string') {
            throw new Error(`move patch requires "value" as source pointer: ${patch.path}`)
          }
          this.move(root, patch.value, patch.path)
          break
        }
        default:
          throw new Error(`Unsupported patch op: ${(patch as { op?: string }).op ?? '(unknown)'}`)
      }
    }
    return root
  }

  private add(document: unknown, path: string, value: unknown): void {
    const { parent, key } = this.resolveParent(document, path)
    if (Array.isArray(parent)) {
      if (key === '-') {
        parent.push(value)
        return
      }
      const index = toArrayIndex(key, parent.length + 1)
      parent.splice(index, 0, value)
      return
    }
    ;(parent as Record<string, unknown>)[String(key)] = value
  }

  private remove(document: unknown, path: string): void {
    const { parent, key } = this.resolveParent(document, path)
    if (Array.isArray(parent)) {
      const index = toArrayIndex(key, parent.length)
      parent.splice(index, 1)
      return
    }
    delete (parent as Record<string, unknown>)[String(key)]
  }

  private replace(document: unknown, path: string, value: unknown): void {
    const { parent, key } = this.resolveParent(document, path)
    if (Array.isArray(parent)) {
      const index = toArrayIndex(key, parent.length)
      parent[index] = value
      return
    }
    ;(parent as Record<string, unknown>)[String(key)] = value
  }

  private move(document: unknown, fromPath: string, toPath: string): void {
    const value = this.get(document, fromPath)
    this.remove(document, fromPath)
    this.add(document, toPath, value)
  }

  private get(document: unknown, path: string): unknown {
    const segments = parsePointer(path)
    let current: unknown = document
    for (const seg of segments) {
      if (Array.isArray(current)) {
        const index = toArrayIndex(seg, current.length)
        current = current[index]
      } else if (isObject(current)) {
        current = current[String(seg)]
      } else {
        throw new Error(`Invalid pointer path: ${path}`)
      }
    }
    return current
  }

  private resolveParent(document: unknown, path: string): { parent: unknown; key: PointerSegment } {
    const segments = parsePointer(path)
    if (segments.length === 0) {
      throw new Error('Root path "/" is not assignable in this PatchApplier.')
    }
    const key = segments.pop() as PointerSegment
    let parent: unknown = document
    for (const seg of segments) {
      if (Array.isArray(parent)) {
        const index = toArrayIndex(seg, parent.length)
        parent = parent[index]
      } else if (isObject(parent)) {
        const k = String(seg)
        if (!(k in parent) || parent[k] === undefined) {
          parent[k] = {}
        }
        parent = parent[k]
      } else {
        throw new Error(`Invalid pointer path: ${path}`)
      }
    }
    return { parent, key }
  }
}

function parsePointer(path: string): PointerSegment[] {
  if (path === '' || path === '/') return []
  if (!path.startsWith('/')) throw new Error(`Invalid JSON pointer: ${path}`)
  return path
    .slice(1)
    .split('/')
    .map(unescapePointer)
    .map(seg => (isInteger(seg) ? Number(seg) : seg))
}

function unescapePointer(seg: string): string {
  return seg.replace(/~1/g, '/').replace(/~0/g, '~')
}

function toArrayIndex(seg: PointerSegment, maxExclusive: number): number {
  if (typeof seg !== 'number' || !Number.isInteger(seg)) {
    throw new Error(`Invalid array index: ${String(seg)}`)
  }
  if (seg < 0 || seg >= maxExclusive) {
    throw new Error(`Array index out of bounds: ${seg}`)
  }
  return seg
}

function isInteger(text: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(text)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}
