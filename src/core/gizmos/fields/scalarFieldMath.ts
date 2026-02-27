export interface ScalarFieldParams {
  centerX: number
  centerZ: number
  width: number
  depth: number
  resolution: number
  coefficients: {
    a: number
    b: number
    c: number
    d: number
    e: number
    f: number
  }
}

export interface ScalarFieldGrid {
  params: ScalarFieldParams
  values: number[][]
  min: number
  max: number
}

export type ScalarFieldMode = 'plane' | 'surface' | 'both'
export type ScalarHeightMode = 'normalized' | 'centered' | 'absolute'

const DEFAULT_RESOLUTION = 48
const DEFAULT_SIZE = 4

export function parseScalarFieldParams(props: Record<string, unknown>): ScalarFieldParams {
  const size = parseSize(props.size)
  const resolution = Math.max(8, Math.floor(toFinite(props.resolution, DEFAULT_RESOLUTION)))
  const centerX = toFinite(props.x, 0)
  const centerZ = toFinite(props.z, 0)
  const coeff = parseCoefficients(props.coefficients)

  return {
    centerX,
    centerZ,
    width: size.width,
    depth: size.depth,
    resolution,
    coefficients: coeff,
  }
}

export function evaluateScalarAt(
  params: ScalarFieldParams,
  worldX: number,
  worldZ: number
): number {
  const x = worldX - params.centerX
  const z = worldZ - params.centerZ
  const c = params.coefficients
  return c.a * x * x + c.b * z * z + c.c * x * z + c.d * x + c.e * z + c.f
}

export function buildScalarFieldGrid(
  params: ScalarFieldParams,
  explicitRange: [number, number] | null
): ScalarFieldGrid {
  const values: number[][] = []
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (let j = 0; j < params.resolution; j++) {
    const row: number[] = []
    const tz = params.resolution > 1 ? j / (params.resolution - 1) : 0
    const z = params.centerZ + (tz - 0.5) * params.depth
    for (let i = 0; i < params.resolution; i++) {
      const tx = params.resolution > 1 ? i / (params.resolution - 1) : 0
      const x = params.centerX + (tx - 0.5) * params.width
      const value = evaluateScalarAt(params, x, z)
      row.push(value)
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
    values.push(row)
  }

  const range = explicitRange ?? [min, max]
  if (Math.abs(range[1] - range[0]) < 1e-8) {
    range[1] = range[0] + 1
  }

  return {
    params,
    values,
    min: range[0],
    max: range[1],
  }
}

export function parseValueRange(props: Record<string, unknown>): [number, number] | null {
  const raw = props.valueRange
  if (!Array.isArray(raw) || raw.length < 2) return null
  const min = toFinite(raw[0], Number.NaN)
  const max = toFinite(raw[1], Number.NaN)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  if (Math.abs(max - min) < 1e-8) return [min, min + 1]
  return min < max ? [min, max] : [max, min]
}

export function parseIsoLevels(
  props: Record<string, unknown>,
  min: number,
  max: number
): number[] {
  const raw = props.isoLevels
  if (Array.isArray(raw)) {
    const levels = raw
      .map(item => toFinite(item, Number.NaN))
      .filter(value => Number.isFinite(value))
    return levels.length > 0 ? levels.sort((a, b) => a - b) : []
  }

  const count = Math.max(0, Math.floor(toFinite(props.isoCount, 6)))
  if (count <= 0) return []
  const levels: number[] = []
  for (let i = 1; i <= count; i++) {
    levels.push(min + (i / (count + 1)) * (max - min))
  }
  return levels
}

export function parseScalarFieldMode(props: Record<string, unknown>): ScalarFieldMode {
  const raw = props.mode
  if (typeof raw === 'string') {
    const mode = raw.toLowerCase()
    if (mode === 'plane' || mode === 'surface' || mode === 'both') return mode
  }
  return 'plane'
}

export function parseScalarHeightMode(props: Record<string, unknown>): ScalarHeightMode {
  const raw = props.heightMode
  if (typeof raw === 'string') {
    const mode = raw.toLowerCase()
    if (mode === 'normalized' || mode === 'centered' || mode === 'absolute') return mode
  }
  return 'normalized'
}

export function mapScalarToHeight(
  value: number,
  min: number,
  max: number,
  scale: number,
  mode: ScalarHeightMode
): number {
  const safeSpan = Math.max(max - min, 1e-8)
  switch (mode) {
    case 'centered': {
      const center = (min + max) * 0.5
      return ((value - center) / safeSpan) * scale
    }
    case 'absolute':
      return value * scale
    case 'normalized':
    default:
      return ((value - min) / safeSpan) * scale
  }
}

export function sampleHeatColor(value: number, min: number, max: number): [number, number, number] {
  const t = clamp01((value - min) / Math.max(max - min, 1e-8))

  const stops: Array<{ t: number; color: [number, number, number] }> = [
    { t: 0.0, color: [15, 82, 186] },
    { t: 0.25, color: [8, 145, 178] },
    { t: 0.5, color: [16, 185, 129] },
    { t: 0.75, color: [245, 158, 11] },
    { t: 1.0, color: [239, 68, 68] },
  ]

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (t >= a.t && t <= b.t) {
      const k = (t - a.t) / Math.max(b.t - a.t, 1e-8)
      return [
        Math.round(lerp(a.color[0], b.color[0], k)),
        Math.round(lerp(a.color[1], b.color[1], k)),
        Math.round(lerp(a.color[2], b.color[2], k)),
      ]
    }
  }
  return stops[stops.length - 1].color
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

function parseCoefficients(raw: unknown): ScalarFieldParams['coefficients'] {
  const source = isRecord(raw) ? raw : {}
  return {
    a: toFinite(source.a, 1),
    b: toFinite(source.b, 1),
    c: toFinite(source.c, 0),
    d: toFinite(source.d, 0),
    e: toFinite(source.e, 0),
    f: toFinite(source.f, 0),
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

function clamp01(value: number): number {
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
