import { describe, expect, it } from 'vitest'
import { distanceOf, dragPosition, sectionAt, sectionPlane, shotRatio, snapOnTriangle, type Screen } from './math'

const tri: [Screen, Screen, Screen] = [[0, 0], [100, 0], [0, 100]]

describe('snapOnTriangle', () => {
  it('takes the nearest corner within the vertex radius', () => {
    expect(snapOnTriangle([4, 3], tri)).toEqual({ snap: 'vertex', corner: 0 })
    expect(snapOnTriangle([95, 2], tri)).toEqual({ snap: 'vertex', corner: 1 })
  })
  it('falls back to the nearest edge, then to the surface', () => {
    const edge = snapOnTriangle([50, 4], tri)
    expect(edge).toMatchObject({ snap: 'edge', from: 0, to: 1 })
    if (edge.snap === 'edge') expect(edge.t).toBeCloseTo(0.5)
    expect(snapOnTriangle([30, 30], tri)).toEqual({ snap: 'surface' })
  })
  it('uses the given radii (a finger gets more)', () => {
    expect(snapOnTriangle([14, 0], tri).snap).toBe('edge')
    expect(snapOnTriangle([14, 0], tri, 16, 8)).toEqual({ snap: 'vertex', corner: 0 })
  })
})

describe('section', () => {
  const range = { min: -50, max: 150 }
  it('maps 0–1 onto the range and clamps', () => {
    expect(sectionAt(range, 0)).toBe(-50)
    expect(sectionAt(range, 0.5)).toBe(50)
    expect(sectionAt(range, 2)).toBe(150)
  })
  it('cuts away the side above the plane unless flipped', () => {
    const keepLow = sectionPlane({ axis: 'x', position: 0.5, flipped: false }, range)
    const distance = (p: number, plane: { normal: readonly number[]; constant: number }) => plane.normal[0]! * p + plane.constant
    expect(distance(0, keepLow)).toBeGreaterThan(0)
    expect(distance(100, keepLow)).toBeLessThan(0)
    const keepHigh = sectionPlane({ axis: 'x', position: 0.5, flipped: true }, range)
    expect(distance(0, keepHigh)).toBeLessThan(0)
    expect(distance(100, keepHigh)).toBeGreaterThan(0)
    expect(sectionPlane({ axis: 'z', position: 0, flipped: false }, range).normal).toEqual([0, 0, -1])
  })
  it('drags along the axis as drawn on screen', () => {
    // One model unit = 2 px to the right: 40 px right is 20 units = 0.1 of a 200-unit range.
    expect(dragPosition(0.5, range, [40, 0], [2, 0])).toBeCloseTo(0.6)
    expect(dragPosition(0.5, range, [0, 40], [2, 0])).toBeCloseTo(0.5)
    expect(dragPosition(0.95, range, [400, 0], [2, 0])).toBe(1)
    // End-on axis: no movement.
    expect(dragPosition(0.5, range, [40, 0], [0, 0])).toBe(0.5)
  })
})

describe('shotRatio', () => {
  it('doubles the screen ratio within the GPU limit', () => {
    expect(shotRatio(800, 600, 1, 2)).toBe(2)
    expect(shotRatio(800, 600, 2, 1)).toBe(2)
    expect(shotRatio(1600, 900, 2, 2)).toBeCloseTo(4096 / 1600)
  })
})

it('distanceOf', () => {
  expect(distanceOf([0, 0, 0], [3, 4, 12])).toBe(13)
})
