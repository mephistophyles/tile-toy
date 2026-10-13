export type Shape = 'square' | 'triangle' | 'rightTriangle' | 'rectangle'
export type Point = { x: number; y: number }
export type Position = Point & { z: number }

export type Tile = Position & {
  id: string
  shape: Shape
  rotation: number
  color: number
  groupId: string | null
}

export type Group = {
  id: string
  stampId: string | null
  name: string
  origin: Position
}

export type Scene = {
  schemaVersion: number
  metadata: { name: string; createdAt: number; updatedAt: number }
  tiles: Tile[]
  groups: Group[]
}

export type StampTile = Point & { shape: Shape; rotation: number; color: number }
export type Stamp = { id: string; name: string; createdAt: number; tiles: StampTile[] }
export type StampLibrary = { schemaVersion: number; stamps: Stamp[] }

export type Edge = { tileId: string; index: number; a: Point; b: Point }
export type Contact = { firstId: string; secondId: string; a: Point; b: Point; length: number }

export const SCHEMA_VERSION = 1
export const ROTATION_STEP = 15
export const DEFAULT_MIN_CONTACT = 0.075
export const EPSILON = 1e-8
