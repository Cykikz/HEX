import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import type { AgentEvent } from '../../generated/events'
import { mapActivity, STATIONS, stationFor } from './mapActivity'
import { statusLabel } from './progress'
import { MemberDrawer } from './TeamRoster'
import type { Mission } from './types'
import '../../styles/mission-map.css'

const REPLAY_STEP_MS = 480
const REPLAYABLE = new Set<AgentEvent['type']>([
  'agent_started', 'agent_finished', 'feature_status_changed', 'milestone_status_changed',
  'check_started', 'check_completed', 'validator_started', 'validator_reported',
  'handoff_recorded', 'mission_status_changed', 'run_status_changed'
])
const APPEARANCE: Record<string, string> = {
  pm: '#f9c776', researcher: '#f2a6c6', backend: '#8be0b9', frontend: '#97c9fd',
  data: '#c0a4ff', designer: '#f4ad95', devops: '#8edbd6', qa: '#e9d78d',
  'code-reviewer': '#9eb0ff', security: '#f4a9ae'
}
const MEMBER_STATUS = { working: 'Working', idle: 'Waiting', done: 'Done', failed: 'Needs attention' }

interface Props {
  mission: Mission
  events: AgentEvent[]
  now: number
  onReview?: () => void
}

export function MissionMap({ mission, events, now, onReview }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [cursor, setCursor] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const settled = mission.status === 'completed' || mission.status === 'applied' || mission.status === 'kept'
    || mission.status === 'discarded' || mission.status === 'cancelled' || mission.status === 'failed'
  const frames = useMemo(() => events.flatMap((event, index) => REPLAYABLE.has(event.type) ? [index + 1] : []), [events])
  const frame = settled ? cursor : null
  const replaying = frame !== null
  const end = frames.length
  const eventCount = frame === null ? events.length : frames[frame - 1] ?? 0
  const visible = useMemo(() => replaying ? events.slice(0, eventCount) : events, [events, eventCount, replaying])
  const activity = useMemo(() => mapActivity(mission, visible, replaying), [mission, visible, replaying])
  const member = activity.team.find((agent) => agent.id === selected)
  const viewingAt = replaying ? Date.parse(visible.at(-1)?.ts ?? mission.created_at) : now

  useEffect(() => {
    if (!playing || frame === null || frame >= end) return
    const timer = window.setTimeout(() => {
      setCursor(frame + 1)
      if (frame + 1 === end) setPlaying(false)
    }, REPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [end, frame, playing])

  const startReplay = () => {
    setCursor(1)
    setPlaying(end > 1)
  }

  return (
    <section className="mission-map" aria-label="Agent map">
      <div className="mission-map__heading">
        <div>
          <h3>Agent map</h3>
          <p>{activity.milestoneTitle ?? 'Mission floor'} · {replaying ? 'Replay' : statusLabel(mission.status)}</p>
        </div>
        {settled && end > 0 && !replaying && (
          <button className="button button--small" type="button" onClick={startReplay}>Replay mission</button>
        )}
      </div>

      <div className="mission-map__viewport">
        <div className="mission-map__floor">
          {STATIONS.map((station) => {
            const agents = activity.team.filter((agent) => stationFor(agent.id) === station.id)
              .sort((a, b) => a.id.localeCompare(b.id))
            const active = station.id === 'sandbox' ? activity.pending.length > 0 : agents.some((agent) => agent.state === 'working')
            return (
              <div className="mission-map__station" data-station={station.id} data-active={active} key={station.id}>
                <h4>{station.label}</h4>
                <div className="mission-map__fixture" aria-hidden="true"><i /><i /><i /></div>
                <div className="mission-map__agents">
                  {agents.map((agent) => (
                    <button
                      className="mission-map__agent"
                      type="button"
                      key={agent.id}
                      data-state={agent.state}
                      aria-pressed={selected === agent.id}
                      aria-label={`${agent.name} · ${MEMBER_STATUS[agent.state]}`}
                      title={agent.doing}
                      style={{ '--uniform': APPEARANCE[agent.id] ?? '#c8dfb4' } as CSSProperties}
                      onClick={() => setSelected(selected === agent.id ? null : agent.id)}
                    >
                      <span className="mission-map__sprite" aria-hidden="true"><i /></span>
                      <span className="mission-map__agent-name">{agent.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

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
        <div>
          <strong>Sandbox</strong>
          <span>{activity.pending.length ? `Running ${[...new Set(activity.pending)].join(', ')}`
            : activity.lastCheck ? `${activity.lastCheck.name} · ${activity.lastCheck.state}` : 'No checks recorded'}</span>
        </div>
        <div>
          <strong>Latest handoff</strong>
          <span>{activity.handoff
            ? `${activity.handoff.persona} · ${activity.handoff.title} · ${activity.handoff.files} changed`
            : 'No handoff recorded'}</span>
        </div>
        {activity.status === 'needs_user' && <strong className="mission-map__attention">Needs you</strong>}
        {!replaying && onReview && (
          <button className="button button--small" type="button" onClick={onReview}>Open mission diff</button>
        )}
      </div>

      {member && <MemberDrawer member={member} now={viewingAt} onClose={() => setSelected(null)} />}
    </section>
  )
}
