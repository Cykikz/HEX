export const TILE = 16
export const COLUMNS = 36
export const ROWS = 23
export const TOWN_WIDTH = COLUMNS * TILE
export const TOWN_HEIGHT = ROWS * TILE

export interface Point { x: number; y: number }
export type District = 'planning' | 'build' | 'sandbox' | 'review'

export type TownTarget = { kind: 'place'; id: District } | { kind: 'resident'; id: string }

export const DISTRICT_ORDER = ['planning', 'build', 'sandbox', 'review'] as const

export const DISTRICTS = {
  planning: {
    name: 'Planning Office', step: 'Plan', color: '#95d7b2', x: 4, y: 2, door: { x: 8, y: 7 },
    description: 'The PM turns the request into milestones and assigns features to the team.'
  },
  build: {
    name: 'Build Workshop', step: 'Build', color: '#f3bd7f', x: 24, y: 2, door: { x: 28, y: 7 },
    description: 'Engineers edit assigned features and hand off their changed files.'
  },
  sandbox: {
    name: 'Test Lab', step: 'Test', color: '#bcb5ed', x: 4, y: 13, door: { x: 8, y: 17 },
    description: 'HEX runs automated checks in the sandbox and records which passed or failed.'
  },
  review: {
    name: 'Review Office', step: 'Review', color: '#9ed3e9', x: 24, y: 13, door: { x: 28, y: 17 },
    description: 'QA, Reviewer, and Security validate the work and flag issues that need attention.'
  }
} satisfies Record<District, { name: string; step: string; color: string; description: string; x: number; y: number; door: Point }>

export const HOUSE_WIDTH = 8
export const HOUSE_HEIGHT = 4
const PLAYER_RADIUS = 3
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

for (const site of Object.values(DISTRICTS)) rectangle(paths, site.x, site.y, HOUSE_WIDTH, HOUSE_HEIGHT)
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

type Obstacle = readonly [left: number, top: number, width: number, height: number]

const WALLS: readonly Obstacle[] = [
  [0, 0, 128, 12], [0, 12, 4, 52], [124, 12, 4, 52], [4, 60, 48, 4], [76, 60, 48, 4]
]
// Pixel footprints for the solid fixtures drawn by scenery.ts. The rest of each floor is open.
const FURNITURE: Record<District, readonly Obstacle[]> = {
  planning: [[20, 12, 88, 17], [13, 31, 33, 21], [82, 31, 33, 21], [7, 17, 9, 9]],
  build: [[8, 12, 112, 9], [11, 21, 37, 21], [79, 21, 38, 21], [9, 48, 30, 11]],
  sandbox: [
    [10, 14, 14, 28], [28, 14, 14, 28], [46, 14, 14, 28], [102, 14, 14, 28],
    [66, 15, 29, 20], [8, 49, 34, 6], [87, 49, 31, 6]
  ],
  review: [[38, 21, 52, 16], [29, 44, 11, 7], [88, 44, 11, 7], [11, 15, 20, 19], [106, 16, 10, 12]]
}
const WORKSTATIONS: Record<District, readonly Point[]> = {
  planning: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 2, y: 3 }, { x: 5, y: 3 }],
  build: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 3 }],
  sandbox: [{ x: 4, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 3 }],
  review: [{ x: 3, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }]
}

export function roomAt(x: number, y: number): District | null {
  return DISTRICT_ORDER.find((id) => {
    const site = DISTRICTS[id]
    return x >= site.x * TILE && y >= site.y * TILE
      && x < (site.x + HOUSE_WIDTH) * TILE && y < (site.y + HOUSE_HEIGHT) * TILE
  }) ?? null
}

function overlaps(rectangles: readonly Obstacle[], x: number, y: number): boolean {
  return rectangles.some(([left, top, width, height]) => x >= left && x < left + width && y >= top && y < top + height)
}

function clearPixel(x: number, y: number): boolean {
  const tile = cell(x, y)
  if (tile.x < 0 || tile.y < 0 || tile.x >= COLUMNS || tile.y >= ROWS) return false
  if (blocked[indexOf(tile)] || (isWater(tile.x, tile.y) && !isBridge(tile.x, tile.y))) return false
  const district = roomAt(x, y)
  if (!district) return true
  const site = DISTRICTS[district]
  const localX = x - site.x * TILE
  const localY = y - site.y * TILE
  return !overlaps(WALLS, localX, localY) && !overlaps(FURNITURE[district], localX, localY)
}

export function canStand(x: number, y: number): boolean {
  return clearPixel(x - PLAYER_RADIUS, y - PLAYER_RADIUS) && clearPixel(x + PLAYER_RADIUS, y - PLAYER_RADIUS)
    && clearPixel(x - PLAYER_RADIUS, y + PLAYER_RADIUS) && clearPixel(x + PLAYER_RADIUS, y + PLAYER_RADIUS)
}

export function walkable(x: number, y: number): boolean {
  const point = center({ x, y })
  return canStand(point.x, point.y)
}

export function destination(district: District, slot: number): Point {
  const site = DISTRICTS[district]
  const seats = WORKSTATIONS[district]
  const seat = seats[slot % seats.length]
  return { x: site.x + seat.x, y: site.y + seat.y }
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
      const midpoint = center({ x: (x + nx) / 2, y: (y + ny) / 2 })
      if (!canStand(midpoint.x, midpoint.y)) continue
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
