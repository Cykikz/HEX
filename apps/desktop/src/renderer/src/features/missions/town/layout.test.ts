import { describe, expect, it } from 'vitest'

import {
  COMMONS, DISTRICTS, PLAYER_SPAWN, TILE, cell, center, destination, findTownRoute, isWater, walkable,
  type District
} from './layout'

describe('HEX Town navigation', () => {
  it('connects every commons starting point to all planned work positions', () => {
    for (const district of Object.keys(DISTRICTS) as District[]) {
      for (let slot = 0; slot < 10; slot++) {
        const goal = destination(district, slot)
        for (const start of COMMONS) {
          const route = findTownRoute(start, goal)
          expect(route.at(-1)).toEqual(center(goal))
          let previous = center(start)
          for (const point of route) {
            const next = cell(point.x, point.y)
            expect(walkable(next.x, next.y)).toBe(true)
            expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(TILE)
            previous = point
          }
        }
      }
    }
  })

  it('blocks houses and river cells except for the town bridge', () => {
    expect(walkable(4, 2)).toBe(false)
    expect(walkable(17, 10)).toBe(false)
    expect(isWater(0, 21)).toBe(true)
    expect(walkable(0, 21)).toBe(false)
    expect(isWater(18, 21)).toBe(true)
    expect(walkable(18, 21)).toBe(true)
    const route = findTownRoute(PLAYER_SPAWN, { x: 18, y: 22 })
    expect(route).toContainEqual(center({ x: 18, y: 21 }))
  })
})
