import { connectedComponent } from './adjacency'
import { boundingBoxCenter } from './geometry'
import { SCHEMA_VERSION, type Scene, type Stamp, type StampLibrary } from './types'

export const createStamp = (scene: Scene, tileId: string, id: string, name: string, now: number): Stamp => {
  const ids = connectedComponent(scene.tiles, tileId)
  if (!ids.size) throw new Error(`Unknown tile: ${tileId}`)
  const tiles = scene.tiles.filter((tile) => ids.has(tile.id))
  const origin = boundingBoxCenter(tiles)
  return {
    id, name, createdAt: now,
    tiles: tiles.map((tile) => ({ shape: tile.shape, x: tile.x - origin.x,
      y: tile.y - origin.y, rotation: tile.rotation, color: tile.color })),
  }
}

export const emptyStampLibrary = (): StampLibrary => ({ schemaVersion: SCHEMA_VERSION, stamps: [] })
