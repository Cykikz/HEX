import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

import { clampZoom, locatePopup, MAX_ZOOM, OVERVIEW, panBy, TOWN_CENTER, zoomAt, type Size, type TownCamera } from './camera'
import { DISTRICTS, DISTRICT_ORDER, TOWN_HEIGHT, TOWN_WIDTH, type District, type Point, type TownTarget } from './layout'
import type { TownInput, TownSnapshot } from './world'

const MOVEMENT = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'])
const ZOOM_STEP = 0.25
const DRAG_THRESHOLD = 5
const STATUS = { working: 'Working', idle: 'Waiting', done: 'Done', failed: 'Needs attention' }

interface Props {
  snapshot: TownSnapshot
  onInspect(target: TownTarget): void
  onDismiss(): void
  inspector: { title: string; content: ReactNode } | null
}

interface Drag {
  id: number
  at: Point
  moved: boolean
}

function overCanvas(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.town-stage__canvas') !== null
}

export function TownStage({ snapshot, onInspect, onDismiss, inspector }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const popupBounds = useRef<{ stage: Size; popup: Size; canvas: Size & { left: number; top: number } } | null>(null)
  const anchor = useRef<Point>({ x: 0.5, y: 0.5 })
  const popupTransform = useRef('')
  const drag = useRef<Drag | null>(null)
  const model = useRef(snapshot)
  const callbacks = useRef({ onInspect, onDismiss })
  const input = useRef<TownInput>({
    keys: new Set(), inspect: false, camera: OVERVIEW, displayedCenter: TOWN_CENTER, pointerDragged: false
  })
  const [camera, setCamera] = useState(OVERVIEW)
  const [dragging, setDragging] = useState(false)
  const [nearby, setNearby] = useState<string | null>(null)
  const [room, setRoom] = useState<District | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const showInspector = inspector !== null

  const applyCamera = useCallback((next: TownCamera) => {
    input.current.camera = next
    setCamera(next)
  }, [])

  const positionPopup = useCallback(() => {
    const bounds = popupBounds.current
    const element = popup.current
    if (!bounds || !element) return
    const point = locatePopup({
      x: bounds.canvas.left + anchor.current.x * bounds.canvas.width,
      y: bounds.canvas.top + anchor.current.y * bounds.canvas.height
    }, bounds.stage, bounds.popup)
    const transform = `translate3d(${point.x}px, ${point.y}px, 0)`
    if (transform !== popupTransform.current) {
      element.style.transform = transform
      popupTransform.current = transform
    }
  }, [])

  useEffect(() => {
    model.current = snapshot
    callbacks.current = { onInspect, onDismiss }
  }, [snapshot, onInspect, onDismiss])

  useEffect(() => {
    const element = popup.current
    const stage = viewport.current
    if (!showInspector || !element || !stage) return
    popupTransform.current = ''
    const canvas = mount.current?.querySelector('canvas')
    const measure = () => {
      const stageBox = stage.getBoundingClientRect()
      const canvasBox = canvas?.getBoundingClientRect()
      const stageSize = { width: stage.clientWidth, height: stage.clientHeight }
      popupBounds.current = {
        stage: stageSize,
        popup: { width: element.offsetWidth, height: element.offsetHeight },
        canvas: canvasBox ? {
          left: canvasBox.left - stageBox.left - stage.clientLeft,
          top: canvasBox.top - stageBox.top - stage.clientTop,
          width: canvasBox.width,
          height: canvasBox.height
        } : { ...stageSize, left: 0, top: 0 }
      }
      positionPopup()
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(stage)
    observer?.observe(element)
    if (canvas) observer?.observe(canvas)
    return () => {
      observer?.disconnect()
      popupBounds.current = null
    }
  }, [showInspector, positionPopup, state])

  useEffect(() => {
    const stage = viewport.current
    if (!stage) return
    const wheel = (event: WheelEvent) => {
      const bounds = mount.current?.querySelector('canvas')?.getBoundingClientRect()
      if (!bounds?.width || !overCanvas(event.target)) return
      event.preventDefault()
      const { camera: view, displayedCenter } = input.current
      const xScale = TOWN_WIDTH / bounds.width
      const yScale = TOWN_HEIGHT / bounds.height
      const units = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? bounds.height : 1
      if (!event.ctrlKey && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) {
        applyCamera(panBy(view, displayedCenter, {
          x: (event.deltaX || event.deltaY) * units * xScale,
          y: event.shiftKey ? 0 : event.deltaY * units * yScale
        }))
        return
      }
      const sensitivity = event.ctrlKey ? 0.007 : 0.0017
      const offset = {
        x: (event.clientX - bounds.left) * xScale - TOWN_WIDTH / 2,
        y: (event.clientY - bounds.top) * yScale - TOWN_HEIGHT / 2
      }
      applyCamera(zoomAt(view, displayedCenter, offset, view.zoom * Math.exp(-event.deltaY * units * sensitivity)))
    }
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => stage.removeEventListener('wheel', wheel)
  }, [applyCamera])

  useEffect(() => {
    const parent = mount.current
    if (!parent || typeof CanvasRenderingContext2D === 'undefined') {
      setState('unavailable')
      return
    }
    let disposed = false
    let game: ReturnType<typeof import('./world').openTown> | undefined
    void import('./world').then(({ openTown }) => {
      if (disposed) return
      game = openTown(parent, {
        snapshot: () => model.current,
        input: input.current,
        onInspect: (target) => callbacks.current.onInspect(target),
        onDismiss: () => callbacks.current.onDismiss(),
        onAnchor: (point) => { anchor.current = point; positionPopup() },
        onNearby: (name) => { if (!disposed) setNearby(name) },
        onLocation: (id) => { if (!disposed) setRoom(id) },
        onReady: () => { if (!disposed) setState('ready') }
      })
    }).catch(() => { if (!disposed) setState('unavailable') })
    return () => {
      disposed = true
      game?.destroy(true)
    }
  }, [positionPopup])

  const changeZoom = (change: number) => {
    const view = input.current.camera
    const zoom = clampZoom(view.zoom + change)
    applyCamera(zoom === 1 ? OVERVIEW : { ...view, zoom })
  }
  const focusSelection = () => {
    const view = input.current.camera
    applyCamera(view.followSelection
      ? { ...view, followSelection: false }
      : { zoom: Math.max(view.zoom, 1.75), followSelection: true, center: null })
  }
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || !overCanvas(event.target)) return
    viewport.current?.focus({ preventScroll: true })
    input.current.pointerDragged = false
    drag.current = { id: event.pointerId, at: { x: event.clientX, y: event.clientY }, moved: false }
  }
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const gesture = drag.current
    if (!gesture || event.pointerId !== gesture.id) return
    const x = gesture.at.x - event.clientX
    const y = gesture.at.y - event.clientY
    if (!gesture.moved) {
      if (Math.hypot(x, y) < DRAG_THRESHOLD) return
      gesture.moved = true
      input.current.pointerDragged = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(true)
    }
    const canvas = mount.current?.querySelector('canvas')
    if (!canvas?.clientWidth || !canvas.clientHeight) return
    gesture.at = { x: event.clientX, y: event.clientY }
    const { camera: view, displayedCenter } = input.current
    applyCamera(panBy(view, displayedCenter, { x: x * TOWN_WIDTH / canvas.clientWidth, y: y * TOWN_HEIGHT / canvas.clientHeight }))
  }
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerId !== drag.current?.id) return
    drag.current = null
    setDragging(false)
  }
  const selectValue = snapshot.selected ? `${snapshot.selected.kind}:${snapshot.selected.id}` : ''

  return (
    <div className="town-view">
      <div className="town-view__toolbar" role="group" aria-label="Town camera">
        <button type="button" className="button button--small" aria-label="Zoom out"
          disabled={state !== 'ready' || camera.zoom === 1} onClick={() => changeZoom(-ZOOM_STEP)}>-</button>
        <output className="town-view__zoom" aria-label="Zoom level">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" className="button button--small" aria-label="Zoom in"
          disabled={state !== 'ready' || camera.zoom === MAX_ZOOM} onClick={() => changeZoom(ZOOM_STEP)}>+</button>
        <button type="button" className="button button--small" disabled={state !== 'ready' || camera.zoom === 1}
          onClick={() => applyCamera(OVERVIEW)}>Overview</button>
        <button
          type="button"
          className="button button--small"
          disabled={state !== 'ready' || !snapshot.selected}
          aria-pressed={Boolean(snapshot.selected) && camera.followSelection}
          onClick={focusSelection}
        >
          Focus selection
        </button>
        <select
          className="town-view__select"
          aria-label="Inspect a room or resident"
          value={selectValue}
          onChange={(event) => {
            const value = event.currentTarget.value
            const place = DISTRICT_ORDER.find((id) => value === `place:${id}`)
            const resident = snapshot.residents.find(({ id }) => value === `resident:${id}`)
            if (place) onInspect({ kind: 'place', id: place })
            else if (resident) onInspect({ kind: 'resident', id: resident.id })
            else onDismiss()
          }}
        >
          <option value="">Inspect...</option>
          <optgroup label="Rooms">
            {DISTRICT_ORDER.map((id) => <option key={id} value={`place:${id}`}>{DISTRICTS[id].name}</option>)}
          </optgroup>
          <optgroup label="Residents">
            {snapshot.residents.map(({ id, name, state: memberState }) => (
              <option key={id} value={`resident:${id}`}>{name} — {STATUS[memberState]}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div
        className="town-stage"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="HEX Town. Scroll or pinch to zoom and drag to pan. Use WASD or arrow keys to walk."
        data-state={state}
        data-room={room ?? undefined}
        data-dragging={dragging}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={(event) => { if (!drag.current?.moved) endDrag(event) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && inspector) {
            event.stopPropagation()
            onDismiss()
            viewport.current?.focus({ preventScroll: true })
          }
          if (event.target !== event.currentTarget) return
          const key = event.key.toLowerCase()
          if (MOVEMENT.has(key)) {
            event.preventDefault()
            input.current.keys.add(key)
            const view = input.current.camera
            if (view.followSelection || view.center) applyCamera({ ...view, followSelection: false, center: null })
          } else if (key === 'e' && !event.repeat) {
            input.current.inspect = true
          }
        }}
        onKeyUp={(event) => input.current.keys.delete(event.key.toLowerCase())}
        onBlur={() => input.current.keys.clear()}
      >
        <div className="town-stage__canvas" ref={mount} aria-hidden="true" />
        {state !== 'ready' && (
          <p className="town-stage__placeholder" role="status">
            {state === 'loading' ? 'Opening town...' : 'The game canvas is unavailable.'}
          </p>
        )}
        {state === 'ready' && room && <p className="town-stage__place">{DISTRICTS[room].name}</p>}
        {state === 'ready' && nearby && (
          <p className="town-stage__nearby"><kbd>E</kbd> Inspect {nearby}</p>
        )}
        {inspector && (
          <div className="town-popup" role="dialog" aria-label={inspector.title} ref={popup}
            onClick={(event) => {
              if (event.target instanceof Element && event.target.closest('button[aria-label="Close"]')) {
                viewport.current?.focus({ preventScroll: true })
              }
            }}>
            {inspector.content}
          </div>
        )}
      </div>
    </div>
  )
}
