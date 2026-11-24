import { useEffect, useMemo, useState } from 'react'

import type { AgentEvent } from '../../generated/events'
import { mapActivity, stationFor } from './mapActivity'
import { statusLabel } from './progress'
import { PERSONA_NAMES } from './team'
import { MemberDrawer } from './TeamRoster'
import { DISTRICTS, DISTRICT_ORDER, type TownTarget } from './town/layout'
import { TownStage } from './town/TownStage'
import type { TownResident } from './town/world'
import type { Mission } from './types'
import '../../styles/mission-map.css'

const REPLAY_STEP_MS = 900
const REPLAYABLE = new Set<AgentEvent['type']>([
  'agent_started', 'agent_finished', 'feature_status_changed', 'milestone_status_changed',
  'check_started', 'check_completed', 'validator_started', 'validator_reported',
  'handoff_recorded', 'mission_status_changed', 'run_status_changed'
])
const MEMBER_STATUS = { working: 'Working', idle: 'Waiting', done: 'Done', failed: 'Needs attention' }
const SETTLED = new Set<Mission['status']>(['completed', 'applied', 'kept', 'discarded', 'cancelled', 'failed'])

interface Props {
  mission: Mission
  events: AgentEvent[]
  now: number
  onReview?: () => void
}

export function MissionMap({ mission, events, now, onReview }: Props) {
  const [selected, setSelected] = useState<TownTarget | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const settled = SETTLED.has(mission.status)
  const frames = useMemo(() => events.flatMap((event, index) => REPLAYABLE.has(event.type) ? [index + 1] : []), [events])
  const frame = settled ? cursor : null
  const replaying = frame !== null
  const end = frames.length
  const eventCount = frame === null ? events.length : frames[frame - 1] ?? 0
  const visible = useMemo(() => replaying ? events.slice(0, eventCount) : events, [events, eventCount, replaying])
  const activity = useMemo(() => mapActivity(mission, visible, replaying), [mission, visible, replaying])
  const selectedResidentId = selected?.kind === 'resident' ? selected.id : null
  const selectedPlace = selected?.kind === 'place' ? selected.id : null
  const member = activity.team.find((agent) => agent.id === selectedResidentId)
  const viewingAt = replaying ? Date.parse(visible.at(-1)?.ts ?? mission.created_at) : now
  const residents = useMemo(() => {
    const known = new Map(activity.team.map((agent) => [agent.id, agent]))
    const ids = new Set(known.keys())
    if (!replaying) {
      ids.add('pm')
      for (const milestone of mission.milestones) {
        for (const feature of milestone.features) ids.add(feature.persona)
        for (const validator of milestone.validators) ids.add(validator)
      }
    }
    return [...ids].sort().map((id): TownResident => ({
      id,
      name: known.get(id)?.name ?? PERSONA_NAMES[id] ?? id,
      state: known.get(id)?.state ?? 'idle',
      district: stationFor(id)
    }))
  }, [activity.team, mission.milestones, replaying])
  const checking = activity.pending.length > 0
  const town = useMemo(() => ({ residents, selected, checking }), [residents, selected, checking])
  const selectedResident = residents.find((resident) => resident.id === selectedResidentId)
  const checkStatus = checking ? `Running ${[...new Set(activity.pending)].join(', ')}`
    : activity.lastCheck ? `${activity.lastCheck.name} · ${activity.lastCheck.state}` : 'No checks recorded'
  const handoffStatus = activity.handoff
    ? `${activity.handoff.persona} · ${activity.handoff.title} · ${activity.handoff.files} changed`
    : 'No handoff recorded'
  const district = selectedPlace ? DISTRICTS[selectedPlace] : null
  const placeMembers = selectedPlace
    ? activity.team.filter((agent) => stationFor(agent.id) === selectedPlace && agent.steps.length > 0)
    : []

  useEffect(() => {
    if (!playing || frame === null || frame >= end) return
    const timer = window.setTimeout(() => {
      setCursor(frame + 1)
      if (frame + 1 === end) setPlaying(false)
    }, REPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [end, frame, playing])

  const toggleTarget = (target: TownTarget) => {
    setSelected((previous) => previous?.kind === target.kind && previous.id === target.id ? null : target)
  }

  const startReplay = () => {
    setCursor(1)
    setPlaying(end > 1)
  }

  return (
    <section className="mission-map" aria-label="Agent map">
      <header className="mission-map__heading">
        <div>
          <h3>HEX Town</h3>
          <p>{activity.milestoneTitle ?? 'Mission commons'} · {replaying ? 'Replay' : statusLabel(mission.status)}</p>
        </div>
        {settled && end > 0 && !replaying && (
          <button className="button button--small" type="button" onClick={startReplay}>Replay mission</button>
        )}
      </header>

      <div className="mission-map__world">
        <TownStage snapshot={town} onInspect={setSelected} />
        <aside className="mission-map__guide" aria-label="Town guide">
          <div className="mission-map__places">
            <h4>Where work happens</h4>
            <div className="mission-map__place-list" role="group" aria-label="Mission workflow">
              {DISTRICT_ORDER.map((id) => {
                const place = DISTRICTS[id]
                const active = id === 'sandbox' ? checking : residents.some((resident) => resident.district === id && resident.state === 'working')
                return (
                  <button
                    key={id}
                    type="button"
                    className="mission-map__place"
                    data-place={id}
                    data-active={active}
                    aria-pressed={selectedPlace === id}
                    aria-label={place.name}
                    onClick={() => toggleTarget({ kind: 'place', id })}
                  >
                    <span>{place.step}</span>
                    <small>{place.name}</small>
                  </button>
                )
              })}
            </div>
            {district && (
              <section className="mission-map__place-detail" aria-label={district.name} data-place={selectedPlace}>
                <h5>{district.name}</h5>
                <p>{district.description}</p>
                {selectedPlace === 'sandbox' && <p className="mission-map__result">{checkStatus}</p>}
                {selectedPlace === 'build' && <p className="mission-map__result">{handoffStatus}</p>}
                {selectedPlace === 'planning' && activity.milestoneTitle && (
                  <p className="mission-map__result">Milestone · {activity.milestoneTitle}</p>
                )}
                {placeMembers.length > 0 && (
                  <ul>
                    {placeMembers.map((agent) => <li key={agent.id}><strong>{agent.name}</strong> {agent.doing}</li>)}
                  </ul>
                )}
              </section>
            )}
          </div>

          <h4>Residents</h4>
          <div className="mission-map__roster">
            {residents.map((resident) => (
              <button
                className="mission-map__resident"
                type="button"
                key={resident.id}
                data-state={resident.state}
                aria-pressed={selectedResidentId === resident.id}
                aria-label={`${resident.name} · ${MEMBER_STATUS[resident.state]}`}
                onClick={() => toggleTarget({ kind: 'resident', id: resident.id })}
              >
                <span>{resident.name}</span>
                <small>{MEMBER_STATUS[resident.state]}</small>
              </button>
            ))}
          </div>
          {member && <MemberDrawer member={member} now={viewingAt} onClose={() => setSelected(null)} autoScroll={false} />}
          {selectedResident && !member && <p className="mission-map__empty">No activity recorded for {selectedResident.name} yet.</p>}
        </aside>
      </div>
      <p className="mission-map__controls">
        <strong>You</strong> · Move with <kbd>WASD</kbd> or arrow keys. Click a person or room, or press <kbd>E</kbd> nearby to inspect.
      </p>

      {replaying && (
        <div className="mission-map__replay">
          <button
            className="button button--small"
            type="button"
            onClick={frame === end ? startReplay : () => setPlaying(!playing)}
          >
            {playing ? 'Pause replay' : frame === end ? 'Replay again' : 'Play replay'}
          </button>
          <input
            type="range"
            min={1}
            max={end}
            value={frame}
            aria-label="Replay position"
            aria-valuetext={`Step ${frame} of ${end}`}
            onChange={(event) => { setPlaying(false); setCursor(event.currentTarget.valueAsNumber) }}
          />
          <span>{frame} / {end}</span>
          <button className="button button--small" type="button" onClick={() => { setPlaying(false); setCursor(null) }}>
            Latest
          </button>
        </div>
      )}

      <div className="mission-map__summary">
        {selectedPlace !== 'sandbox' && <div><strong>Test Lab</strong><span>{checkStatus}</span></div>}
        {selectedPlace !== 'build' && <div><strong>Latest handoff</strong><span>{handoffStatus}</span></div>}
        {activity.status === 'needs_user' && <strong className="mission-map__attention">Needs you</strong>}
        {!replaying && onReview && (
          <button className="button button--small" type="button" onClick={onReview}>Open mission diff</button>
        )}
      </div>
    </section>
  )
}
