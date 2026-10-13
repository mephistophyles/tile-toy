import { expect, test } from 'vitest'
import { CanvasCamera, MAX_VISIBLE_HEIGHT, MIN_VISIBLE_HEIGHT } from './camera'

test('camera raycasts to z=0 and resize keeps screen center anchored', () => {
  const camera = new CanvasCamera(800, 600)
  camera.setView({ x: 3, y: -2 }, 8)
  expect(camera.screenToWorld(400, 300)).toEqual({ x: 3, y: -2 })
  camera.resize(1200, 600)
  expect(camera.screenToWorld(600, 300)).toEqual({ x: 3, y: -2 })
})

test('zoom clamps at both limits and preserves the world point under cursor', () => {
  const camera = new CanvasCamera(800, 600)
  const before = camera.screenToWorld(200, 450)
  camera.zoomAt(200, 450, 3)
  const after = camera.screenToWorld(200, 450)
  expect(after.x).toBeCloseTo(before.x)
  expect(after.y).toBeCloseTo(before.y)
  camera.zoomAt(200, 450, 1000)
  expect(camera.visibleHeight).toBe(MIN_VISIBLE_HEIGHT)
  camera.zoomAt(200, 450, 0.0001)
  expect(camera.visibleHeight).toBe(MAX_VISIBLE_HEIGHT)
})

test('pan follows pixel displacement at the current zoom', () => {
  const camera = new CanvasCamera(800, 600)
  camera.setView({ x: 0, y: 0 }, 6)
  camera.panPixels(100, 50)
  expect(camera.center.x).toBeCloseTo(-1)
  expect(camera.center.y).toBeCloseTo(0.5)
})
