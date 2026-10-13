import * as THREE from 'three'
import { parseScene } from '../engine/serialization'
import { VERTICES } from '../engine/geometry'
import type { Scene, Shape, Tile } from '../engine/types'
import { CanvasCamera } from './camera'
import { fillGeometry, outlineGeometry, outlineMaterial, PALETTE, SHAPES } from './render-assets'

export { PALETTE } from './render-assets'

export class TileRenderer {
  readonly canvas: HTMLCanvasElement
  readonly camera: CanvasCamera
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly fills = new Map<Shape, THREE.ShapeGeometry>()
  private readonly content = new THREE.Group()
  private readonly ghosts = new THREE.Group()
  private readonly selection = new THREE.Group()
  private frame = 0
  private document: Scene | null = null

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.canvas = this.renderer.domElement
    this.canvas.setAttribute('aria-label', 'Tile Toy canvas')
    container.append(this.canvas)
    this.camera = new CanvasCamera(container.clientWidth, container.clientHeight)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(container.clientWidth, container.clientHeight, false)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.background = new THREE.Color('#f7f7f2')
    this.scene.add(this.content, this.selection, this.ghosts)
    for (const shape of SHAPES) this.fills.set(shape, fillGeometry(shape))
    this.requestRender()
  }

  get tileCount(): number { return this.document?.tiles.length ?? 0 }
  get drawCalls(): number { return this.renderer.info.render.calls }

  setSceneFromJSON(json: string): void { this.setScene(parseScene(json)) }

  setScene(scene: Scene): void {
    this.clearContent()
    this.document = scene
    for (const shape of SHAPES) {
      const tiles = scene.tiles.filter((tile) => tile.shape === shape)
      if (!tiles.length) continue
      const fill = new THREE.InstancedMesh(this.fills.get(shape)!,
        new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), tiles.length)
      const matrix = new THREE.Matrix4()
      const quaternion = new THREE.Quaternion()
      tiles.forEach((tile, index) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), tile.rotation * Math.PI / 180)
        matrix.compose(new THREE.Vector3(tile.x, tile.y, tile.z), quaternion, new THREE.Vector3(1, 1, 1))
        fill.setMatrixAt(index, matrix)
        fill.setColorAt(index, new THREE.Color(PALETTE[tile.color] ?? PALETTE[0]))
      })
      fill.instanceMatrix.needsUpdate = true
      if (fill.instanceColor) fill.instanceColor.needsUpdate = true
      fill.frustumCulled = false
      const outline = new THREE.LineSegments(outlineGeometry(shape, tiles), outlineMaterial)
      outline.frustumCulled = false
      this.content.add(fill, outline)
    }
    this.requestRender()
  }

  setGhost(tiles: readonly Tile[] | null, valid = true): void {
    this.clearGhosts()
    for (const tile of tiles ?? []) {
      const color = valid ? PALETTE[tile.color] ?? PALETTE[0] : '#E53935'
      const mesh = new THREE.Mesh(this.fills.get(tile.shape)!,
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.46,
          depthWrite: false, side: THREE.DoubleSide }))
      mesh.position.set(tile.x, tile.y, 0.08)
      mesh.rotation.z = tile.rotation * Math.PI / 180
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
        VERTICES[tile.shape].map((p) => new THREE.Vector3(p.x, p.y, 0))),
      new THREE.LineBasicMaterial({ color: valid ? '#39434a' : '#b6242a', transparent: true, opacity: 0.8 }))
      line.position.set(tile.x, tile.y, 0.09)
      line.rotation.z = mesh.rotation.z
      this.ghosts.add(mesh, line)
    }
    this.requestRender()
  }

  setSelection(tiles: readonly Tile[]): void {
    this.clearOverlay(this.selection)
    for (const tile of tiles) {
      const mesh = new THREE.Mesh(this.fills.get(tile.shape)!, new THREE.MeshBasicMaterial({
        color: '#176899', transparent: true, opacity: 0.15, depthWrite: false,
        side: THREE.DoubleSide,
      }))
      mesh.position.set(tile.x, tile.y, 0.04)
      mesh.rotation.z = tile.rotation * Math.PI / 180
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
        VERTICES[tile.shape].map((p) => new THREE.Vector3(p.x, p.y, 0))),
      new THREE.LineBasicMaterial({ color: '#184d6d' }))
      line.position.set(tile.x, tile.y, 0.05)
      line.rotation.z = mesh.rotation.z
      this.selection.add(mesh, line)
    }
    this.requestRender()
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(Math.max(1, width), Math.max(1, height), false)
    this.camera.resize(width, height)
    this.requestRender()
  }

  requestRender = (): void => {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.renderer.render(this.scene, this.camera.camera)
    })
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.clearContent()
    this.clearGhosts()
    this.clearOverlay(this.selection)
    this.fills.forEach((geometry) => geometry.dispose())
    this.renderer.dispose()
    this.canvas.remove()
  }

  private clearContent(): void {
    for (const child of [...this.content.children]) {
      if (child instanceof THREE.InstancedMesh) child.material.dispose()
      if (child instanceof THREE.LineSegments) child.geometry.dispose()
      this.content.remove(child)
    }
  }

  private clearGhosts(): void {
    this.clearOverlay(this.ghosts)
  }

  private clearOverlay(group: THREE.Group): void {
    for (const child of [...group.children]) {
      if (child instanceof THREE.Mesh) child.material.dispose()
      if (child instanceof THREE.LineLoop) {
        child.geometry.dispose()
        child.material.dispose()
      }
      group.remove(child)
    }
  }
}
