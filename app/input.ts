import type { Point } from '../engine/types'
import type { CanvasCamera } from './camera'

type PointerState = { point: Point; start: Point; startWorld: Point; mode: 'tile' | 'pan' | 'pinch'; moved: boolean }
type GestureCallbacks = {
  press: (world: Point) => boolean
  drag: (delta: Point) => void
  release: (delta: Point) => void
  cancel: () => void
  viewChanged: () => void
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export class CanvasInput {
  private readonly pointers = new Map<number, PointerState>()

  constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: CanvasCamera,
    private readonly callbacks: GestureCallbacks) {
    canvas.addEventListener('pointerdown', this.down)
    canvas.addEventListener('pointermove', this.move)
    canvas.addEventListener('pointerup', this.up)
    canvas.addEventListener('pointercancel', this.cancel)
    canvas.addEventListener('wheel', this.wheel, { passive: false })
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.down)
    this.canvas.removeEventListener('pointermove', this.move)
    this.canvas.removeEventListener('pointerup', this.up)
    this.canvas.removeEventListener('pointercancel', this.cancel)
    this.canvas.removeEventListener('wheel', this.wheel)
  }

  private local(event: { clientX: number; clientY: number }): Point {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private down = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const point = this.local(event)
    this.canvas.setPointerCapture(event.pointerId)
    if (this.pointers.size) {
      for (const state of this.pointers.values()) {
        if (state.mode === 'tile' && state.moved) this.callbacks.cancel()
        state.mode = 'pinch'
      }
      this.pointers.set(event.pointerId, { point, start: point,
        startWorld: this.camera.screenToWorld(point.x, point.y), mode: 'pinch', moved: false })
      return
    }
    const startWorld = this.camera.screenToWorld(point.x, point.y)
    const mode = this.callbacks.press(startWorld) ? 'tile' : 'pan'
    this.pointers.set(event.pointerId, { point, start: point, startWorld, mode, moved: false })
  }

  private move = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId)
    if (!state) return
    const point = this.local(event)
    if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
      if (other) {
        const oldMid = midpoint(state.point, other.point)
        const newMid = midpoint(point, other.point)
        this.camera.panPixels(newMid.x - oldMid.x, newMid.y - oldMid.y)
        this.camera.zoomAt(newMid.x, newMid.y,
          distance(point, other.point) / Math.max(1, distance(state.point, other.point)))
        this.callbacks.viewChanged()
      }
    } else if (state.mode === 'pan') {
      this.camera.panPixels(point.x - state.point.x, point.y - state.point.y)
      this.callbacks.viewChanged()
    } else if (state.mode === 'tile') {
      if (distance(point, state.start) >= 4) state.moved = true
      if (state.moved) this.callbacks.drag(this.delta(state.startWorld, point))
    }
    state.point = point
  }

  private up = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId)
    if (!state) return
    if (state.mode === 'tile' && state.moved)
      this.callbacks.release(this.delta(state.startWorld, this.local(event)))
    this.finish(event.pointerId)
  }

  private cancel = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId)
    if (state?.mode === 'tile' && state.moved) this.callbacks.cancel()
    this.finish(event.pointerId)
  }

  private finish(id: number): void {
    this.pointers.delete(id)
    if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    if (this.pointers.size === 1) {
      const remaining = [...this.pointers.values()][0]!
      remaining.mode = 'pan'
      remaining.start = remaining.point
    }
  }

  private wheel = (event: WheelEvent): void => {
    event.preventDefault()
    const point = this.local(event)
    const factor = Math.exp(-event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.04 : 0.0015))
    this.camera.zoomAt(point.x, point.y, factor)
    this.callbacks.viewChanged()
  }

  private delta(start: Point, screen: Point): Point {
    const current = this.camera.screenToWorld(screen.x, screen.y)
    return { x: current.x - start.x, y: current.y - start.y }
  }
}
