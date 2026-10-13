import { tileVertices } from '../engine/geometry'
import type { Stamp, Tile } from '../engine/types'
import { PALETTE } from './renderer'

const SVG_NS = 'http://www.w3.org/2000/svg'

export const stampThumbnail = (stamp: Stamp): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'stamp-thumbnail')
  const polygons = stamp.tiles.map((part, index) => {
    const tile: Tile = { ...part, id: String(index), z: 0, groupId: null }
    return { points: tileVertices(tile), color: PALETTE[part.color]! }
  })
  const points = polygons.flatMap((polygon) => polygon.points)
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const padding = Math.max(maxX - minX, maxY - minY) * 0.12 + 0.05
  svg.setAttribute('viewBox', `${minX - padding} ${-maxY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`)
  for (const polygon of polygons) {
    const element = document.createElementNS(SVG_NS, 'polygon')
    element.setAttribute('points', polygon.points.map((point) => `${point.x},${-point.y}`).join(' '))
    element.setAttribute('fill', polygon.color)
    element.setAttribute('stroke', '#304959')
    element.setAttribute('stroke-width', '0.025')
    element.setAttribute('stroke-linejoin', 'round')
    svg.append(element)
  }
  return svg
}
