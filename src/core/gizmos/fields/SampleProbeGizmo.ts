import * as THREE from 'three'
import { BaseGizmo } from '@/core/gizmos/BaseGizmo'
import type { SemanticEntity } from '@/semantic/model/SemanticGraph'

export class SampleProbeGizmo extends BaseGizmo {
  private head!: THREE.Mesh
  private stem!: THREE.Line
  private sprite!: THREE.Sprite
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D

  private normalColor = new THREE.Color(0xffffff)
  private selectedColor = new THREE.Color(0xff8800)
  private stemHeight = 0.9
  private labelText = ''

  build(entity: SemanticEntity): THREE.Object3D[] {
    const pos = this.getPosition(entity)
    const props = entity.props
    const color = typeof props.color === 'string' ? props.color : '#ffffff'
    this.normalColor.set(color)
    this.stemHeight = Math.max(0.4, Number(props.height ?? 0.9))

    const headGeo = new THREE.SphereGeometry(0.06, 12, 12)
    const headMat = new THREE.MeshPhongMaterial({ color: this.normalColor })
    this.head = new THREE.Mesh(headGeo, headMat)
    this.head.position.copy(pos)
    this.head.userData['gizmoId'] = this.id

    const stemGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pos.x, pos.y, pos.z),
      new THREE.Vector3(pos.x, pos.y + this.stemHeight, pos.z),
    ])
    const stemMat = new THREE.LineBasicMaterial({ color: this.normalColor })
    this.stem = new THREE.Line(stemGeo, stemMat)
    this.stem.userData['gizmoId'] = this.id

    this.canvas = document.createElement('canvas')
    this.canvas.width = 320
    this.canvas.height = 80
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D
    this.drawLabel(entity)

    const texture = new THREE.CanvasTexture(this.canvas)
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    })
    this.sprite = new THREE.Sprite(spriteMat)
    this.sprite.scale.set(1.4, 0.35, 1)
    this.sprite.position.set(pos.x, pos.y + this.stemHeight + 0.2, pos.z)
    this.sprite.userData['gizmoId'] = this.id

    this.objects = [this.head, this.stem, this.sprite]
    return this.objects
  }

  updateFromSemantic(entity: SemanticEntity): void {
    const pos = this.getPosition(entity)
    this.stemHeight = Math.max(0.4, Number(entity.props.height ?? this.stemHeight))

    this.head.position.copy(pos)
    this.sprite.position.set(pos.x, pos.y + this.stemHeight + 0.2, pos.z)

    this.stem.geometry.dispose()
    this.stem.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(pos.x, pos.y, pos.z),
      new THREE.Vector3(pos.x, pos.y + this.stemHeight, pos.z),
    ])

    this.drawLabel(entity)
    const spriteMaterial = this.sprite.material as THREE.SpriteMaterial
    if (spriteMaterial.map) spriteMaterial.map.needsUpdate = true
  }

  protected onSelectionChange(selected: boolean): void {
    const color = selected ? this.selectedColor : this.normalColor
    ;(this.head.material as THREE.MeshPhongMaterial).color.copy(color)
    ;(this.stem.material as THREE.LineBasicMaterial).color.copy(color)
    this.drawLabelColor(selected)
    const spriteMaterial = this.sprite.material as THREE.SpriteMaterial
    if (spriteMaterial.map) spriteMaterial.map.needsUpdate = true
  }

  dispose(): void {
    ;(this.sprite.material as THREE.SpriteMaterial).map?.dispose()
    super.dispose()
  }

  private getPosition(entity: SemanticEntity): THREE.Vector3 {
    const x = Number(entity.props.x ?? 0)
    const y = Number(entity.props.y ?? 0.03)
    const z = Number(entity.props.z ?? 0)
    return new THREE.Vector3(x, y, z)
  }

  private drawLabel(entity: SemanticEntity): void {
    const label = typeof entity.props.label === 'string' ? entity.props.label : 'sample'
    const value = Number(entity.props.value ?? 0)
    this.labelText = `${label}: ${value.toFixed(3)}`
    this.drawText(this.labelText, this.selected)
  }

  private drawLabelColor(selected: boolean): void {
    this.drawText(this.labelText, selected)
  }

  private drawText(text: string, selected: boolean): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    if (!text) return
    this.ctx.fillStyle = selected ? '#ff8800' : '#f8fafc'
    this.ctx.font = 'bold 28px monospace'
    this.ctx.textAlign = 'center'
    this.ctx.textBaseline = 'middle'
    this.ctx.fillText(text, this.canvas.width / 2, this.canvas.height / 2)
  }
}
