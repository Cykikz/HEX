import type Phaser from 'phaser'

import {
  COLUMNS, DISTRICTS, DISTRICT_ORDER, HOUSE_HEIGHT, HOUSE_WIDTH, ROWS, TILE, TOWN_HEIGHT,
  TOWN_WIDTH, TREES, isBridge, isPath, isWater, type District
} from './layout'

export const TERRAIN = 'town-tiles'

const TREETOPS = [583, 585, 587]
const TRUNKS = [640, 642, 644]
const FLOWERS = [542, 544, 545, 546]
const TOWN_PROPS: readonly [number, number, number][] = [
  [5, 8, 541], [11, 8, 541], [25, 8, 541], [31, 8, 541], [5, 17, 541], [11, 17, 541],
  [25, 17, 541], [31, 17, 541], [14, 8, 416], [21, 8, 416], [14, 13, 416], [21, 13, 416],
  [32, 8, 26], [33, 8, 16], [33, 6, 26], [25, 12, 17], [31, 12, 42],
  [6, 1, 1360], [7, 1, 1360], [8, 1, 1360], [9, 1, 1360], [10, 1, 1360],
  [15, 22, 565], [20, 22, 565], [10, 19, 1310], [15, 19, 1309], [20, 19, 1310], [23, 19, 1309],
  [34, 20, 1367], [2, 20, 1365]
]
const GARDENS: readonly [number, number, number][] = [
  [2, 2, 6], [10, 1, 4], [23, 6, 4], [32, 6, 5], [4, 12, 6], [27, 12, 5], [3, 18, 5], [29, 18, 6]
]

export function paintTown(scene: Phaser.Scene) {
  const ground = scene.add.renderTexture(0, 0, TOWN_WIDTH, TOWN_HEIGHT).setOrigin(0)
  const tile = (frame: number, x: number, y: number) => ground.batchDrawFrame(TERRAIN, frame, x * TILE, y * TILE)
  const ink = scene.add.graphics()

  ground.beginDraw()
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLUMNS; x++) {
      const noise = ((x * 73) ^ (y * 117) ^ (x * y * 7)) % 31
      if (isBridge(x, y)) {
        tile(177, x, y)
      } else if (isWater(x, y)) {
        tile(!isWater(x, y - 1) ? 3 : !isWater(x, y + 1) ? 117 : noise < 8 ? 1 : 0, x, y)
      } else if (isPath(x, y)) {
        const plaza = x >= 14 && x <= 21 && y >= 8 && y <= 13
        tile(plaza ? 7 : noise < 6 ? 65 : 8, x, y)
        if (!isPath(x, y + 1)) ink.fillStyle(0x433826, 0.18).fillRect(x * TILE, (y + 1) * TILE - 2, TILE, 2)
      } else {
        tile(noise < 6 ? 62 : 5, x, y)
        ink.fillStyle(noise < 12 ? 0x526f50 : 0x507c54, 0.2).fillRect(x * TILE, y * TILE, TILE, TILE)
        if (noise === 9) tile(528, x, y)
      }
    }
  }
  ground.batchDraw(ink)
  ink.clear()

  for (const [left, y, count] of GARDENS) {
    for (let offset = 0; offset < count; offset++) tile(FLOWERS[(left + offset) % FLOWERS.length], left + offset, y)
  }
  for (const [x, y, kind] of TREES) {
    ink.fillStyle(0x253b31, 0.2).fillEllipse(x * TILE + 9, y * TILE + 13, 23, 7)
    ground.batchDraw(ink)
    ink.clear()
    tile(TREETOPS[kind], x, y - 1)
    tile(TRUNKS[kind], x, y)
  }
  for (const [x, y, frame] of TOWN_PROPS) tile(frame, x, y)
  for (const [x, y, frame] of [[17, 10, 173], [18, 10, 175], [17, 11, 287], [18, 11, 289]]) tile(frame, x, y)

  ink.fillStyle(0xc0e4db).fillRect(17 * TILE + 13, 10 * TILE + 14, 7, 7)
  ink.fillStyle(0xdef6ee).fillRect(17 * TILE + 16, 10 * TILE + 10, 2, 6)
  ink.fillStyle(0x654b38).fillRect(16 * TILE, 19 * TILE, 3, 48).fillRect(20 * TILE - 3, 19 * TILE, 3, 48)
  for (let y = 19 * TILE; y < 22 * TILE; y += 8) {
    ink.fillStyle(0x624735, 0.24).fillRect(16 * TILE + 3, y + 2, 58, 1)
  }

  for (const district of DISTRICT_ORDER) paintWorkplace(ink, district)
  ground.batchDraw(ink)
  ground.endDraw()
  ink.destroy()

  for (const district of DISTRICT_ORDER) {
    const site = DISTRICTS[district]
    scene.add.text((site.x + HOUSE_WIDTH / 2) * TILE, site.y * TILE - 6, site.name, {
      resolution: 2, fontFamily: 'monospace', fontSize: '9px', fontStyle: 'bold', color: site.color,
      backgroundColor: '#192924', padding: { left: 4, right: 4, top: 3, bottom: 2 }
    }).setOrigin(0.5, 0).setDepth(1)
  }

  const ripples = scene.add.graphics()
  ripples.fillStyle(0xe2f4e8, 0.48)
  for (const [x, y] of [[1, 20], [5, 21], [11, 20], [15, 21], [22, 20], [25, 21], [29, 20], [33, 21]]) {
    ripples.fillRect(x * TILE + 3, y * TILE + 6, 9, 1)
    ripples.fillRect(x * TILE + 10, y * TILE + 8, 5, 1)
  }
  ripples.setDepth(2)
  scene.tweens.add({ targets: ripples, alpha: 0.35, y: 2, duration: 1700, yoyo: true, repeat: -1 })
}

const WALLS = {
  planning: { edge: 0x415f4c, trim: 0x9ebe96, floor: 0xb38355, grain: 0x986942 },
  build: { edge: 0x544747, trim: 0xdc9b64, floor: 0x867d72, grain: 0x746b65 },
  sandbox: { edge: 0x3c485e, trim: 0x9b9abf, floor: 0x637590, grain: 0x546781 },
  review: { edge: 0x435761, trim: 0x9abac3, floor: 0xb7a48c, grain: 0x9e8979 }
}

type Paint = (color: number, x: number, y: number, w: number, h: number) => void

function paintWorkplace(gfx: Phaser.GameObjects.Graphics, district: District) {
  const site = DISTRICTS[district]
  const x = site.x * TILE
  const y = site.y * TILE
  const width = HOUSE_WIDTH * TILE
  const height = HOUSE_HEIGHT * TILE
  const wall = WALLS[district]
  const paint: Paint = (color, left, top, w, h) => { gfx.fillStyle(color).fillRect(x + left, y + top, w, h) }

  gfx.fillStyle(0x283b31, 0.34).fillRect(x + 5, y + 6, width + 2, height + 4)
  paint(0x29332e, 0, 0, width, height)
  paint(wall.floor, 4, 13, width - 8, height - 17)
  for (let row = 16; row < height - 4; row += 5) {
    paint(wall.grain, 4, row, width - 8, 1)
    for (let joint = 9 + (row % 3) * 9; joint < width - 5; joint += 27) paint(wall.grain, joint, row - 3, 1, 3)
  }
  paint(wall.edge, 2, 2, width - 4, 10)
  paint(wall.trim, 3, 3, width - 6, 2)
  paint(wall.edge, 1, 8, 3, height - 9)
  paint(wall.edge, width - 4, 8, 3, height - 9)
  paint(wall.edge, 2, height - 4, 50, 4)
  paint(wall.edge, 76, height - 4, 50, 4)
  paint(0xb8a58a, 52, height - 4, 24, 4)
  paint(wall.trim, 52, height - 2, 24, 1)
  paint(wall.trim, 51, height - 9, 2, 8)
  paint(wall.trim, 75, height - 9, 2, 8)
  fixtures[district](paint)
}

const fixtures: Record<District, (paint: Paint) => void> = {
  planning(paint) {
    paint(0x315043, 20, 12, 88, 17)
    paint(0x4f7261, 22, 14, 84, 13)
    for (const left of [27, 52, 78]) {
      paint(0xa4c6ae, left, 16, 20, 2)
      paint(0xffd897, left + 1, 20, 4, 5)
      paint(0xa6dbcf, left + 7, 20, 4, 5)
      paint(0xeaa397, left + 13, 20, 4, 5)
    }
    desk(paint, 13, 35, 33)
    desk(paint, 82, 35, 33)
    paint(0x9d775e, 53, 32, 22, 25)
    paint(0xcd9a73, 54, 33, 20, 23)
    paint(0xe7b38a, 57, 34, 14, 1)
    paint(0xe7b38a, 57, 54, 14, 1)
    paint(0x688d63, 7, 18, 9, 8)
    paint(0x9fc480, 9, 17, 5, 4)
  },
  build(paint) {
    paint(0x664f44, 8, 12, 112, 9)
    for (let pos = 10; pos < 115; pos += 13) {
      paint(0xcda97a, pos, 13, 7, 1)
      paint(0xd6cfb9, pos + 2, 15, 2, 4)
    }
    desk(paint, 11, 25, 37)
    desk(paint, 79, 25, 38)
    paint(0x906037, 9, 49, 30, 10)
    paint(0xd19d5e, 10, 48, 28, 7)
    paint(0xffcf83, 19, 50, 1, 5)
    paint(0xffcf83, 30, 50, 1, 5)
    for (let pos = 46; pos < 81; pos += 6) {
      paint(0x59433d, pos, 49, 3, 5)
      paint(0xe7a35f, pos + 3, 49, 3, 5)
    }
  },
  sandbox(paint) {
    for (const rack of [10, 28, 46, 102]) {
      paint(0x263447, rack, 14, 14, 28)
      paint(0x576a80, rack + 1, 15, 12, 2)
      for (let tier = 0; tier < 4; tier++) {
        paint(0x151f2e, rack + 2, 19 + tier * 5, 10, 3)
        paint(tier % 2 ? 0x77acd6 : 0x8fceaa, rack + 4, 20 + tier * 5, 2, 1)
      }
    }
    paint(0x313c56, 66, 15, 29, 17)
    paint(0x8a9ac8, 68, 17, 25, 12)
    paint(0x293b58, 70, 19, 21, 8)
    paint(0xc0b5f1, 73, 21, 14, 1)
    paint(0x9bc7df, 73, 24, 9, 1)
    paint(0x465677, 73, 33, 14, 2)
    paint(0x7e8fb2, 8, 49, 34, 6)
    paint(0x7e8fb2, 87, 49, 31, 6)
  },
  review(paint) {
    paint(0x557282, 34, 20, 60, 35)
    paint(0x6d8b97, 35, 21, 58, 33)
    paint(0x5b4a41, 38, 21, 52, 16)
    paint(0xab7958, 40, 21, 48, 13)
    for (const page of [46, 59, 73]) {
      paint(0xf7e9c8, page, 23, 9, 8)
      paint(0xb4a7a3, page + 2, 26, 5, 1)
      paint(0xb4a7a3, page + 2, 28, 4, 1)
    }
    paint(0x6c5954, 29, 44, 11, 7)
    paint(0x6c5954, 88, 44, 11, 7)
    paint(0x76645a, 11, 15, 20, 19)
    paint(0xd4b489, 13, 16, 16, 15)
    for (let line = 0; line < 3; line++) {
      paint(0x83a794, 16, 19 + line * 4, 3, 2)
      paint(0xede1bd, 21, 19 + line * 4, 6, 1)
    }
    paint(0x5a7a6d, 106, 17, 10, 11)
    paint(0x9fc18f, 108, 16, 6, 6)
  }
}

function desk(paint: Paint, x: number, y: number, width: number) {
  paint(0x654836, x, y + 2, width, 14)
  paint(0xb38154, x, y, width, 10)
  paint(0xe0ad73, x + 1, y, width - 2, 2)
  paint(0x304349, x + 4, y - 4, 12, 9)
  paint(0x8dc3b3, x + 5, y - 3, 10, 5)
  paint(0xf0ddba, x + width - 11, y + 3, 7, 4)
  paint(0x53595b, x + 6, y + 12, 9, 5)
}

const WORK_LIGHTS: Record<District, readonly [number, number, number, number][]> = {
  planning: [[28, 20, 2, 4], [53, 21, 2, 3], [79, 20, 2, 4]],
  build: [[16, 22, 10, 5], [84, 22, 10, 5]],
  sandbox: [
    [14, 20, 2, 1], [32, 25, 2, 1], [50, 20, 2, 1],
    [106, 30, 2, 1], [73, 21, 14, 1], [73, 24, 9, 1]
  ],
  review: [[16, 19, 3, 2], [16, 23, 3, 2], [16, 27, 3, 2]]
}

export function workLights(scene: Phaser.Scene, district: District): Phaser.GameObjects.Graphics {
  const site = DISTRICTS[district]
  const lights = scene.add.graphics().setDepth(2).setVisible(false)
  lights.fillStyle(district === 'sandbox' ? 0xc6f5fa : 0xffe0a3, 0.85)
  for (const [x, y, width, height] of WORK_LIGHTS[district]) {
    lights.fillRect(site.x * TILE + x, site.y * TILE + y, width, height)
  }
  return lights
}
