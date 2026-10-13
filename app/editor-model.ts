import { SceneHistory } from '../engine/history'
import { boundingBoxCenter, pointInPolygon, tileVertices } from '../engine/geometry'
import { nearestFreePlacement, solveSnap, validPlacement } from '../engine/snap'
import { emptyScene } from '../engine/serialization'
import { createStamp, emptyStampLibrary } from '../engine/stamps'
import type { Command } from '../engine/commands'
import type { Point, Scene, Shape, Stamp, StampLibrary, Tile } from '../engine/types'

export type DragPreview = { tiles: Tile[]; valid: boolean; snapped: boolean }

export class EditorModel {
  history: SceneHistory
  library: StampLibrary = emptyStampLibrary()
  selectedId: string | null = null
  activeColor = 0

  constructor(scene: Scene = emptyScene(), private readonly newId: () => string = () => crypto.randomUUID()) {
    this.history = new SceneHistory(scene)
  }

  get scene(): Scene { return this.history.scene }
  get selectedTiles(): Tile[] {
    const selected = this.scene.tiles.find((tile) => tile.id === this.selectedId)
    if (!selected) return []
    return selected.groupId
      ? this.scene.tiles.filter((tile) => tile.groupId === selected.groupId) : [selected]
  }

  newScene(): void {
    this.history = new SceneHistory(emptyScene())
    this.selectedId = null
  }

  loadScene(scene: Scene): void {
    this.history = new SceneHistory(scene)
    this.selectedId = null
  }

  setMetadata(metadata: Scene['metadata']): void {
    this.history.setMetadata(metadata)
  }

  saveSelectionAsStamp(now = Date.now()): Stamp | null {
    if (!this.selectedId) return null
    const nextNumber = this.library.stamps.reduce((max, stamp) => {
      const match = /^Stamp (\d+)$/.exec(stamp.name)
      return match ? Math.max(max, Number(match[1])) : max
    }, 0) + 1
    const stamp = createStamp(this.scene, this.selectedId, this.newId(), `Stamp ${nextNumber}`, now)
    this.library = { ...this.library, stamps: [...this.library.stamps, stamp] }
    return stamp
  }

  placeStamp(stampId: string, center: Point): boolean {
    const stamp = this.library.stamps.find((item) => item.id === stampId)
    if (!stamp) return false
    const tileIds = stamp.tiles.map(() => this.newId())
    this.history.execute({ type: 'PlaceStamp', stamp, groupId: this.newId(), tileIds, center })
    this.selectedId = tileIds[0]!
    return true
  }

  renameStamp(stampId: string, name: string): boolean {
    const trimmed = name.trim()
    if (!trimmed || !this.library.stamps.some((stamp) => stamp.id === stampId)) return false
    this.library = { ...this.library, stamps: this.library.stamps.map((stamp) =>
      stamp.id === stampId ? { ...stamp, name: trimmed } : stamp) }
    return true
  }

  deleteStamp(stampId: string): boolean {
    if (!this.library.stamps.some((stamp) => stamp.id === stampId)) return false
    this.library = { ...this.library, stamps: this.library.stamps.filter((stamp) => stamp.id !== stampId) }
    return true
  }

  ungroup(): boolean {
    const groupId = this.selectedTiles[0]?.groupId
    return groupId ? this.tryExecute({ type: 'Ungroup', groupId }) : false
  }

  selectAt(point: Point): string | null {
    const hit = [...this.scene.tiles].reverse().find((tile) => pointInPolygon(point, tileVertices(tile)))
    this.selectedId = hit?.id ?? null
    return this.selectedId
  }

  select(id: string | null): void {
    this.selectedId = id && this.scene.tiles.some((tile) => tile.id === id) ? id : null
  }

  spawn(shape: Shape, center: Point): Tile {
    const initial: Tile = { id: this.newId(), shape, x: 0, y: 0, z: 0,
      rotation: 0, color: this.activeColor, groupId: null }
    const placed = nearestFreePlacement([initial], this.scene.tiles, center)[0]!
    this.history.execute({ type: 'Spawn', tile: placed })
    this.selectedId = placed.id
    return placed
  }

  previewMove(delta: Point): DragPreview | null {
    const selected = this.selectedTiles
    if (!selected.length) return null
    const ids = new Set(selected.map((tile) => tile.id))
    const rest = this.scene.tiles.filter((tile) => !ids.has(tile.id))
    const proposed = selected.map((tile) => ({ ...tile, x: tile.x + delta.x, y: tile.y + delta.y }))
    const snap = solveSnap(proposed, rest)
    const tiles = snap?.tiles ?? proposed
    return { tiles, valid: validPlacement(tiles, rest), snapped: Boolean(snap) }
  }

  move(delta: Point): boolean {
    const preview = this.previewMove(delta)
    if (!preview?.valid || !this.selectedId) return false
    this.history.execute({ type: 'Move', id: this.selectedId, dx: delta.x, dy: delta.y, snap: true })
    return true
  }

  rotate(steps: number): boolean {
    return this.selectedId ? this.tryExecute({ type: 'Rotate', id: this.selectedId, steps }) : false
  }

  recolor(color: number): boolean {
    if (!Number.isInteger(color) || color < 0 || color > 7) throw new Error('Invalid palette index')
    this.activeColor = color
    return this.selectedId ? this.tryExecute({ type: 'Recolor', id: this.selectedId, color }) : false
  }

  duplicate(): boolean {
    const selected = this.selectedTiles
    if (!selected.length || !this.selectedId) return false
    const center = boundingBoxCenter(selected)
    const placed = nearestFreePlacement(selected, this.scene.tiles,
      { x: center.x + 0.35, y: center.y - 0.35 })
    const dx = placed[0]!.x - selected[0]!.x
    const dy = placed[0]!.y - selected[0]!.y
    const tileIds = selected.map(() => this.newId())
    const groupId = selected[0]!.groupId ? this.newId() : undefined
    this.history.execute({ type: 'Duplicate', id: this.selectedId, tileIds,
      ...(groupId ? { groupId } : {}), dx, dy })
    this.selectedId = tileIds[0]!
    return true
  }

  delete(): boolean {
    if (!this.selectedId) return false
    this.history.execute({ type: 'Delete', id: this.selectedId })
    this.selectedId = null
    return true
  }

  undo(): boolean {
    if (!this.history.canUndo) return false
    this.history.undo()
    this.reconcileSelection()
    return true
  }

  redo(): boolean {
    if (!this.history.canRedo) return false
    this.history.redo()
    this.reconcileSelection()
    return true
  }

  private tryExecute(command: Command): boolean {
    try {
      this.history.execute(command)
      return true
    } catch (error) {
      if (error instanceof Error && /overlap/i.test(error.message)) return false
      throw error
    }
  }

  private reconcileSelection(): void {
    if (this.selectedId && !this.scene.tiles.some((tile) => tile.id === this.selectedId))
      this.selectedId = null
  }
}
