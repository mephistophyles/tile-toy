import { describe, expect, test } from 'vitest'
import { boundaryEdges, connectedComponent, contactsBetween } from '../engine/adjacency'
import { anyOverlap, polygonEdges, rotatePoint, sub } from '../engine/geometry'
import { validPlacement } from '../engine/snap'
import { emptyScene } from '../engine/serialization'
import type { Edge, Tile } from '../engine/types'
import { EditorModel } from './editor-model'

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-7)
const direction = (edge: Edge) => sub(edge.b, edge.a)

describe('M4 stamp workflow', () => {
  test('six triangles become a reusable rigid hexagon, then independent tiles', () => {
    let sequence = 0
    const model = new EditorModel(emptyScene(), () => `id-${++sequence}`)
    const triangles: Tile[] = Array.from({ length: 6 }, (_, index) => ({
      id: `triangle-${index}`, shape: 'triangle', x: 0, y: 0, z: 0,
      rotation: index * 60, color: index, groupId: null,
    }))
    model.loadScene({ ...emptyScene(), tiles: triangles })
    expect(anyOverlap(model.scene.tiles)).toBe(false)
    expect(connectedComponent(model.scene.tiles, triangles[0]!.id).size).toBe(6)
    model.select(triangles[0]!.id)
    const stamp = model.saveSelectionAsStamp(123)!
    expect(stamp.tiles).toHaveLength(6)
    expect(stamp.name).toBe('Stamp 1')
    model.newScene()
    expect(model.scene.tiles).toHaveLength(0)
    expect(model.library.stamps).toHaveLength(1)

    expect(model.placeStamp(stamp.id, { x: 0, y: 0 })).toBe(true)
    expect(model.selectedTiles).toHaveLength(6)
    const before = model.scene.tiles.map((tile) => ({ ...tile }))
    const pivot = model.scene.groups[0]!.origin
    expect(model.rotate(6)).toBe(true)
    const group = model.scene.tiles
    group.forEach((tile, index) => {
      const rotated = rotatePoint(sub(before[index]!, pivot), 90)
      close(tile.x, pivot.x + rotated.x)
      close(tile.y, pivot.y + rotated.y)
      expect(tile.rotation).toBe(before[index]!.rotation + 90)
    })
    expect(anyOverlap(group)).toBe(false)

    const square = model.spawn('square', { x: 3, y: 0 })
    expect(model.rotate(2)).toBe(true)
    const squareNow = model.scene.tiles.find((tile) => tile.id === square.id)!
    let target: { x: number; y: number } | null = null
    for (const receiving of boundaryEdges(group)) {
      for (const moving of polygonEdges(squareNow)) {
        const a = direction(moving)
        const b = direction(receiving)
        if (Math.hypot(a.x + b.x, a.y + b.y) > 1e-7) continue
        const dx = receiving.b.x - moving.a.x
        const dy = receiving.b.y - moving.a.y
        const trial = { ...squareNow, x: squareNow.x + dx, y: squareNow.y + dy }
        if (!validPlacement([trial], group)) continue
        target = { x: trial.x, y: trial.y }
        break
      }
      if (target) break
    }
    expect(target).not.toBeNull()
    const near = { x: target!.x - 0.04, y: target!.y - 0.03 }
    const delta = { x: near.x - squareNow.x, y: near.y - squareNow.y }
    expect(model.move(delta)).toBe(true)
    const snappedSquare = model.scene.tiles.find((tile) => tile.id === square.id)!
    close(snappedSquare.x, target!.x)
    close(snappedSquare.y, target!.y)
    expect(group.reduce((count, tile) => count + contactsBetween(tile, snappedSquare).length, 0)).toBeGreaterThan(0)

    const transforms = model.scene.tiles.map(({ id, x, y, rotation, color }) => ({ id, x, y, rotation, color }))
    model.select(group[0]!.id)
    expect(model.ungroup()).toBe(true)
    expect(model.scene.groups).toHaveLength(0)
    expect(model.scene.tiles.every((tile) => tile.groupId === null)).toBe(true)
    expect(model.scene.tiles.map(({ id, x, y, rotation, color }) => ({ id, x, y, rotation, color }))).toEqual(transforms)
    expect(model.selectedTiles).toHaveLength(1)
    expect(model.undo()).toBe(true)
    expect(model.scene.groups).toHaveLength(1)
    expect(model.redo()).toBe(true)
    expect(model.scene.groups).toHaveLength(0)
  })

  test('renaming and deleting a library stamp does not change placed copies', () => {
    let sequence = 0
    const model = new EditorModel(emptyScene(), () => `id-${++sequence}`)
    model.spawn('square', { x: 0, y: 0 })
    const stamp = model.saveSelectionAsStamp()!
    expect(model.renameStamp(stamp.id, 'House')).toBe(true)
    model.newScene()
    expect(model.placeStamp(stamp.id, { x: 2, y: 2 })).toBe(true)
    expect(model.scene.groups[0]!.name).toBe('House')
    const placed = model.scene.tiles[0]!
    expect(model.deleteStamp(stamp.id)).toBe(true)
    expect(model.library.stamps).toHaveLength(0)
    expect(model.scene.tiles[0]).toEqual(placed)
    expect(model.scene.groups[0]!.stampId).toBe(stamp.id)
  })
})
