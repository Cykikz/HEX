import { useEffect, useRef, useState } from 'react'

import { DISTRICTS, type District, type TownTarget } from './layout'
import type { TownCamera, TownInput, TownSnapshot } from './world'

const MOVEMENT = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'])

const OVERVIEW: TownCamera = { zoom: 1, followSelection: false }
const ZOOM_STEP = 0.25
const MAX_ZOOM = 2

interface Props {
  snapshot: TownSnapshot
  onInspect(target: TownTarget): void
}

export function TownStage({ snapshot, onInspect }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const model = useRef(snapshot)
  const inspect = useRef(onInspect)
  const input = useRef<TownInput>({ keys: new Set(), inspect: false, camera: OVERVIEW })
  const [camera, setCamera] = useState(OVERVIEW)
  const [nearby, setNearby] = useState<string | null>(null)
  const [room, setRoom] = useState<District | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    model.current = snapshot
    inspect.current = onInspect
  }, [snapshot, onInspect])

  useEffect(() => {
    input.current.camera = camera
  }, [camera])

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
        onInspect: (target) => inspect.current(target),
        onNearby: (name) => { if (!disposed) setNearby(name) },
        onLocation: (id) => { if (!disposed) setRoom(id) },
        onReady: () => { if (!disposed) setState('ready') }
      })
    }).catch(() => { if (!disposed) setState('unavailable') })
    return () => {
      disposed = true
      game?.destroy(true)
    }
  }, [])

  const changeZoom = (change: number) => {
    setCamera((view) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(1, view.zoom + change))
      return zoom === 1 ? OVERVIEW : { ...view, zoom }
    })
  }

  return (
    <div className="town-view">
      <div className="town-view__toolbar" role="group" aria-label="Town camera">
        <button type="button" className="button button--small" aria-label="Zoom out"
          disabled={state !== 'ready' || camera.zoom === 1} onClick={() => changeZoom(-ZOOM_STEP)}>-</button>
        <output className="town-view__zoom" aria-label="Zoom level">{Math.round(camera.zoom * 100)}%</output>
        <button type="button" className="button button--small" aria-label="Zoom in"
          disabled={state !== 'ready' || camera.zoom === MAX_ZOOM} onClick={() => changeZoom(ZOOM_STEP)}>+</button>
        <button type="button" className="button button--small" disabled={state !== 'ready' || camera.zoom === 1}
          onClick={() => setCamera(OVERVIEW)}>Overview</button>
        <button
          type="button"
          className="button button--small"
          disabled={state !== 'ready' || !snapshot.selected}
          aria-pressed={Boolean(snapshot.selected) && camera.followSelection}
          onClick={() => setCamera((view) => view.followSelection
            ? { ...view, followSelection: false }
            : { zoom: Math.max(view.zoom, 1.75), followSelection: true })}
        >
          Focus selection
        </button>
      </div>
      <div
        className="town-stage"
        ref={viewport}
        tabIndex={0}
        role="region"
        aria-label="HEX Town. Use WASD or arrow keys to walk. Press E near a person or a room to inspect it."
        data-state={state}
        data-room={room ?? undefined}
        onPointerDown={() => viewport.current?.focus({ preventScroll: true })}
        onKeyDown={(event) => {
          const key = event.key.toLowerCase()
          if (MOVEMENT.has(key)) {
            event.preventDefault()
            input.current.keys.add(key)
            if (camera.followSelection) setCamera((view) => ({ ...view, followSelection: false }))
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
      </div>
    </div>
  )
}
