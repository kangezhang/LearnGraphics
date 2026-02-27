export interface GlobalVisualSettings {
  arrowScale: number
  markerScale: number
  symbolScale: number
}

const STORAGE_KEY = 'learn-graphics.visual-settings'
const DEFAULT_VISUAL_SETTINGS: GlobalVisualSettings = {
  arrowScale: 1,
  markerScale: 1,
  symbolScale: 1,
}

let settings: GlobalVisualSettings = { ...DEFAULT_VISUAL_SETTINGS }

const listeners = new Set<(settings: GlobalVisualSettings) => void>()

initializeFromStorage()

export function getGlobalVisualSettings(): GlobalVisualSettings {
  return { ...settings }
}

export function setGlobalVisualSettings(next: Partial<GlobalVisualSettings>): void {
  const merged: GlobalVisualSettings = {
    arrowScale: clamp(toFinite(next.arrowScale, settings.arrowScale), 0.5, 2.2),
    markerScale: clamp(toFinite(next.markerScale, settings.markerScale), 0.5, 2.2),
    symbolScale: clamp(toFinite(next.symbolScale, settings.symbolScale), 0.5, 2.2),
  }

  if (
    Math.abs(merged.arrowScale - settings.arrowScale) < 1e-6 &&
    Math.abs(merged.markerScale - settings.markerScale) < 1e-6 &&
    Math.abs(merged.symbolScale - settings.symbolScale) < 1e-6
  ) {
    return
  }

  settings = merged
  persist()
  const snapshot = getGlobalVisualSettings()
  for (const listener of listeners) listener(snapshot)
}

export function resetGlobalVisualSettings(): void {
  setGlobalVisualSettings(DEFAULT_VISUAL_SETTINGS)
}

export function onGlobalVisualSettingsChange(
  handler: (settings: GlobalVisualSettings) => void
): () => void {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

function initializeFromStorage(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<GlobalVisualSettings>
    settings = {
      arrowScale: clamp(toFinite(parsed.arrowScale, settings.arrowScale), 0.5, 2.2),
      markerScale: clamp(toFinite(parsed.markerScale, settings.markerScale), 0.5, 2.2),
      symbolScale: clamp(toFinite(parsed.symbolScale, settings.symbolScale), 0.5, 2.2),
    }
  } catch {
    // ignore malformed storage
  }
}

function persist(): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore storage failures
  }
}

function toFinite(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
