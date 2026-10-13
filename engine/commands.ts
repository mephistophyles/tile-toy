import { anyOverlap, boundingBoxCenter, rotatePoint, sub, add } from './geometry'
import { nearestFreePlacement, solveSnap } from './snap'
import { ROTATION_STEP, type Point, type Scene, type Stamp, type Tile } from './types'

export type Command =
  | { type: 'Spawn'; tile: Tile }
  | { type: 'Move'; id: string; dx: number; dy: number; snap?: boolean }
  | { type: 'Rotate'; id: string; steps: number }
  | { type: 'Recolor'; id: string; color: number }
  | { type: 'Duplicate'; id: string; tileIds: string[]; groupId?: string; dx: number; dy: number }
  | { type: 'Delete'; id: string }
  | { type: 'PlaceStamp'; stamp: Stamp; groupId: string; tileIds: string[]; center: Point }
  | { type: 'Ungroup'; groupId: string }

const selection = (scene: Scene, id: string): Tile[] => {
  const tile = scene.tiles.find((item) => item.id === id)
  if (!tile) throw new Error(`Unknown tile: ${id}`)
  return tile.groupId ? scene.tiles.filter((item) => item.groupId === tile.groupId) : [tile]
}

const replaceSelection = (scene: Scene, selected: readonly Tile[], changed: readonly Tile[]): Scene => {
  const replacements = new Map(changed.map((tile) => [tile.id, tile]))
  const next = { ...scene, tiles: scene.tiles.map((tile) => replacements.get(tile.id) ?? tile) }
  if (anyOverlap(next.tiles)) throw new Error('Command would overlap tiles')
  const groupId = selected[0]?.groupId
  if (!groupId) return next
  const before = selected[0]!
  const after = replacements.get(before.id)!
  return { ...next, groups: scene.groups.map((group) => group.id === groupId
    ? { ...group, origin: { ...group.origin,
      x: group.origin.x + after.x - before.x,
      y: group.origin.y + after.y - before.y } } : group) }
}

const move = (scene: Scene, command: Extract<Command, { type: 'Move' }>): Scene => {
  const selected = selection(scene, command.id)
  const ids = new Set(selected.map((tile) => tile.id))
  const rest = scene.tiles.filter((tile) => !ids.has(tile.id))
  let moved = selected.map((tile) => ({ ...tile, x: tile.x + command.dx, y: tile.y + command.dy }))
  if (command.snap) moved = solveSnap(moved, rest)?.tiles ?? moved
  return replaceSelection(scene, selected, moved)
}

const rotate = (scene: Scene, command: Extract<Command, { type: 'Rotate' }>): Scene => {
  if (!Number.isInteger(command.steps)) throw new Error('Rotation must be in 15° steps')
  const selected = selection(scene, command.id)
  const group = scene.groups.find((item) => item.id === selected[0]!.groupId)
  const pivot = group?.origin ?? boundingBoxCenter(selected)
  const degrees = command.steps * ROTATION_STEP
  const rotated = selected.map((tile) => {
    const point = add(pivot, rotatePoint(sub(tile, pivot), degrees))
    return { ...tile, x: point.x, y: point.y, rotation: tile.rotation + degrees }
  })
  const next = replaceSelection(scene, selected, rotated)
  if (!group) return next
  return { ...next, groups: next.groups.map((item) => item.id === group.id ? { ...item, origin: group.origin } : item) }
}

const duplicate = (scene: Scene, command: Extract<Command, { type: 'Duplicate' }>): Scene => {
  const selected = selection(scene, command.id)
  if (selected.length !== command.tileIds.length || new Set(command.tileIds).size !== command.tileIds.length)
    throw new Error('Duplicate requires one unique id per tile')
  if (selected[0]!.groupId && !command.groupId) throw new Error('Duplicate group requires a new group id')
  const copies = selected.map((tile, index) => ({ ...tile, id: command.tileIds[index]!,
    x: tile.x + command.dx, y: tile.y + command.dy, groupId: tile.groupId ? command.groupId! : null }))
  const sourceGroup = scene.groups.find((group) => group.id === selected[0]!.groupId)
  const groups = sourceGroup ? [...scene.groups, { ...sourceGroup, id: command.groupId!,
    origin: { ...sourceGroup.origin, x: sourceGroup.origin.x + command.dx,
      y: sourceGroup.origin.y + command.dy } }] : scene.groups
  return { ...scene, tiles: [...scene.tiles, ...copies], groups }
}

const placeStamp = (scene: Scene, command: Extract<Command, { type: 'PlaceStamp' }>): Scene => {
  if (command.stamp.tiles.length !== command.tileIds.length || !command.tileIds.length)
    throw new Error('PlaceStamp requires one id per stamp tile')
  const base: Tile[] = command.stamp.tiles.map((tile, index) => ({ ...tile,
    id: command.tileIds[index]!, z: 0, groupId: command.groupId }))
  const placed = nearestFreePlacement(base, scene.tiles, command.center)
  const delta = sub(placed[0]!, base[0]!)
  return { ...scene, tiles: [...scene.tiles, ...placed], groups: [...scene.groups, {
    id: command.groupId, stampId: command.stamp.id, name: command.stamp.name,
    origin: { x: delta.x, y: delta.y, z: 0 },
  }] }
}

export const applyCommand = (scene: Scene, command: Command): Scene => {
  let next: Scene
  switch (command.type) {
    case 'Spawn': next = { ...scene, tiles: [...scene.tiles, command.tile] }; break
    case 'Move': next = move(scene, command); break
    case 'Rotate': next = rotate(scene, command); break
    case 'Recolor': {
      const selected = selection(scene, command.id)
      next = replaceSelection(scene, selected, selected.map((tile) => ({ ...tile, color: command.color })))
      break
    }
    case 'Duplicate': next = duplicate(scene, command); break
    case 'Delete': {
      const selected = selection(scene, command.id)
      const ids = new Set(selected.map((tile) => tile.id))
      next = { ...scene, tiles: scene.tiles.filter((tile) => !ids.has(tile.id)),
        groups: scene.groups.filter((group) => group.id !== selected[0]!.groupId) }
      break
    }
    case 'PlaceStamp': next = placeStamp(scene, command); break
    case 'Ungroup': {
      if (!scene.groups.some((group) => group.id === command.groupId)) throw new Error('Unknown group')
      next = { ...scene, tiles: scene.tiles.map((tile) => tile.groupId === command.groupId
        ? { ...tile, groupId: null } : tile),
      groups: scene.groups.filter((group) => group.id !== command.groupId) }
      break
    }
  }
  validateScene(next)
  return next
}

export const validateScene = (scene: Scene): void => {
  const tileIds = scene.tiles.map((tile) => tile.id)
  const groupIds = scene.groups.map((group) => group.id)
  if (tileIds.some((id) => !id) || groupIds.some((id) => !id) ||
      new Set(tileIds).size !== tileIds.length || new Set(groupIds).size !== groupIds.length)
    throw new Error('Duplicate id')
  if (scene.tiles.some((tile) => tile.groupId && !groupIds.includes(tile.groupId)))
    throw new Error('Unknown group reference')
  if (scene.tiles.some((tile) => !Number.isFinite(tile.x) || !Number.isFinite(tile.y) ||
      !Number.isInteger(tile.rotation / ROTATION_STEP) ||
      !Number.isInteger(tile.color) || tile.color < 0 || tile.color > 7 || tile.z !== 0))
    throw new Error('Invalid tile transform or color')
  if (scene.groups.some((group) => !Number.isFinite(group.origin.x) ||
      !Number.isFinite(group.origin.y) || group.origin.z !== 0))
    throw new Error('Invalid group origin')
  if (anyOverlap(scene.tiles)) throw new Error('Command would overlap tiles')
}
