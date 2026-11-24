import type Phaser from 'phaser'

import {
  COLUMNS, DISTRICTS, HOUSE_HEIGHT, HOUSE_WIDTH, ROWS, TILE, TOWN_HEIGHT, TOWN_WIDTH,
  TREES, isBridge, isPath, isWater, type District
} from './layout'

export const TERRAIN = 'town-tiles'

const TREETOPS = [583, 585, 587]
const TRUNKS = [640, 642, 644]
const FLOWERS = [542, 544, 545, 546]
const FACADES = {
  planning: { wall: 0xdcc6a3, window: 102, columns: [1, 2, 5, 6] },
  build: { wall: 0xd3a375, window: 96, columns: [1, 6] },
  sandbox: { wall: 0xb8b5b3, window: 215, columns: [1, 2, 5, 6] },
  review: { wall: 0xe0c487, window: 101, columns: [1, 6] }
} satisfies Record<District, { wall: number; window: number; columns: number[] }>

const TOWN_PROPS: readonly [number, number, number][] = [
  [5, 8, 541], [11, 8, 541], [25, 8, 541], [31, 8, 541], [5, 17, 541], [11, 17, 541],
  [25, 17, 541], [31, 17, 541], [14, 8, 416], [21, 8, 416], [14, 13, 416], [21, 13, 416],
  [32, 8, 26], [33, 8, 16], [33, 6, 26], [25, 12, 17], [31, 12, 42],
  [6, 1, 1360], [7, 1, 1360], [8, 1, 1360], [9, 1, 1360], [10, 1, 1360],
  [3, 13, 565], [3, 15, 566], [15, 22, 565], [20, 22, 565],
  [10, 19, 1310], [15, 19, 1309], [20, 19, 1310], [23, 19, 1309],
  [34, 20, 1367], [2, 20, 1365]
]

const GARDENS: readonly [number, number, number][] = [
  [2, 2, 6], [10, 1, 4], [23, 6, 4], [32, 6, 5], [4, 12, 6], [27, 12, 5], [3, 18, 5], [29, 18, 6]
]

/** Bakes the ground, scenery and structures into one canvas texture. */
export function paintTown(scene: Phaser.Scene) {
  const ground = scene.add.renderTexture(0, 0, TOWN_WIDTH, TOWN_HEIGHT).setOrigin(0)
  const tile = (frame: number, x: number, y: number) => ground.drawFrame(TERRAIN, frame, x * TILE, y * TILE)

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const noise = ((x * 73) ^ (y * 117) ^ (x * y * 7)) % 31
      if (isBridge(x, y)) {
        tile(177, x, y)
      } else if (isWater(x, y)) {
        const shoreAbove = !isWater(x, y - 1)
        const shoreBelow = !isWater(x, y + 1)
        tile(shoreAbove ? 3 : shoreBelow ? 117 : noise < 8 ? 1 : 0, x, y)
      } else if (isPath(x, y)) {
        const plaza = x >= 14 && x <= 21 && y >= 8 && y <= 13
        tile(plaza ? 7 : noise < 6 ? 65 : 8, x, y)
      } else {
        tile(noise < 6 ? 62 : 5, x, y)
        if (noise === 9) tile(528, x, y)
      }
    }
  }

  for (const [left, y, count] of GARDENS) {
    for (let offset = 0; offset < count; offset++) tile(FLOWERS[(left + offset) % FLOWERS.length], left + offset, y)
  }

  for (const [x, y, kind] of TREES) {
    tile(TREETOPS[kind], x, y - 1)
    tile(TRUNKS[kind], x, y)
  }

  for (const [x, y, frame] of TOWN_PROPS) tile(frame, x, y)

  const sites = Object.entries(DISTRICTS) as [District, (typeof DISTRICTS)[District]][]
  const architecture = scene.add.graphics()
  for (const [district, site] of sites) drawHouse(architecture, district, site)
  ground.draw(architecture)
  architecture.destroy()

  for (const [district, site] of sites) {
    const facade = FACADES[district]
    for (const windowX of facade.columns) tile(facade.window, site.x + windowX, site.y + 3)
    scene.add.text((site.x + HOUSE_WIDTH / 2) * TILE, site.y * TILE + 16, site.name, {
      fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: '#fff6db',
      backgroundColor: '#27353a', padding: { left: 4, right: 4, top: 3, bottom: 3 }
    }).setOrigin(0.5, 0).setDepth(1)
  }

  // The central fountain occupies the same four blocked cells used by both players and routes.
  for (const [x, y, frame] of [[17, 10, 173], [18, 10, 175], [17, 11, 287], [18, 11, 289]]) tile(frame, x, y)
  const fountain = scene.add.graphics()
  fountain.fillStyle(0xc0e4db).fillRect(17 * TILE + 13, 10 * TILE + 14, 7, 7)
  fountain.fillStyle(0xdef6ee).fillRect(17 * TILE + 16, 10 * TILE + 10, 2, 6)
  ground.draw(fountain)
  fountain.destroy()

  const ripples = scene.add.graphics()
  ripples.fillStyle(0xe2f4e8, 0.48)
  for (const [x, y] of [[1, 20], [5, 21], [11, 20], [15, 21], [22, 20], [25, 21], [29, 20], [33, 21]]) {
    ripples.fillRect(x * TILE + 3, y * TILE + 6, 9, 1)
    ripples.fillRect(x * TILE + 10, y * TILE + 8, 5, 1)
  }
  ripples.setDepth(2)
  scene.tweens.add({ targets: ripples, alpha: 0.35, y: 2, duration: 1700, yoyo: true, repeat: -1 })
}

function drawHouse(gfx: Phaser.GameObjects.Graphics, district: District, site: (typeof DISTRICTS)[District]) {
  const x = site.x * TILE
  const y = site.y * TILE
  const width = HOUSE_WIDTH * TILE
  const height = HOUSE_HEIGHT * TILE
  const eaves = height - TILE - 3

  gfx.fillStyle(0x1d302e, 0.32).fillRect(x + 4, y + 8, width + 4, height)
  gfx.fillStyle(0x374139).fillRect(x, y + 7, width, height - 7)
  gfx.fillStyle(FACADES[district].wall).fillRect(x + 3, y + eaves - 3, width - 6, height - eaves)
  gfx.fillStyle(0xb08a62).fillRect(x + 3, y + height - 7, width - 6, 5)

  // Stepped shoulders and individually offset courses give each roof a pixel-art silhouette.
  gfx.fillStyle(0x243535).fillRect(x - 2, y + eaves - 5, width + 4, 7)
  for (let row = 0; row < 8; row++) {
    const inset = Math.max(0, 12 - row * 3)
    const top = y + 3 + row * 5
    const left = x + inset
    const length = width - inset * 2
    gfx.fillStyle(site.roof).fillRect(left, top, length, 5)
    gfx.fillStyle(site.trim, 0.45).fillRect(left, top, length, 1)
    gfx.fillStyle(0x23363d, 0.28)
    for (let shingle = left + (row % 2) * 5 + 5; shingle < left + length - 3; shingle += 10) {
      gfx.fillRect(shingle, top + 2, 1, 3)
    }
  }
  gfx.fillStyle(site.trim).fillRect(x + 11, y + 2, width - 22, 2)
  const door = x + width / 2
  gfx.fillStyle(0x374139).fillRect(door - 10, y + eaves + 3, 20, 15)
  gfx.fillStyle(0x6b5945).fillRect(door - 8, y + eaves + 5, 16, 13)
  gfx.fillStyle(0x96816a).fillRect(door - 7, y + eaves + 5, 14, 2)
  gfx.fillStyle(0xe6c17e).fillRect(door + 4, y + eaves + 11, 2, 2)
  gfx.fillStyle(0x8b8274).fillRect(door - 12, y + height, 24, 2)

  if (district === 'build') {
    gfx.fillStyle(0x613a36).fillRect(x + width - 22, y - 7, 14, 20)
    gfx.fillStyle(0xc88c68).fillRect(x + width - 24, y - 9, 18, 3)
  } else if (district === 'sandbox') {
    gfx.fillStyle(0xb2a6bf).fillRect(x + 18, y + 11, 25, 13)
    gfx.fillStyle(0x635e9b).fillRect(x + 20, y + 13, 21, 9)
    gfx.fillStyle(0x83d5ce).fillRect(x + 22, y + 14, 7, 7).fillRect(x + 31, y + 14, 8, 7)
  } else if (district === 'review') {
    gfx.fillStyle(0x264560).fillRect(door - 19, y + eaves + 1, 38, 6)
    gfx.fillStyle(0x9ab7bc).fillRect(door - 18, y + eaves + 1, 36, 2)
    gfx.fillStyle(0x464c49).fillRect(door - 18, y + eaves + 7, 3, 11).fillRect(door + 15, y + eaves + 7, 3, 11)
  } else {
    gfx.fillStyle(0xe7d9b3).fillRect(door - 15, y + eaves + 2, 3, 16).fillRect(door + 12, y + eaves + 2, 3, 16)
    gfx.fillStyle(0xb1c8a0).fillRect(door - 15, y + eaves + 1, 30, 3)
  }
  gfx.fillStyle(site.trim).fillRect(x - 2, y + eaves - 4, width + 4, 2)
}
