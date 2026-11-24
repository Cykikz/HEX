import { useEffect, useRef, useState } from 'react'

import type { TownTarget } from './layout'
import type { TownInput, TownSnapshot } from './world'

const MOVEMENT = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'])

interface Props {
  snapshot: TownSnapshot
  onInspect(target: TownTarget): void
}

export function TownStage({ snapshot, onInspect }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const model = useRef(snapshot)
  const inspect = useRef(onInspect)
  const input = useRef<TownInput>({ keys: new Set(), inspect: false })
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    model.current = snapshot
    inspect.current = onInspect
  }, [snapshot, onInspect])

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
        onReady: () => { if (!disposed) setState('ready') }
      })
    }).catch(() => { if (!disposed) setState('unavailable') })
    return () => {
      disposed = true
      game?.destroy(true)
    }
  }, [])

  return (
    <div
      className="town-stage"
      ref={viewport}
      tabIndex={0}
      role="region"
      aria-label="HEX Town. Use WASD or arrow keys to walk. Press E near a person or a doorway to inspect it."
      data-state={state}
      onPointerDown={() => viewport.current?.focus({ preventScroll: true })}
      onKeyDown={(event) => {
        const key = event.key.toLowerCase()
        if (MOVEMENT.has(key)) {
          event.preventDefault()
          input.current.keys.add(key)
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
          {state === 'loading' ? 'Opening town…' : 'The game canvas is unavailable.'}
        </p>
      )}
    </div>
  )
}
