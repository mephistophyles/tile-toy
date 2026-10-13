import { emptyScene } from '../engine/serialization'
import type { Scene, Shape, Tile } from '../engine/types'

const shapes: Shape[] = ['square', 'triangle', 'rightTriangle', 'rectangle']

export const scriptedScene = (stress = false): Scene => {
  const scene = emptyScene(stress ? 'Five Hundred Tiles' : 'Shape Study')
  const columns = stress ? 25 : 9
  const rows = stress ? 20 : 6
  const gap = stress ? 1.35 : 1.45
  const tiles: Tile[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if (!stress && (row + column) % 11 === 0) continue
      tiles.push({
        id: `tile-${row}-${column}`,
        shape: shapes[(column + row * 2) % shapes.length]!,
        x: (column - (columns - 1) / 2) * gap,
        y: ((rows - 1) / 2 - row) * gap,
        z: 0,
        rotation: 0,
        color: (column + row * 3) % 8,
        groupId: null,
      })
    }
  }
  return { ...scene, tiles }
}
