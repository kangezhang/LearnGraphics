import { AmbientLight, AxesHelper, Color, GridHelper, Scene } from 'three'
import type { Lesson, LessonContext, UIContext } from '@/core/types'
import { createOrbitControls, type OrbitControls } from '@/core/camera/orbitControls'
import { RendererHost } from '@/core/renderer/RendererHost'

type LessonFactory = () => Promise<Lesson>

type ActiveLesson = {
  lesson: Lesson
  scene: Scene
  controls: OrbitControls
}

export class LessonHost {
  private rendererHost: RendererHost
  private ui: UIContext
  private active?: ActiveLesson

  constructor(rendererHost: RendererHost, ui: UIContext) {
    this.rendererHost = rendererHost
    this.ui = ui
  }

  async mount(factory: LessonFactory) {
    await this.unmount()
    const lesson = await factory()

    const scene = new Scene()
    scene.background = new Color('#0f1116')
    scene.add(new GridHelper(10, 10, 0x2d313a, 0x3f444f))
    scene.add(new AxesHelper(1.25))
    scene.add(new AmbientLight(0xffffff, 0.6))

    const controls = createOrbitControls(this.rendererHost.getCamera(), this.rendererHost.getCanvas())
    const context: LessonContext = {
      scene,
      camera: this.rendererHost.getCamera(),
      renderer: this.rendererHost.getRenderer(),
      canvas: this.rendererHost.getCanvas(),
      controls,
      ui: this.ui,
    }

    this.rendererHost.setScene(scene)
    this.ui.clear()
    await lesson.setup(context)
    this.active = { lesson, scene, controls }
  }

  update(dt: number) {
    this.active?.lesson.update(dt)
    this.active?.controls.update()
  }

  async unmount() {
    if (!this.active) return
    try {
      this.active.lesson.dispose()
    } catch (error) {
      console.error('Lesson dispose failed', error)
    }
    this.active.controls.dispose()
    this.ui.clear()
    this.active = undefined
  }
}
