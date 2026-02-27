import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

export type RenderUpdate = (dt: number) => void

export class RendererHost {
  private renderer: WebGLRenderer
  private camera: PerspectiveCamera
  private scene: Scene
  private running = false
  private lastTime = 0
  private update?: RenderUpdate
  private resizeHandler: () => void
  private canvas: HTMLCanvasElement

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
    })
    this.renderer.setClearColor(new Color('#0f1116'))
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.camera = new PerspectiveCamera(60, 1, 0.1, 1000)
    this.camera.position.set(3, 3, 4)
    this.camera.lookAt(0, 0, 0)

    this.scene = new Scene()

    this.resizeHandler = () => this.handleResize()
    window.addEventListener('resize', this.resizeHandler)
    this.handleResize()
  }

  getCamera() {
    return this.camera
  }

  getRenderer() {
    return this.renderer
  }

  getCanvas() {
    return this.canvas
  }

  setScene(scene: Scene) {
    this.scene = scene
  }

  setUpdate(update: RenderUpdate) {
    this.update = update
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    requestAnimationFrame(this.tick)
  }

  stop() {
    this.running = false
  }

  dispose() {
    window.removeEventListener('resize', this.resizeHandler)
    this.stop()
    this.renderer.dispose()
  }

  resize(width?: number, height?: number): void {
    this.handleResize(width, height)
  }

  private tick = (time: number) => {
    if (!this.running) return
    const dt = Math.max(0, Math.min(0.05, (time - this.lastTime) / 1000))
    this.lastTime = time
    this.update?.(dt)
    this.renderer.render(this.scene, this.camera)
    requestAnimationFrame(this.tick)
  }

  private handleResize(width?: number, height?: number) {
    const nextWidth = width ?? (this.canvas.clientWidth || this.canvas.parentElement?.clientWidth || window.innerWidth)
    const nextHeight = height ?? (this.canvas.clientHeight || this.canvas.parentElement?.clientHeight || window.innerHeight)
    this.renderer.setSize(nextWidth, nextHeight, false)
    this.camera.aspect = nextWidth / Math.max(nextHeight, 1)
    this.camera.updateProjectionMatrix()
  }
}
