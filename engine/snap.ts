import { boundaryEdges, edgeContact } from './adjacency'
import { add, anyOverlap, boundingBoxCenter, dot, length, scale, sub, tileVertices, tilesOverlap } from './geometry'
import { DEFAULT_MIN_CONTACT, type Edge, type Point, type Tile } from './types'

export type SnapOptions = { tolerance?: number; minimumContact?: number }
export type SnapResult = { tiles: Tile[]; displacement: Point; contactLength: number } | null

const placements = (moving: Edge, receiving: Edge): Point[] => {
  const receivingVector = sub(receiving.b, receiving.a)
  const movingVector = sub(moving.b, moving.a)
  const receivingLength = length(receivingVector)
  const movingLength = length(movingVector)
  if (!receivingLength || !movingLength) return []
  const unit = scale(receivingVector, 1 / receivingLength)
  const alignment = Math.abs(movingLength - receivingLength) < 1e-8
    ? [0] : [0, receivingLength - movingLength, (receivingLength - movingLength) / 2]
  return alignment.map((start) => sub(add(receiving.a, scale(unit, start + movingLength)), moving.a))
}

const parallelOpposite = (moving: Edge, receiving: Edge): boolean => {
  const a = sub(moving.b, moving.a)
  const b = sub(receiving.b, receiving.a)
  const product = length(a) * length(b)
  return product > 0 && dot(a, b) / product < -1 + 1e-8
}

const contactLength = (moving: readonly Tile[], receiving: readonly Tile[], minimum: number): number => {
  let total = 0
  for (const a of boundaryEdges(moving, minimum)) {
    for (const b of boundaryEdges(receiving, minimum)) {
      total += edgeContact(a, b, minimum)?.length ?? 0
    }
  }
  return total
}

const bounds = (tiles: readonly Tile[]): { minX: number; minY: number; maxX: number; maxY: number } => {
  const points = tiles.flatMap(tileVertices)
  return { minX: Math.min(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)), maxY: Math.max(...points.map((p) => p.y)) }
}

const receivingNear = (moving: readonly Tile[], receiving: readonly Tile[], tolerance: number): Tile[] => {
  const area = bounds(moving)
  return receiving.filter((tile) => {
    const candidate = bounds([tile])
    return candidate.maxX >= area.minX - tolerance && candidate.minX <= area.maxX + tolerance &&
      candidate.maxY >= area.minY - tolerance && candidate.minY <= area.maxY + tolerance
  })
}

export const solveSnap = (
  moving: readonly Tile[],
  receiving: readonly Tile[],
  options: SnapOptions = {},
): SnapResult => {
  if (!moving.length || !receiving.length) return null
  const tolerance = options.tolerance ?? 0.15
  const minimum = options.minimumContact ?? DEFAULT_MIN_CONTACT
  const nearby = receivingNear(moving, receiving, tolerance)
  if (!nearby.length) return null
  const movingEdges = boundaryEdges(moving, minimum)
  const receivingEdges = boundaryEdges(nearby, minimum)
  let best: SnapResult = null
  for (const a of movingEdges) {
    for (const b of receivingEdges) {
      if (!parallelOpposite(a, b)) continue
      for (const displacement of placements(a, b)) {
        const magnitude = length(displacement)
        if (magnitude > tolerance + 1e-8) continue
        const tiles = moving.map((tile) => ({ ...tile, x: tile.x + displacement.x, y: tile.y + displacement.y }))
        if (!validPlacement(tiles, nearby)) continue
        const total = contactLength(tiles, nearby, minimum)
        if (total < minimum) continue
        if (!best || total > best.contactLength + 1e-8 ||
            (Math.abs(total - best.contactLength) < 1e-8 && magnitude < length(best.displacement) - 1e-8)) {
          best = { tiles, displacement, contactLength: total }
        }
      }
    }
  }
  return best
}

export const validPlacement = (moving: readonly Tile[], receiving: readonly Tile[]): boolean =>
  !anyOverlap(moving) && !moving.some((tile) => receiving.some((other) => tilesOverlap(tile, other)))

export const nearestFreePlacement = (moving: readonly Tile[], receiving: readonly Tile[], center: Point): Tile[] => {
  const target = sub(center, boundingBoxCenter(moving))
  const place = (offset: Point): Tile[] => moving.map((tile) => ({ ...tile, x: tile.x + offset.x, y: tile.y + offset.y }))
  const centered = place(target)
  if (validPlacement(centered, receiving)) return centered
  for (let ring = 1; ring <= 200; ring++) {
    const radius = ring * 0.1
    const steps = Math.max(8, Math.ceil(2 * Math.PI * ring))
    for (let step = 0; step < steps; step++) {
      const angle = 2 * Math.PI * step / steps
      const candidate = place(add(target, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) }))
      if (validPlacement(candidate, receiving)) return candidate
    }
  }
  throw new Error('No free placement found near viewport center')
}
