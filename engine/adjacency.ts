import { add, cross, dot, length, polygonEdges, scale, sub } from './geometry'
import { DEFAULT_MIN_CONTACT, EPSILON, type Contact, type Edge, type Point, type Tile } from './types'

const edgeDirection = (edge: Edge): Point => sub(edge.b, edge.a)

export const edgeContact = (first: Edge, second: Edge, minimum = DEFAULT_MIN_CONTACT): Contact | null => {
  const v = edgeDirection(first)
  const w = edgeDirection(second)
  const firstLength = length(v)
  const secondLength = length(w)
  if (firstLength < EPSILON || secondLength < EPSILON) return null
  if (Math.abs(cross(v, w)) > EPSILON * firstLength * secondLength) return null
  if (dot(v, w) >= 0) return null // CCW polygon interiors must lie on opposite sides.
  if (Math.abs(cross(v, sub(second.a, first.a))) > EPSILON * firstLength) return null
  const unit = scale(v, 1 / firstLength)
  const start = Math.max(0, Math.min(dot(sub(second.a, first.a), unit), dot(sub(second.b, first.a), unit)))
  const end = Math.min(firstLength, Math.max(dot(sub(second.a, first.a), unit), dot(sub(second.b, first.a), unit)))
  if (end - start + EPSILON < minimum) return null
  return {
    firstId: first.tileId,
    secondId: second.tileId,
    a: add(first.a, scale(unit, start)),
    b: add(first.a, scale(unit, end)),
    length: end - start,
  }
}

export const contactsBetween = (first: Tile, second: Tile, minimum = DEFAULT_MIN_CONTACT): Contact[] => {
  const contacts: Contact[] = []
  for (const a of polygonEdges(first)) {
    for (const b of polygonEdges(second)) {
      const contact = edgeContact(a, b, minimum)
      if (contact) contacts.push(contact)
    }
  }
  return contacts
}

export const adjacencyGraph = (tiles: readonly Tile[], minimum = DEFAULT_MIN_CONTACT): Map<string, Set<string>> => {
  const graph = new Map(tiles.map((tile) => [tile.id, new Set<string>()]))
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      const a = tiles[i]!
      const b = tiles[j]!
      if (!contactsBetween(a, b, minimum).length) continue
      graph.get(a.id)!.add(b.id)
      graph.get(b.id)!.add(a.id)
    }
  }
  return graph
}

export const connectedComponent = (tiles: readonly Tile[], tileId: string, minimum = DEFAULT_MIN_CONTACT): Set<string> => {
  const graph = adjacencyGraph(tiles, minimum)
  if (!graph.has(tileId)) return new Set()
  const visited = new Set([tileId])
  const pending = [tileId]
  while (pending.length) {
    for (const neighbor of graph.get(pending.pop()!)!) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      pending.push(neighbor)
    }
  }
  return visited
}

// Cut internal contact intervals out of each edge, retaining partial T-junction boundaries.
export const boundaryEdges = (tiles: readonly Tile[], minimum = DEFAULT_MIN_CONTACT): Edge[] => {
  const output: Edge[] = []
  const edges = tiles.flatMap(polygonEdges)
  for (const edge of edges) {
    const v = edgeDirection(edge)
    const total = length(v)
    const unit = scale(v, 1 / total)
    const intervals: [number, number][] = []
    for (const other of edges) {
      if (edge.tileId === other.tileId) continue
      const contact = edgeContact(edge, other, minimum)
      if (!contact) continue
      intervals.push([dot(sub(contact.a, edge.a), unit), dot(sub(contact.b, edge.a), unit)])
    }
    intervals.sort((a, b) => a[0] - b[0])
    let cursor = 0
    for (const [start, end] of intervals) {
      if (start - cursor >= minimum) output.push(segment(edge, unit, cursor, start))
      cursor = Math.max(cursor, end)
    }
    if (total - cursor >= minimum) output.push(segment(edge, unit, cursor, total))
  }
  return output
}

const segment = (edge: Edge, unit: Point, start: number, end: number): Edge => ({
  ...edge,
  a: add(edge.a, scale(unit, start)),
  b: add(edge.a, scale(unit, end)),
})
