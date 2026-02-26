export interface VectorFieldParams {
  centerX: number
  centerZ: number
  y: number
  width: number
  depth: number
  resolution: number
  coefficients: {
    vxX: number
    vxZ: number
    vxBias: number
    vzX: number
    vzZ: number
    vzBias: number
  }
}

export interface VectorFieldSample {
  vx: number
  vz: number
  magnitude: number
}

const DEFAULT_RESOLUTION = 11
const DEFAULT_SIZE = 4

export function parseVectorFieldParams(props: Record<string, unknown>): VectorFieldParams {
  const size = parseSize(props.size)
  const resolution = Math.max(3, Math.floor(toFinite(props.resolution, DEFAULT_RESOLUTION)))
  const centerX = toFinite(props.x, 0)
  const centerZ = toFinite(props.z, 0)
  const y = toFinite(props.y, 0.03)
  const coefficients = parseCoefficients(props.coefficients)

  return {
    centerX,
    centerZ,
    y,
    width: size.width,
    depth: size.depth,
    resolution,
    coefficients,
  }
}

export function evaluateVectorAt(
  params: VectorFieldParams,
  worldX: number,
  worldZ: number
): VectorFieldSample {
  const x = worldX - params.centerX
  const z = worldZ - params.centerZ
  const c = params.coefficients
  const vx = c.vxX * x + c.vxZ * z + c.vxBias
  const vz = c.vzX * x + c.vzZ * z + c.vzBias
  return {
    vx,
    vz,
    magnitude: Math.hypot(vx, vz),
  }
}

export function sampleVectorMagnitudeRange(params: VectorFieldParams): [number, number] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (let j = 0; j < params.resolution; j++) {
    const tz = params.resolution > 1 ? j / (params.resolution - 1) : 0
    const z = params.centerZ + (tz - 0.5) * params.depth
    for (let i = 0; i < params.resolution; i++) {
      const tx = params.resolution > 1 ? i / (params.resolution - 1) : 0
      const x = params.centerX + (tx - 0.5) * params.width
      const sample = evaluateVectorAt(params, x, z)
      min = Math.min(min, sample.magnitude)
      max = Math.max(max, sample.magnitude)
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (Math.abs(max - min) < 1e-8) return [min, min + 1]
  return [min, max]
}

function parseSize(raw: unknown): { width: number; depth: number } {
  if (Array.isArray(raw) && raw.length >= 2) {
    return {
      width: Math.max(0.1, toFinite(raw[0], DEFAULT_SIZE)),
      depth: Math.max(0.1, toFinite(raw[1], DEFAULT_SIZE)),
    }
  }
  const size = Math.max(0.1, toFinite(raw, DEFAULT_SIZE))
  return { width: size, depth: size }
}

function parseCoefficients(raw: unknown): VectorFieldParams['coefficients'] {
  const source = isRecord(raw) ? raw : {}
  return {
    vxX: toFinite(source.vxX, 0),
    vxZ: toFinite(source.vxZ, 1),
    vxBias: toFinite(source.vxBias, 0),
    vzX: toFinite(source.vzX, -1),
    vzZ: toFinite(source.vzZ, 0),
    vzBias: toFinite(source.vzBias, 0),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toFinite(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}
