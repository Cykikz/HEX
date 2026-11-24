import { describe, expect, it } from 'vitest'

import {
  COMMONS, DISTRICTS, PLAYER_SPAWN, TILE, canStand, cell, center, destination, findTownRoute, isWater, roomAt, walkable,
  type District
} from './layout'

describe('HEX Town navigation', () => {
  it('connects the commons to workstations inside each room without crossing furniture', () => {
    for (const district of Object.keys(DISTRICTS) as District[]) {
      for (let slot = 0; slot < 10; slot++) {
        const goal = destination(district, slot)
        const seat = center(goal)
        expect(roomAt(seat.x, seat.y)).toBe(district)
        for (const start of COMMONS) {
          const route = findTownRoute(start, goal)
          expect(route.at(-1)).toEqual(center(goal))
          let previous = center(start)
          for (const point of route) {
            const next = cell(point.x, point.y)
            expect(walkable(next.x, next.y)).toBe(true)
            expect(Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)).toBe(TILE)
            expect(canStand((point.x + previous.x) / 2, (point.y + previous.y) / 2)).toBe(true)
            previous = point
          }
        }
      }
    }
  })

  it('lets the player cross each doorway while blocking wall and furniture footprints', () => {
    for (const site of Object.values(DISTRICTS)) {
      const door = center(site.door)
      expect(canStand(door.x, door.y)).toBe(true)
      expect(canStand(door.x, (site.y + 4) * TILE - 1)).toBe(true)
      expect(canStand(door.x - 32, (site.y + 4) * TILE - 1)).toBe(false)
    }
    expect(canStand(DISTRICTS.planning.x * TILE + 24, DISTRICTS.planning.y * TILE + 42)).toBe(false)
  })

  it('blocks building edges and river cells except for the town bridge', () => {
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
