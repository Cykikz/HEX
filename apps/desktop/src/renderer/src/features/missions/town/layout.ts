export const TILE = 16
export const COLUMNS = 36
export const ROWS = 23
export const TOWN_WIDTH = COLUMNS * TILE
export const TOWN_HEIGHT = ROWS * TILE

export interface Point { x: number; y: number }
export type District = 'planning' | 'build' | 'sandbox' | 'review'

export const DISTRICTS = {
  planning: { name: 'Planning Hall', x: 4, y: 2, door: { x: 8, y: 7 }, roof: 0x326c60, trim: 0x79b5a5 },
  build: { name: 'Workshop', x: 24, y: 2, door: { x: 28, y: 7 }, roof: 0xad5a46, trim: 0xeaaa74 },
  sandbox: { name: 'Test Lab', x: 4, y: 13, door: { x: 8, y: 17 }, roof: 0x655784, trim: 0xafa1cb },
  review: { name: 'Review House', x: 24, y: 13, door: { x: 28, y: 17 }, roof: 0x355f80, trim: 0x83b9d5 }
} satisfies Record<District, { name: string; x: number; y: number; door: Point; roof: number; trim: number }>

export const HOUSE_WIDTH = 8
export const HOUSE_HEIGHT = 4
export const PLAYER_SPAWN: Point = { x: 18, y: 15 }
export const COMMONS: Point[] = [
  { x: 12, y: 10 }, { x: 15, y: 9 }, { x: 21, y: 9 }, { x: 23, y: 11 },
  { x: 19, y: 13 }, { x: 15, y: 12 }, { x: 14, y: 16 }, { x: 22, y: 16 }
]

const DIRECTIONS: readonly Point[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
const paths = new Uint8Array(COLUMNS * ROWS)
const blocked = new Uint8Array(COLUMNS * ROWS)

function rectangle(grid: Uint8Array, x: number, y: number, w: number, h: number) {
  for (let row = y; row < y + h; row++) grid.fill(1, row * COLUMNS + x, row * COLUMNS + x + w)
}

rectangle(paths, 1, 9, 34, 3)
rectangle(paths, 16, 0, 4, ROWS)
rectangle(paths, 14, 8, 8, 6)
rectangle(paths, 6, 6, 5, 4)
rectangle(paths, 26, 6, 5, 4)
rectangle(paths, 4, 17, 28, 2)
rectangle(paths, 13, 11, 2, 7)
rectangle(paths, 21, 11, 2, 7)

for (const site of Object.values(DISTRICTS)) rectangle(blocked, site.x, site.y, HOUSE_WIDTH, HOUSE_HEIGHT)
rectangle(blocked, 17, 10, 2, 2)

export const TREES: readonly [number, number, number][] = [
  [1, 1, 0], [3, 1, 2], [13, 1, 1], [15, 1, 0], [21, 1, 2], [22, 2, 0], [33, 1, 1], [34, 2, 0],
  [1, 4, 2], [2, 6, 1], [13, 4, 1], [14, 6, 0], [21, 5, 2], [33, 4, 2], [34, 7, 0],
  [1, 13, 2], [2, 15, 0], [12, 14, 2], [15, 15, 1], [20, 14, 0], [32, 13, 2], [34, 14, 0],
  [0, 17, 1], [2, 17, 0], [33, 17, 2], [35, 16, 1], [13, 22, 0], [23, 22, 1], [31, 22, 2]
]
for (const [x, y] of TREES) blocked[y * COLUMNS + x] = 1

export const isPath = (x: number, y: number) => paths[y * COLUMNS + x] === 1
export const isWater = (x: number, y: number) => y >= (x < 7 || x > 28 ? 19 : 20) && y < 22
export const isBridge = (x: number, y: number) => x >= 16 && x < 20 && y >= 19 && y < 22
export const center = ({ x, y }: Point): Point => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })
export const cell = (x: number, y: number): Point => ({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) })
export const indexOf = ({ x, y }: Point): number => y * COLUMNS + x

export function walkable(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < COLUMNS && y < ROWS
    && blocked[y * COLUMNS + x] === 0 && (!isWater(x, y) || isBridge(x, y))
}

export function destination(district: District, slot: number): Point {
  const door = DISTRICTS[district].door
  return { x: door.x + (slot % 5) - 2, y: door.y + (Math.floor(slot / 5) % 2) }
}

/** Prefer streets when both endpoints are on the street grid. Return tile centers. */
export function findTownRoute(from: Point, to: Point): Point[] {
  const start = indexOf(from)
  const end = indexOf(to)
  if (start === end || !walkable(to.x, to.y) || !walkable(from.x, from.y)) return []
  const streetOnly = isPath(from.x, from.y) && isPath(to.x, to.y)
  const trail = new Int16Array(COLUMNS * ROWS).fill(-1)
  const queue = [start]
  trail[start] = start

  for (let cursor = 0; cursor < queue.length && trail[end] === -1; cursor++) {
    const index = queue[cursor]
    const x = index % COLUMNS
    const y = Math.floor(index / COLUMNS)
    for (const direction of DIRECTIONS) {
      const nx = x + direction.x
      const ny = y + direction.y
      if (!walkable(nx, ny) || (streetOnly && !isPath(nx, ny))) continue
      const next = ny * COLUMNS + nx
      if (trail[next] !== -1) continue
      trail[next] = index
      queue.push(next)
    }
  }

  if (trail[end] === -1) return []
  const route: Point[] = []
  for (let next = end; next !== start; next = trail[next]) {
    route.push(center({ x: next % COLUMNS, y: Math.floor(next / COLUMNS) }))
  }
  return route.reverse()
}
