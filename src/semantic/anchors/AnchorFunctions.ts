export interface Vec3Like {
  x: number
  y: number
  z: number
}

export class AnchorFunctions {
  static center(): Vec3Like {
    return { x: 0, y: 0, z: 0 }
  }

  static camera(): Vec3Like {
    return { x: 0, y: 4, z: 8 }
  }

  static intersection(rayPoint: Vec3Like, rayDir: Vec3Like, planePoint: Vec3Like, planeNormal: Vec3Like): Vec3Like {
    const nDotD = dot(planeNormal, rayDir)
    if (Math.abs(nDotD) < 1e-6) return rayPoint
    const t = dot(planeNormal, sub(planePoint, rayPoint)) / nDotD
    return add(rayPoint, scale(rayDir, t))
  }

  static closestPoint(point: Vec3Like, lineA: Vec3Like, lineB: Vec3Like): Vec3Like {
    const ab = sub(lineB, lineA)
    const ab2 = dot(ab, ab)
    if (ab2 < 1e-8) return lineA
    const t = dot(sub(point, lineA), ab) / ab2
    const clamped = Math.max(0, Math.min(1, t))
    return add(lineA, scale(ab, clamped))
  }

  static project(vectorA: Vec3Like, vectorB: Vec3Like): Vec3Like {
    const bb = dot(vectorB, vectorB)
    if (bb < 1e-8) return { x: 0, y: 0, z: 0 }
    const k = dot(vectorA, vectorB) / bb
    return scale(vectorB, k)
  }
}

function add(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function sub(a: Vec3Like, b: Vec3Like): Vec3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
}

function scale(v: Vec3Like, k: number): Vec3Like {
  return { x: v.x * k, y: v.y * k, z: v.z * k }
}

function dot(a: Vec3Like, b: Vec3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}
