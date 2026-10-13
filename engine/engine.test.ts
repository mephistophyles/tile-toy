import { describe, expect, test } from 'vitest'
import {
  adjacencyGraph, anyOverlap, applyCommand, boundaryEdges, connectedComponent, contactsBetween,
  createStamp, edgeContact, emptyScene, emptyStampLibrary, nearestFreePlacement, parseScene,
  parseStampLibrary, polygonEdges, rotatePoint, SceneHistory, serializeScene, serializeStampLibrary,
  solveSnap, tileVertices, tilesOverlap, validateScene,
  type Edge, type Point, type Shape, type Tile,
} from './index'

const tile = (id: string, shape: Shape, x = 0, y = 0, rotation = 0): Tile =>
  ({ id, shape, x, y, z: 0, rotation, color: 0, groupId: null })
const near = (actual: number, expected: number): void => expect(actual).toBeCloseTo(expected, 7)
const snapped = (moving: Tile, receiving: Tile[], tolerance = 0.15): Tile => {
  const result = solveSnap([moving], receiving, { tolerance })
  expect(result).not.toBeNull()
  return result!.tiles[0]!
}

describe('Appendix A: edge snapping', () => {
  test('equal-length flush: square edge ↔ square edge', () => {
    const result = snapped(tile('m', 'square', 0.04, -1.06), [tile('r', 'square')])
    near(result.x, 0); near(result.y, -1)
  })

  test('equal-length flush: triangle ↔ triangle', () => {
    const result = snapped(tile('m', 'triangle', 1.06, -0.04, 180), [tile('r', 'triangle')])
    near(result.x, 1); near(result.y, 0)
  })

  test('equal-length flush: right-triangle hypotenuse ↔ hypotenuse', () => {
    const result = snapped(tile('m', 'rightTriangle', 1.06, 1.04, 180), [tile('r', 'rightTriangle')])
    near(result.x, 1); near(result.y, 1)
    near(contactsBetween(result, tile('r', 'rightTriangle'))[0]!.length, Math.SQRT2)
  })

  test('short-on-long: rectangle short edge flush with both square endpoints', () => {
    for (const x of [0.5, 1]) {
      const result = snapped(tile('m', 'rectangle', x + 0.04, -1.04, 90), [tile('r', 'square')])
      near(result.x, x); near(result.y, -1)
    }
  })

  test('short-on-long: rectangle centered on square edge', () => {
    const result = snapped(tile('m', 'rectangle', 0.77, -1.03, 90), [tile('r', 'square')])
    near(result.x, 0.75); near(result.y, -1)
  })

  test('long-on-short: square onto rectangle short edge, both end alignments and midpoint', () => {
    for (const y of [-0.5, -0.25, 0]) {
      const result = snapped(tile('m', 'square', 1.04, y + 0.02), [tile('r', 'rectangle')])
      near(result.x, 1); near(result.y, y)
    }
  })

  test('unit edge onto √2 hypotenuse: end and midpoint, with legal overhang', () => {
    const receiver = tile('r', 'rightTriangle')
    const moving = tile('m', 'square', 0, 0, 45)
    const movingEdge = polygonEdges(moving)[3]!
    const receivingEdge = polygonEdges(receiver)[1]!
    const direction = { x: -1 / Math.SQRT2, y: 1 / Math.SQRT2 }
    for (const offset of [0, (Math.SQRT2 - 1) / 2, Math.SQRT2 - 1]) {
      const target = { x: receivingEdge.a.x + direction.x * (offset + 1),
        y: receivingEdge.a.y + direction.y * (offset + 1) }
      const result = snapped(tile('m', 'square', target.x - movingEdge.a.x + 0.03,
        target.y - movingEdge.a.y - 0.02, 45), [receiver])
      near(result.x, target.x - movingEdge.a.x)
      near(result.y, target.y - movingEdge.a.y)
      expect(contactsBetween(result, receiver).length).toBeGreaterThan(0)
    }
  })

  test('corner contact chooses maximum total contact length', () => {
    const receiving = [tile('a', 'square'), tile('b', 'square', 1, -1)]
    const result = solveSnap([tile('m', 'square', 1.06, 0.04)], receiving)
    expect(result).not.toBeNull()
    near(result!.tiles[0]!.x, 1); near(result!.tiles[0]!.y, 0)
    near(result!.contactLength, 2)
  })

  test('proximity tiebreak picks center or flush from pointer position', () => {
    const receiver = [tile('r', 'square')]
    near(snapped(tile('m', 'rectangle', 0.78, -1.01, 90), receiver).x, 0.75)
    near(snapped(tile('m', 'rectangle', 0.51, -1.01, 90), receiver).x, 0.5)
  })

  test('snap tolerance accepts inside and rejects outside', () => {
    expect(solveSnap([tile('m', 'square', 0, -1.14)], [tile('r', 'square')])).not.toBeNull()
    expect(solveSnap([tile('m', 'square', 0, -1.16)], [tile('r', 'square')])).toBeNull()
  })

  test('collinearity rejects a near-miss angle', () => {
    const a = polygonEdges(tile('a', 'square'))[0]!
    const b: Edge = { tileId: 'b', index: 0, a: { x: 1, y: 0 },
      b: rotatePoint({ x: 0, y: 1 }, 1) }
    expect(edgeContact(a, b)).toBeNull()
    expect(solveSnap([tile('m', 'square', 0, -1.02, 1)], [tile('r', 'square')])).toBeNull()
  })

  test('minimum contact rejects point-only contact', () => {
    const a: Edge = { tileId: 'a', index: 0, a: { x: 0, y: 0 }, b: { x: 1, y: 0 } }
    const b: Edge = { tileId: 'b', index: 0, a: { x: 2, y: 0 }, b: { x: 1, y: 0 } }
    expect(edgeContact(a, b)).toBeNull()
  })

  test('overlap with a third tile rejects an otherwise valid snap', () => {
    const receiving = [tile('a', 'square'), tile('b', 'square', 0, -1)]
    expect(solveSnap([tile('m', 'square', 0.02, -1.04)], receiving, { tolerance: 0.06 })).toBeNull()
    expect(tilesOverlap(tile('a', 'square'), tile('b', 'square', 0, -1))).toBe(false)
  })

  test('T-junction is legal and recorded in adjacency', () => {
    const square = tile('a', 'square')
    const rectangle = tile('b', 'rectangle', 0.75, -1, 90)
    expect(tilesOverlap(square, rectangle)).toBe(false)
    const contacts = contactsBetween(square, rectangle)
    expect(contacts).toHaveLength(1)
    near(contacts[0]!.length, 0.5)
    near(contacts[0]!.a.x, 0.25)
    expect(adjacencyGraph([square, rectangle]).get('a')?.has('b')).toBe(true)
  })

  test('centered mismatch allows overhang', () => {
    const a = tile('a', 'rectangle')
    const b = tile('b', 'square', 1, -0.25)
    expect(tilesOverlap(a, b)).toBe(false)
    near(contactsBetween(a, b)[0]!.length, 0.5)
  })

  test('√2 hypotenuse centered on unit edge overhangs at both ends', () => {
    const receiver = tile('r', 'square', 0, 0, 45)
    const offset = (1 + Math.SQRT2) / (2 * Math.SQRT2)
    const result = snapped(tile('m', 'rightTriangle', offset + 0.03, offset - 1 - 0.02, 90), [receiver])
    near(result.x, offset); near(result.y, offset - 1)
    near(contactsBetween(result, receiver)[0]!.length, 1)
    expect(tilesOverlap(result, receiver)).toBe(false)
  })

  test('solver outputs retain 15° rotation grid', () => {
    const result = snapped(tile('m', 'triangle', 1.03, 0, 180), [tile('r', 'triangle')])
    expect(result.rotation % 15).toBe(0)
  })

  test('adjacency is symmetric', () => {
    const graph = adjacencyGraph([tile('a', 'square'), tile('b', 'square', 1, 0)])
    expect(graph.get('a')?.has('b')).toBe(true)
    expect(graph.get('b')?.has('a')).toBe(true)
  })

  test('component-fill returns one of two disconnected assemblies', () => {
    const tiles = [tile('a', 'square'), tile('b', 'square', 1, 0),
      tile('c', 'triangle', 10, 0), tile('d', 'triangle', 11, 0, 180)]
    expect([...connectedComponent(tiles, 'a')].sort()).toEqual(['a', 'b'])
    expect(connectedComponent(tiles, 'missing').size).toBe(0)
  })

  test('shared group edges are hidden while T-junction remainder stays exposed', () => {
    expect(boundaryEdges([tile('a', 'square'), tile('b', 'square', 1, 0)])).toHaveLength(6)
    const edges = boundaryEdges([tile('a', 'square'), tile('b', 'rectangle', 0.75, -1, 90)])
    const bottomFragments = edges.filter((edge) => edge.tileId === 'a' &&
      Math.abs(edge.a.y) < 1e-8 && Math.abs(edge.b.y) < 1e-8)
    expect(bottomFragments).toHaveLength(2)
  })
})

describe('engine documents and commands', () => {
  test('scene and library serialization round-trip, with tolerant defaults', () => {
    let scene = emptyScene('Castle', 123)
    scene = applyCommand(scene, { type: 'Spawn', tile: tile('a', 'square') })
    scene = applyCommand(scene, { type: 'Spawn', tile: tile('b', 'triangle', 1, 0) })
    const stamp = createStamp(scene, 'a', 's1', 'Stamp 1', 456)
    expect(stamp.tiles).toHaveLength(1)
    expect(stamp.tiles[0]!.x).toBeCloseTo(-0.5)
    const library = { ...emptyStampLibrary(), stamps: [stamp] }
    expect(parseScene(serializeScene(scene))).toEqual(scene)
    expect(parseStampLibrary(serializeStampLibrary(library))).toEqual(library)
    expect(parseScene(JSON.stringify({ tiles: [{ id: 'x', shape: 'square', extra: true }], unknown: 1 }))
      .tiles[0]).toMatchObject({ x: 0, y: 0, z: 0, rotation: 0, color: 0, groupId: null })
  })

  test('place stamp embeds tiles, rotates rigidly, ungroups, and history undoes composites', () => {
    const stamp = { id: 's1', name: 'Pair', createdAt: 0,
      tiles: [{ shape: 'square' as const, x: -1, y: 0, rotation: 0, color: 2 },
        { shape: 'square' as const, x: 0, y: 0, rotation: 0, color: 2 }] }
    const history = new SceneHistory(emptyScene())
    history.execute({ type: 'PlaceStamp', stamp, groupId: 'g1', tileIds: ['a', 'b'], center: { x: 0, y: 0 } })
    const placed = history.scene
    expect(placed.tiles.map((t) => t.groupId)).toEqual(['g1', 'g1'])
    history.execute({ type: 'Rotate', id: 'a', steps: 6 })
    expect(history.scene.tiles.every((t) => t.rotation === 90)).toBe(true)
    expect(parseScene(serializeScene(history.scene))).toEqual(history.scene)
    history.execute({ type: 'Ungroup', groupId: 'g1' })
    expect(history.scene.tiles.every((t) => t.groupId === null)).toBe(true)
    history.undo()
    expect(history.scene.groups).toHaveLength(1)
    history.undo()
    expect(history.scene).toEqual(placed)
    history.redo()
    expect(history.scene.tiles[0]!.rotation).toBe(90)
  })

  test('group commands affect every member and composite undo restores them together', () => {
    const stamp = { id: 's1', name: 'Pair', createdAt: 0,
      tiles: [{ shape: 'square' as const, x: -1, y: 0, rotation: 0, color: 2 },
        { shape: 'square' as const, x: 0, y: 0, rotation: 0, color: 2 }] }
    const history = new SceneHistory(emptyScene())
    history.execute({ type: 'PlaceStamp', stamp, groupId: 'g1', tileIds: ['a', 'b'], center: { x: 0, y: 0 } })
    history.execute({ type: 'Recolor', id: 'b', color: 5 })
    expect(history.scene.tiles.map((item) => item.color)).toEqual([5, 5])
    history.execute({ type: 'Move', id: 'b', dx: 3, dy: 0 })
    near(history.scene.groups[0]!.origin.x, 3)
    history.execute({ type: 'Duplicate', id: 'a', groupId: 'g2', tileIds: ['c', 'd'], dx: 0, dy: 3 })
    expect(history.scene.groups).toHaveLength(2)
    expect(history.scene.tiles.filter((item) => item.groupId === 'g2')).toHaveLength(2)
    history.execute({ type: 'Delete', id: 'c' })
    expect(history.scene.tiles).toHaveLength(2)
    history.undo()
    expect(history.scene.tiles).toHaveLength(4)
    expect(history.scene.groups).toHaveLength(2)
    history.undo()
    expect(history.scene.groups).toHaveLength(1)
  })

  test('rejected commands leave history unchanged', () => {
    const history = new SceneHistory(emptyScene())
    history.execute({ type: 'Spawn', tile: tile('a', 'square') })
    expect(() => history.execute({ type: 'Spawn', tile: tile('b', 'square') })).toThrow(/overlap/i)
    expect(history.scene.tiles.map((item) => item.id)).toEqual(['a'])
    history.undo()
    expect(history.scene.tiles).toHaveLength(0)
  })

  test('accepted command sequences preserve no-overlap invariant and round-trip', () => {
    const history = new SceneHistory(emptyScene(), 100)
    let seed = 77531
    const random = (): number => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
    let nextId = 0
    for (let step = 0; step < 350; step++) {
      const current = history.scene
      const chosen = current.tiles[Math.floor(random() * current.tiles.length)]
      const action = Math.floor(random() * 6)
      try {
        if (!chosen || action === 0) {
          history.execute({ type: 'Spawn', tile: tile(`t${nextId++}`, 'square',
            Math.floor(random() * 8) * 1.5, Math.floor(random() * 8) * 1.5) })
        } else if (action === 1) {
          history.execute({ type: 'Move', id: chosen.id, dx: (random() - 0.5) * 2,
            dy: (random() - 0.5) * 2, snap: true })
        } else if (action === 2) {
          history.execute({ type: 'Rotate', id: chosen.id, steps: random() < 0.5 ? 1 : -1 })
        } else if (action === 3) {
          history.execute({ type: 'Recolor', id: chosen.id, color: Math.floor(random() * 8) })
        } else if (action === 4) {
          history.execute({ type: 'Duplicate', id: chosen.id, tileIds: [`t${nextId++}`],
            dx: (random() - 0.5) * 4, dy: (random() - 0.5) * 4 })
        } else {
          history.execute({ type: 'Delete', id: chosen.id })
        }
      } catch (error) {
        expect((error as Error).message).toMatch(/overlap/i)
      }
      validateScene(history.scene)
      expect(anyOverlap(history.scene.tiles)).toBe(false)
      expect(parseScene(serializeScene(history.scene))).toEqual(history.scene)
    }
  })

  test('spawn helper finds a free place around an occupied center', () => {
    const placed = nearestFreePlacement([tile('new', 'square')], [tile('old', 'square')], { x: 0.5, y: 0.5 })
    expect(tilesOverlap(placed[0]!, tile('old', 'square'))).toBe(false)
    expect(tileVertices(placed[0]!)).toHaveLength(4)
    expect(boundaryEdges([placed[0]!])).toHaveLength(4)
  })
})
