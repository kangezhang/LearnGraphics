import type { PerspectiveCamera } from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function createOrbitControls(camera: PerspectiveCamera, canvas: HTMLCanvasElement) {
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.enablePan = true
  controls.update()
  return controls
}

export type { OrbitControls }
