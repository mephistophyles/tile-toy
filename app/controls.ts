import type { CanvasCamera } from './camera'

type Pointer = { x: number; y: number }
const midpoint = (a: Pointer, b: Pointer): Pointer => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const distance = (a: Pointer, b: Pointer): number => Math.hypot(a.x - b.x, a.y - b.y)

export class CameraControls {
  private readonly pointers = new Map<number, Pointer>()

  constructor(private readonly canvas: HTMLCanvasElement, private readonly camera: CanvasCamera,
    private readonly requestRender: () => void) {
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerEnd)
    canvas.addEventListener('pointercancel', this.onPointerEnd)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerEnd)
    this.canvas.removeEventListener('pointercancel', this.onPointerEnd)
    this.canvas.removeEventListener('wheel', this.onWheel)
  }

  private local(event: { clientX: number; clientY: number }): Pointer {
    const rect = this.canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    this.canvas.setPointerCapture(event.pointerId)
    this.pointers.set(event.pointerId, this.local(event))
  }

  private onPointerMove = (event: PointerEvent): void => {
    const previous = this.pointers.get(event.pointerId)
    if (!previous) return
    const current = this.local(event)
    if (this.pointers.size === 1) {
      this.camera.panPixels(current.x - previous.x, current.y - previous.y)
    } else if (this.pointers.size === 2) {
      const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1]
      if (!other) return
      const oldMidpoint = midpoint(previous, other)
      const newMidpoint = midpoint(current, other)
      this.camera.panPixels(newMidpoint.x - oldMidpoint.x, newMidpoint.y - oldMidpoint.y)
      this.camera.zoomAt(newMidpoint.x, newMidpoint.y,
        distance(current, other) / Math.max(1, distance(previous, other)))
    }
    this.pointers.set(event.pointerId, current)
    this.requestRender()
  }

  private onPointerEnd = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
  }

  private onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const point = this.local(event)
    const factor = Math.exp(-event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 0.04 : 0.0015))
    this.camera.zoomAt(point.x, point.y, factor)
    this.requestRender()
  }
}
