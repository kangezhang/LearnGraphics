import type { DSLEntity } from '@/semantic/compiler/dslTypes'
import { AnchorFunctions, type Vec3Like } from '@/semantic/anchors/AnchorFunctions'

export interface AnchorContext {
  entityMap: Map<string, DSLEntity>
}

export class AnchorResolver {
  resolve(anchor: unknown, ctx: AnchorContext): Vec3Like {
    if (Array.isArray(anchor) && anchor.length >= 3) {
      return {
        x: Number(anchor[0] ?? 0),
        y: Number(anchor[1] ?? 0),
        z: Number(anchor[2] ?? 0),
      }
    }

    if (typeof anchor !== 'string' || anchor.trim().length === 0) {
      return AnchorFunctions.center()
    }

    const text = anchor.trim()
    if (text === 'center') return AnchorFunctions.center()
    if (text === 'camera') return AnchorFunctions.camera()

    const call = parseCall(text)
    if (!call) return AnchorFunctions.center()

    const args = call.args.map(arg => this.resolveArgument(arg, ctx))
    switch (call.name) {
      case 'project':
        if (args.length >= 2) return AnchorFunctions.project(args[0], args[1])
        return AnchorFunctions.center()
      case 'closest_point':
        if (args.length >= 3) return AnchorFunctions.closestPoint(args[0], args[1], args[2])
        return AnchorFunctions.center()
      case 'intersection':
        if (args.length >= 4) return AnchorFunctions.intersection(args[0], args[1], args[2], args[3])
        return AnchorFunctions.center()
      default:
        return AnchorFunctions.center()
    }
  }

  private resolveArgument(token: string, ctx: AnchorContext): Vec3Like {
    const entity = ctx.entityMap.get(token)
    if (entity) {
      return this.entityPosition(entity)
    }
    const num = Number(token)
    if (Number.isFinite(num)) {
      return { x: num, y: 0, z: 0 }
    }
    return AnchorFunctions.center()
  }

  private entityPosition(entity: DSLEntity): Vec3Like {
    if (Array.isArray(entity.position) && entity.position.length >= 3) {
      return {
        x: Number(entity.position[0] ?? 0),
        y: Number(entity.position[1] ?? 0),
        z: Number(entity.position[2] ?? 0),
      }
    }

    const props = entity.props ?? {}
    return {
      x: Number(props.x ?? 0),
      y: Number(props.y ?? 0),
      z: Number(props.z ?? 0),
    }
  }
}

function parseCall(input: string): { name: string; args: string[] } | null {
  const m = input.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/)
  if (!m) return null
  const [, name, inner] = m
  const args = inner
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return { name, args }
}
