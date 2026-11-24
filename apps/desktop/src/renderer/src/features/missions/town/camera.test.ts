import { describe, expect, it } from 'vitest'

import { locatePopup, OVERVIEW, panBy, TOWN_CENTER, zoomAt } from './camera'

describe('town camera gestures', () => {
  it('zooms around the pointer and clamps the result to the supported range', () => {
    const offset = { x: 100, y: -40 }
    const result = zoomAt(OVERVIEW, TOWN_CENTER, offset, 2.4)
    expect(result.zoom).toBe(2)
    expect(result.center).toEqual({ x: 338, y: 164 })
    expect(result.followSelection).toBe(false)
    expect(zoomAt(result, TOWN_CENTER, offset, 0.8)).toBe(OVERVIEW)
  })

  it('pans inside the town bounds and leaves the overview fixed', () => {
    const zoomed = zoomAt(OVERVIEW, TOWN_CENTER, { x: 0, y: 0 }, 2)
    expect(panBy(zoomed, TOWN_CENTER, { x: 1000, y: -1000 }).center).toEqual({ x: 432, y: 92 })
    expect(panBy(OVERVIEW, TOWN_CENTER, { x: 200, y: 200 })).toBe(OVERVIEW)
  })

  it('places a popup beside the point and keeps it inside the map near edges', () => {
    const stage = { width: 900, height: 540 }
    const popup = { width: 310, height: 120 }
    expect(locatePopup({ x: 180, y: 200 }, stage, popup)).toEqual({ x: 194, y: 150 })
    expect(locatePopup({ x: 880, y: 530 }, stage, popup)).toEqual({ x: 556, y: 412 })
    expect(locatePopup({ x: -420, y: -290 }, stage, popup)).toEqual({ x: 22, y: 8 })
  })
})
