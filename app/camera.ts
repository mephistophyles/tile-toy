import * as THREE from 'three'
import type { Point } from '../engine/types'

export const MIN_VISIBLE_HEIGHT = 2
export const MAX_VISIBLE_HEIGHT = 40

export class CanvasCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  private readonly raycaster = new THREE.Raycaster()
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  private width: number
  private height: number
  private worldHeight = 10

  constructor(width: number, height: number) {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.camera.position.set(0, 0, 10)
    this.camera.lookAt(0, 0, 0)
    this.updateProjection()
  }

  get visibleHeight(): number { return this.worldHeight }
  get center(): Point { return { x: this.camera.position.x, y: this.camera.position.y } }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.updateProjection()
  }

  setView(center: Point, visibleHeight: number): void {
    this.camera.position.set(center.x, center.y, 10)
    this.worldHeight = THREE.MathUtils.clamp(visibleHeight, MIN_VISIBLE_HEIGHT, MAX_VISIBLE_HEIGHT)
    this.updateProjection()
  }

  screenToWorld(x: number, y: number): Point {
    const ndc = new THREE.Vector2(x / this.width * 2 - 1, 1 - y / this.height * 2)
    this.camera.updateMatrixWorld()
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3())
    if (!hit) throw new Error('Camera ray missed the ground plane')
    return { x: hit.x, y: hit.y }
  }

  worldToScreen(point: Point): Point {
    this.camera.updateMatrixWorld()
    const projected = new THREE.Vector3(point.x, point.y, 0).project(this.camera)
    return { x: (projected.x + 1) * this.width / 2, y: (1 - projected.y) * this.height / 2 }
  }

  panPixels(dx: number, dy: number): void {
    const unitsPerPixel = this.worldHeight / this.height
    this.camera.position.x -= dx * unitsPerPixel
    this.camera.position.y += dy * unitsPerPixel
    this.camera.updateMatrixWorld()
  }

  zoomAt(x: number, y: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return
    const before = this.screenToWorld(x, y)
    this.worldHeight = THREE.MathUtils.clamp(this.worldHeight / factor, MIN_VISIBLE_HEIGHT, MAX_VISIBLE_HEIGHT)
    this.updateProjection()
    const after = this.screenToWorld(x, y)
    this.camera.position.x += before.x - after.x
    this.camera.position.y += before.y - after.y
    this.camera.updateMatrixWorld()
  }

  fitBounds(min: Point, max: Point, padding = 1.5): void {
    const aspect = this.width / this.height
    const width = Math.max(0.1, max.x - min.x)
    const height = Math.max(0.1, max.y - min.y)
    const visibleHeight = Math.max(height + padding * 2, (width + padding * 2) / aspect)
    this.setView({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }, visibleHeight)
  }

  private updateProjection(): void {
    const halfHeight = this.worldHeight / 2
    const halfWidth = halfHeight * this.width / this.height
    Object.assign(this.camera, { left: -halfWidth, right: halfWidth,
      top: halfHeight, bottom: -halfHeight })
    this.camera.updateProjectionMatrix()
    this.camera.updateMatrixWorld()
  }
}
