import * as THREE from 'three'
import { VERTICES } from '../engine/geometry'
import type { Shape, Tile } from '../engine/types'

export const PALETTE = [
  '#E53935', '#FB8C00', '#FDD835', '#43A047',
  '#1E88E5', '#8E24AA', '#EC407A', '#FAFAFA',
] as const
export const SHAPES: Shape[] = ['square', 'triangle', 'rightTriangle', 'rectangle']

export const fillGeometry = (shape: Shape): THREE.ShapeGeometry => {
  const vertices = VERTICES[shape]
  const path = new THREE.Shape()
  path.moveTo(vertices[0]!.x, vertices[0]!.y)
  for (const vertex of vertices.slice(1)) path.lineTo(vertex.x, vertex.y)
  path.closePath()
  return new THREE.ShapeGeometry(path)
}

const outlinePositions = (shape: Shape): Float32Array => {
  const vertices = VERTICES[shape]
  const positions: number[] = []
  vertices.forEach((a, index) => {
    const b = vertices[(index + 1) % vertices.length]!
    positions.push(a.x, a.y, 0, b.x, b.y, 0)
  })
  return new Float32Array(positions)
}

export const outlineMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    attribute vec2 instanceOffset;
    attribute vec2 instanceRotation;
    attribute vec3 instanceColor;
    varying vec3 vColor;
    void main() {
      vec2 p = vec2(
        position.x * instanceRotation.x - position.y * instanceRotation.y,
        position.x * instanceRotation.y + position.y * instanceRotation.x
      ) + instanceOffset;
      vColor = instanceColor;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.025, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    void main() { gl_FragColor = vec4(vColor, 1.0); }
  `,
  depthTest: true,
  depthWrite: false,
})

export const outlineGeometry = (shape: Shape, tiles: readonly Tile[]): THREE.InstancedBufferGeometry => {
  const geometry = new THREE.InstancedBufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(outlinePositions(shape), 3))
  const offsets = new Float32Array(tiles.length * 2)
  const rotations = new Float32Array(tiles.length * 2)
  const colors = new Float32Array(tiles.length * 3)
  tiles.forEach((tile, index) => {
    const angle = tile.rotation * Math.PI / 180
    const color = new THREE.Color(PALETTE[tile.color] ?? PALETTE[0]).multiplyScalar(0.46)
    offsets.set([tile.x, tile.y], index * 2)
    rotations.set([Math.cos(angle), Math.sin(angle)], index * 2)
    colors.set([color.r, color.g, color.b], index * 3)
  })
  geometry.setAttribute('instanceOffset', new THREE.InstancedBufferAttribute(offsets, 2))
  geometry.setAttribute('instanceRotation', new THREE.InstancedBufferAttribute(rotations, 2))
  geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3))
  geometry.instanceCount = tiles.length
  return geometry
}
