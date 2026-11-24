import Phaser from 'phaser'

import type { MemberState } from '../team'
import {
  COMMONS, DISTRICTS, DISTRICT_ORDER, HOUSE_HEIGHT, HOUSE_WIDTH, PLAYER_SPAWN, TILE, TOWN_HEIGHT, TOWN_WIDTH, canStand, cell, center,
  destination, findTownRoute, indexOf, roomAt, type District, type Point, type TownTarget
} from './layout'
import { paintTown, TERRAIN, workLights } from './scenery'
import terrainUrl from './town-tiles.png'
import walkersUrl from './town-walkers.png'

const WALKERS = 'town-walkers'
const DIRECTIONS = ['down', 'left', 'right', 'up'] as const
const RESIDENT_SPEED = 74
const PLAYER_SPEED = 101
const PORTRAITS: Record<string, number> = {
  pm: 1, researcher: 2, backend: 3, frontend: 2, designer: 4,
  data: 5, devops: 3, qa: 4, 'code-reviewer': 5, security: 3
}
const SIGNALS: Record<MemberState, number> = {
  working: 0x9fe399, done: 0x99d2eb, failed: 0xffb094, idle: 0xd8caa1
}

type Direction = (typeof DIRECTIONS)[number]

export interface TownResident { id: string; name: string; state: MemberState; district: District }
export interface TownSnapshot { residents: TownResident[]; selected: TownTarget | null; checking: boolean }
export interface TownCamera { zoom: number; followSelection: boolean }
export interface TownInput { keys: Set<string>; inspect: boolean; camera: TownCamera }

interface Bridge {
  snapshot(): TownSnapshot
  input: TownInput
  onInspect(target: TownTarget): void
  onNearby(name: string | null): void
  onLocation(id: District | null): void
  onReady(): void
}

interface Walker {
  sprite: Phaser.GameObjects.Sprite
  shadow: Phaser.GameObjects.Ellipse
  label: Phaser.GameObjects.Text
  signal: Phaser.GameObjects.Arc
  skin: number
  facing: Direction
}

interface Resident extends Walker {
  slot: number
  route: Point[]
  target: number | null
  restUntil: number
  nextStop: number
  state: MemberState
}

export function openTown(parent: HTMLElement, bridge: Bridge): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.CANVAS,
    parent,
    width: TOWN_WIDTH,
    height: TOWN_HEIGHT,
    backgroundColor: '#819956',
    pixelArt: true,
    roundPixels: true,
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new TownScene(bridge)
  })
}

class TownScene extends Phaser.Scene {
  private player!: Walker
  private residents = new Map<string, Resident>()
  private selectedRing!: Phaser.GameObjects.Ellipse
  private districtSignals = new Map<District, {
    lamp: Phaser.GameObjects.Arc
    lights: Phaser.GameObjects.Graphics
  }>()
  private districtFrames = new Map<District, Phaser.GameObjects.Rectangle>()
  private hoveredPlace: District | null = null
  private snapshot: TownSnapshot | null = null
  private cameraCenter = { x: TOWN_WIDTH / 2, y: TOWN_HEIGHT / 2 }
  private nearbyName: string | null = null
  private room: District | null = null

  constructor(private readonly bridge: Bridge) {
    super('hex-town')
  }

  preload() {
    this.load.spritesheet(TERRAIN, terrainUrl, { frameWidth: TILE, frameHeight: TILE, spacing: 1 })
    this.load.spritesheet(WALKERS, walkersUrl, { frameWidth: TILE, frameHeight: TILE })
  }

  create() {
    paintTown(this)
    registerWalkingAnimations(this)
    this.player = this.createWalker(center(PLAYER_SPAWN), 0, 'You')
    this.player.signal.setVisible(false)
    this.selectedRing = this.add.ellipse(0, 0, 18, 8).setStrokeStyle(1, 0xffe1a4).setVisible(false)
    for (const district of DISTRICT_ORDER) {
      const site = DISTRICTS[district]
      const frame = this.add.rectangle(site.x * TILE, site.y * TILE, HOUSE_WIDTH * TILE, HOUSE_HEIGHT * TILE)
        .setOrigin(0).setDepth(3).setInteractive({ useHandCursor: true })
      frame.on('pointerover', () => { this.hoveredPlace = district })
      frame.on('pointerout', () => { if (this.hoveredPlace === district) this.hoveredPlace = null })
      frame.on('pointerdown', () => this.bridge.onInspect({ kind: 'place', id: district }))
      this.districtFrames.set(district, frame)
      const signal = this.add.circle((site.x + 7.52) * TILE, site.y * TILE + 7, 2.5, 0xe8f0a8).setDepth(4)
      const lights = workLights(this, district)
      this.districtSignals.set(district, { lamp: signal, lights })
      this.tweens.add({ targets: signal, scale: 1.5, duration: 650, repeat: -1, yoyo: true })
      this.tweens.add({ targets: lights, alpha: 0.3, duration: 750, repeat: -1, yoyo: true })
    }
    this.syncResidents(this.bridge.snapshot(), this.time.now)
    this.bridge.onReady()
  }

  update(time: number, delta: number) {
    const snapshot = this.bridge.snapshot()
    if (snapshot !== this.snapshot) this.syncResidents(snapshot, time)

    const elapsed = Math.min(delta, 50) / 1_000
    this.movePlayer(elapsed)
    for (const resident of this.residents.values()) this.moveResident(resident, time, elapsed)

    for (const [id, frame] of this.districtFrames) {
      const selected = snapshot.selected?.kind === 'place' && snapshot.selected.id === id
      const alpha = selected ? 1 : this.hoveredPlace === id ? 0.7 : 0
      frame.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(DISTRICTS[id].color).color, alpha)
    }
    const selected = snapshot.selected?.kind === 'resident' ? this.residents.get(snapshot.selected.id) : null
    this.updateView(snapshot.selected, selected, elapsed)
    this.selectedRing.setVisible(Boolean(selected))
    if (selected) this.selectedRing.setPosition(selected.sprite.x, selected.sprite.y + 1).setDepth(30 + selected.sprite.y)
    const room = roomAt(this.player.sprite.x, this.player.sprite.y)
    if (room !== this.room) {
      this.room = room
      this.bridge.onLocation(room)
    }
    const nearby = this.nearbyTarget()
    if ((nearby?.name ?? null) !== this.nearbyName) {
      this.nearbyName = nearby?.name ?? null
      this.bridge.onNearby(this.nearbyName)
    }
    if (this.bridge.input.inspect) {
      this.bridge.input.inspect = false
      if (nearby) this.bridge.onInspect(nearby.target)
    }
  }

  private syncResidents(snapshot: TownSnapshot, time: number) {
    this.snapshot = snapshot
    for (const [district, { lamp, lights }] of this.districtSignals) {
      const active = district === 'sandbox'
        ? snapshot.checking
        : snapshot.residents.some((resident) => resident.district === district && resident.state === 'working')
      lamp.setVisible(active)
      lights.setVisible(active)
    }
    const present = new Set(snapshot.residents.map((resident) => resident.id))
    for (const [id, resident] of this.residents) {
      if (present.has(id)) continue
      resident.sprite.destroy()
      resident.shadow.destroy()
      resident.label.destroy()
      resident.signal.destroy()
      this.residents.delete(id)
    }

    snapshot.residents.forEach((activity, slot) => {
      let resident = this.residents.get(activity.id)
      if (!resident) {
        const skin = PORTRAITS[activity.id] ?? 1 + (slot % 5)
        const walker = this.createWalker(center(COMMONS[slot % COMMONS.length]), skin, activity.name)
        walker.sprite.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.bridge.onInspect({ kind: 'resident', id: activity.id }))
        walker.label.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.bridge.onInspect({ kind: 'resident', id: activity.id }))
        resident = {
          ...walker, slot, route: [], target: null, restUntil: time + 1700 + slot * 500,
          nextStop: slot + 2, state: 'idle'
        }
        this.residents.set(activity.id, resident)
      }
      resident.signal.setFillStyle(SIGNALS[activity.state])
      const destinationTile = activity.state === 'working' ? destination(activity.district, resident.slot) : null
      if (destinationTile && resident.target !== indexOf(destinationTile)) {
        this.sendTo(resident, destinationTile)
      } else if (resident.state === 'working' && activity.state !== 'working') {
        resident.restUntil = time + 2800
      }
      resident.state = activity.state
    })
  }

  private createWalker(position: Point, skin: number, name: string): Walker {
    const shadow = this.add.ellipse(position.x, position.y + 1, 13, 5, 0x303f35, 0.38)
    const sprite = this.add.sprite(position.x, position.y, WALKERS, idleFrame(skin, 'down')).setOrigin(0.5, 0.87)
    const label = this.add.text(position.x, position.y - 16, name, {
      resolution: 2, fontFamily: 'monospace', fontSize: '8px', fontStyle: 'bold', color: '#fff6e0',
      backgroundColor: '#203238', padding: { x: 3, y: 1 }
    }).setOrigin(0.5, 1)
    const signal = this.add.circle(position.x + 10, position.y - 13, 2, SIGNALS.idle)
    const walker: Walker = { sprite, shadow, label, signal, skin, facing: 'down' }
    this.pose(walker, position.x, position.y, 0, 0)
    return walker
  }

  private sendTo(resident: Resident, target: Point) {
    const current = cell(resident.sprite.x, resident.sprite.y)
    resident.route = findTownRoute(current, target)
    const midpoint = center(current)
    if (Math.hypot(midpoint.x - resident.sprite.x, midpoint.y - resident.sprite.y) > 1) {
      resident.route.unshift(midpoint)
    }
    resident.target = indexOf(target)
  }

  private moveResident(resident: Resident, time: number, elapsed: number) {
    if (!resident.route.length && resident.state !== 'working' && time >= resident.restUntil) {
      const next = COMMONS[resident.nextStop % COMMONS.length]
      this.sendTo(resident, next)
      resident.nextStop += 3
      resident.restUntil = time + 3700 + resident.slot * 140
    }
    const target = resident.route[0]
    if (!target) {
      this.pose(resident, resident.sprite.x, resident.sprite.y, 0, 0)
      return
    }

    const { x, y } = resident.sprite
    const dx = target.x - x
    const dy = target.y - y
    const distance = Math.hypot(dx, dy)
    const step = RESIDENT_SPEED * elapsed
    if (distance <= step) {
      resident.route.shift()
      this.pose(resident, target.x, target.y, dx, dy)
    } else {
      this.pose(resident, x + dx * step / distance, y + dy * step / distance, dx, dy)
    }
  }

  private movePlayer(elapsed: number) {
    const keys = this.bridge.input.keys
    const dx = Number(keys.has('arrowright') || keys.has('d')) - Number(keys.has('arrowleft') || keys.has('a'))
    const dy = Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'))
    const { x, y } = this.player.sprite
    const distance = PLAYER_SPEED * elapsed / (Math.hypot(dx, dy) || 1)
    const nx = canStand(x + dx * distance, y) ? x + dx * distance : x
    const ny = canStand(nx, y + dy * distance) ? y + dy * distance : y
    this.pose(this.player, nx, ny, nx - x, ny - y)
  }

  private updateView(target: TownTarget | null, resident: Resident | null | undefined, elapsed: number) {
    const { zoom, followSelection } = this.bridge.input.camera
    const camera = this.cameras.main
    if (camera.zoom !== zoom) camera.setZoom(zoom)
    let point: Point = this.player.sprite
    if (followSelection && resident) point = resident.sprite
    if (followSelection && target?.kind === 'place') {
      const site = DISTRICTS[target.id]
      point = center({ x: site.x + (HOUSE_WIDTH - 1) / 2, y: site.y + (HOUSE_HEIGHT - 1) / 2 })
    }

    const halfWidth = TOWN_WIDTH / (zoom * 2)
    const halfHeight = TOWN_HEIGHT / (zoom * 2)
    const x = Phaser.Math.Clamp(point.x, halfWidth, TOWN_WIDTH - halfWidth)
    const y = Phaser.Math.Clamp(point.y, halfHeight, TOWN_HEIGHT - halfHeight)
    const weight = Math.min(elapsed * 12, 1)
    this.cameraCenter.x = Phaser.Math.Clamp(Phaser.Math.Linear(this.cameraCenter.x, x, weight), halfWidth, TOWN_WIDTH - halfWidth)
    this.cameraCenter.y = Phaser.Math.Clamp(Phaser.Math.Linear(this.cameraCenter.y, y, weight), halfHeight, TOWN_HEIGHT - halfHeight)
    camera.centerOn(this.cameraCenter.x, this.cameraCenter.y)
  }

  private nearbyTarget(): { target: TownTarget; name: string } | null {
    let closest: { target: TownTarget; name: string } | null = null
    let range = TILE * 2
    const consider = (target: TownTarget, name: string, x: number, y: number) => {
      const distance = Phaser.Math.Distance.Between(this.player.sprite.x, this.player.sprite.y, x, y)
      if (distance >= range) return
      range = distance
      closest = { target, name }
    }
    for (const [id, resident] of this.residents) {
      consider({ kind: 'resident', id }, resident.label.text, resident.sprite.x, resident.sprite.y)
    }
    for (const id of DISTRICT_ORDER) {
      const site = DISTRICTS[id]
      const door = center(site.door)
      consider({ kind: 'place', id }, site.name, door.x, door.y)
    }
    const room = this.room
    return closest ?? (room ? { target: { kind: 'place', id: room }, name: DISTRICTS[room].name } : null)
  }

  private pose(walker: Walker, x: number, y: number, dx: number, dy: number) {
    walker.sprite.setPosition(x, y).setDepth(100 + y)
    walker.shadow.setPosition(x, y + 2).setDepth(10 + y)
    walker.label.setPosition(x, y - 16).setDepth(1000 + y)
    walker.signal.setPosition(x + walker.label.width / 2 + 3, y - 20).setDepth(1001 + y)
    if (dx || dy) {
      walker.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
      walker.sprite.anims.play(`${walker.skin}-${walker.facing}`, true)
    } else if (walker.sprite.anims.isPlaying) {
      walker.sprite.anims.stop()
      walker.sprite.setFrame(idleFrame(walker.skin, walker.facing))
    }
  }
}

function idleFrame(skin: number, direction: Direction): number {
  return skin * 12 + DIRECTIONS.indexOf(direction) * 3 + 1
}

// Adapted from the Phaser starter's createWalkingAnimation. See THIRD-PARTY-NOTICES.txt.
function registerWalkingAnimations(scene: Phaser.Scene) {
  for (let skin = 0; skin < 6; skin++) {
    for (const direction of DIRECTIONS) {
      const rest = idleFrame(skin, direction)
      scene.anims.create({
        key: `${skin}-${direction}`,
        frames: [rest - 1, rest, rest + 1].map((frame) => ({ key: WALKERS, frame })),
        frameRate: 7,
        repeat: -1,
        yoyo: true
      })
    }
  }
}
