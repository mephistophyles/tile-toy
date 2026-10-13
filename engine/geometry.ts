import { EPSILON, type Edge, type Point, type Shape, type Tile } from './types'

const h = Math.sqrt(3) / 2
export const VERTICES: Record<Shape, readonly Point[]> = {
  square: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  triangle: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: h }],
  rightTriangle: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
  rectangle: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 0.5 }],
}

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Point, n: number): Point => ({ x: a.x * n, y: a.y * n })
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x
export const length = (a: Point): number => Math.hypot(a.x, a.y)
export const distance = (a: Point, b: Point): number => length(sub(a, b))
export const rotatePoint = (p: Point, degrees: number): Point => {
  const radians = degrees * Math.PI / 180
  const c = Math.cos(radians)
  const s = Math.sin(radians)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

export const tileVertices = (tile: Tile): Point[] => VERTICES[tile.shape].map((v) =>
  add(rotatePoint(v, tile.rotation), tile))

export const polygonEdges = (tile: Tile): Edge[] => {
  const vertices = tileVertices(tile)
  return vertices.map((a, index) => ({ tileId: tile.id, index, a, b: vertices[(index + 1) % vertices.length]! }))
}

// SAT treats a shared boundary as legal and a positive-area intersection as overlap.
export const polygonsOverlap = (a: readonly Point[], b: readonly Point[]): boolean => {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const edge = sub(polygon[(i + 1) % polygon.length]!, polygon[i]!)
      const normal = { x: -edge.y, y: edge.x }
      const projectedA = a.map((p) => dot(p, normal))
      const projectedB = b.map((p) => dot(p, normal))
      if (Math.max(...projectedA) <= Math.min(...projectedB) + EPSILON ||
          Math.max(...projectedB) <= Math.min(...projectedA) + EPSILON) return false
    }
  }
  return true
}

export const tilesOverlap = (a: Tile, b: Tile): boolean =>
  polygonsOverlap(tileVertices(a), tileVertices(b))

export const pointInPolygon = (point: Point, vertices: readonly Point[]): boolean => {
  let sign = 0
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]!
    const b = vertices[(i + 1) % vertices.length]!
    const side = cross(sub(b, a), sub(point, a))
    if (Math.abs(side) <= EPSILON) continue
    const current = Math.sign(side)
    if (sign && current !== sign) return false
    sign = current
  }
  return true
}

export const anyOverlap = (tiles: readonly Tile[]): boolean => {
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tilesOverlap(tiles[i]!, tiles[j]!)) return true
    }
  }
  return false
}

export const boundingBoxCenter = (tiles: readonly Tile[]): Point => {
  const points = tiles.flatMap(tileVertices)
  if (!points.length) return { x: 0, y: 0 }
  return {
    x: (Math.min(...points.map((p) => p.x)) + Math.max(...points.map((p) => p.x))) / 2,
    y: (Math.min(...points.map((p) => p.y)) + Math.max(...points.map((p) => p.y))) / 2,
  }
}
