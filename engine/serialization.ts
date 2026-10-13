import { SCHEMA_VERSION, type Group, type Scene, type Shape, type Stamp, type StampLibrary, type Tile } from './types'

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const string = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback
const number = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
const shape = (value: unknown): value is Shape =>
  value === 'square' || value === 'triangle' || value === 'rightTriangle' || value === 'rectangle'
const rotation = (value: unknown): number => {
  const degrees = number(value)
  return Math.round(degrees / 15) * 15
}
const color = (value: unknown): number => {
  const index = number(value)
  return Number.isInteger(index) && index >= 0 && index <= 7 ? index : 0
}

export const emptyScene = (name = 'Untitled', now = 0): Scene => ({
  schemaVersion: SCHEMA_VERSION,
  metadata: { name, createdAt: now, updatedAt: now },
  tiles: [],
  groups: [],
})

export const parseScene = (json: string): Scene => {
  const root = record(JSON.parse(json) as unknown)
  const metadata = record(root.metadata)
  const tiles: Tile[] = array(root.tiles).flatMap((value) => {
    const item = record(value)
    if (!shape(item.shape) || typeof item.id !== 'string' || !item.id) return []
    return [{
      id: item.id,
      shape: item.shape,
      x: number(item.x), y: number(item.y), z: number(item.z),
      rotation: rotation(item.rotation), color: color(item.color),
      groupId: typeof item.groupId === 'string' ? item.groupId : null,
    }]
  })
  const groups: Group[] = array(root.groups).flatMap((value) => {
    const item = record(value)
    if (typeof item.id !== 'string' || !item.id) return []
    const origin = record(item.origin)
    return [{
      id: item.id,
      stampId: typeof item.stampId === 'string' ? item.stampId : null,
      name: string(item.name),
      origin: { x: number(origin.x), y: number(origin.y), z: number(origin.z) },
    }]
  })
  return {
    schemaVersion: Number.isInteger(root.schemaVersion) ? number(root.schemaVersion) : SCHEMA_VERSION,
    metadata: {
      name: string(metadata.name, 'Untitled'),
      createdAt: number(metadata.createdAt),
      updatedAt: number(metadata.updatedAt),
    },
    tiles,
    groups,
  }
}

export const serializeScene = (scene: Scene): string => JSON.stringify(scene)

export const parseStampLibrary = (json: string): StampLibrary => {
  const root = record(JSON.parse(json) as unknown)
  const stamps: Stamp[] = array(root.stamps).flatMap((value) => {
    const item = record(value)
    if (typeof item.id !== 'string' || !item.id) return []
    const tiles = array(item.tiles).flatMap((tileValue) => {
      const tile = record(tileValue)
      if (!shape(tile.shape)) return []
      return [{ shape: tile.shape, x: number(tile.x), y: number(tile.y),
        rotation: rotation(tile.rotation), color: color(tile.color) }]
    })
    return [{ id: item.id, name: string(item.name), createdAt: number(item.createdAt), tiles }]
  })
  return { schemaVersion: Number.isInteger(root.schemaVersion) ? number(root.schemaVersion) : SCHEMA_VERSION, stamps }
}

export const serializeStampLibrary = (library: StampLibrary): string => JSON.stringify(library)
