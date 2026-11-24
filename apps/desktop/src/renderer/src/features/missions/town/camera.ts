import { TOWN_HEIGHT, TOWN_WIDTH, type Point } from './layout'

export const MAX_ZOOM = 2
export const TOWN_CENTER = { x: TOWN_WIDTH / 2, y: TOWN_HEIGHT / 2 }

export interface TownCamera {
  zoom: number
  followSelection: boolean
  center: Point | null
}

export const OVERVIEW: TownCamera = { zoom: 1, followSelection: false, center: null }

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, zoom))
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(minimum, maximum), Math.max(minimum, value))
}

export function clampCenter(point: Point, zoom: number): Point {
  const halfWidth = TOWN_WIDTH / (2 * zoom)
  const halfHeight = TOWN_HEIGHT / (2 * zoom)
  return { x: clamp(point.x, halfWidth, TOWN_WIDTH - halfWidth), y: clamp(point.y, halfHeight, TOWN_HEIGHT - halfHeight) }
}

/** Offsets are measured from the center of the canvas, in screen-space game units. */
export function zoomAt(view: TownCamera, displayedCenter: Point, offset: Point, requestedZoom: number): TownCamera {
  const zoom = clampZoom(requestedZoom)
  if (zoom === view.zoom) return view
  if (zoom === 1) return OVERVIEW
  const center = view.center ?? displayedCenter
  const ratio = 1 / view.zoom - 1 / zoom
  return {
    zoom,
    followSelection: false,
    center: clampCenter({ x: center.x + offset.x * ratio, y: center.y + offset.y * ratio }, zoom)
  }
}

/** Panning deltas are camera travel, in screen-space game units. */
export function panBy(view: TownCamera, displayedCenter: Point, delta: Point): TownCamera {
  if (view.zoom === 1) return view
  const center = view.center ?? displayedCenter
  return {
    zoom: view.zoom,
    followSelection: false,
    center: clampCenter({ x: center.x + delta.x / view.zoom, y: center.y + delta.y / view.zoom }, view.zoom)
  }
}

export interface Size { width: number; height: number }

/** Keep the popup beside the selection where space permits and inside the visible stage. */
export function locatePopup(anchor: Point, stage: Size, popup: Size): Point {
  const inset = 8
  const gap = 14
  const x = clamp(anchor.x, inset, stage.width - inset)
  const y = clamp(anchor.y, inset, stage.height - inset)
  const left = x + gap + popup.width <= stage.width - inset ? x + gap : x - popup.width - gap
  return {
    x: Math.round(clamp(left, inset, stage.width - popup.width - inset)),
    y: Math.round(clamp(y - Math.min(50, popup.height / 2), inset, stage.height - popup.height - inset))
  }
}
