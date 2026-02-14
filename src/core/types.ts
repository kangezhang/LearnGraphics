import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export type LessonMeta = {
  id: string
  title: string
  tags?: string[]
  summary?: string
  order?: number
}

export type SliderOptions = {
  id: string
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
}

export type ToggleOptions = {
  id: string
  label: string
  value: boolean
  onChange: (value: boolean) => void
}

export type ButtonOptions = {
  id: string
  label: string
  onClick: () => void
}

export type TextOptions = {
  id: string
  label: string
  value: string
}

export interface UIContext {
  clear(): void
  slider(options: SliderOptions): void
  toggle(options: ToggleOptions): void
  button(options: ButtonOptions): void
  text(options: TextOptions): (value: string) => void
}

export type LessonContext = {
  scene: Scene
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  canvas: HTMLCanvasElement
  controls: OrbitControls
  ui: UIContext
}

export interface Lesson {
  meta: LessonMeta
  setup(context: LessonContext): void | Promise<void>
  update(dt: number): void
  dispose(): void
}
