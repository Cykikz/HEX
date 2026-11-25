import { useEffect, useState } from 'react'

import type { BackendConfig } from '../../../../../preload/api'
import type { AgentEvent } from '../../../generated/events'
import type { ApiClient } from '../../../lib/api'
import { MissionMap } from '../MissionMap'
import { statusLabel } from '../progress'
import type { Mission } from '../types'
import { useMission } from '../useMission'
import { SAMPLE_EVENTS, SAMPLE_MISSION } from './sample'

interface Props {
  api: ApiClient
  config: BackendConfig
  projectId: string | null
  missionId: string | null
  onSelectMission(id: string | null): void
  onOpenMission(id: string): void
}

const EMPTY_EVENTS: AgentEvent[] = []

export function TownScreen({ api, config, projectId, missionId, onSelectMission, onOpenMission }: Props) {
  const [list, setList] = useState<{ projectId: string; missions: Mission[]; error?: boolean } | null>(null)
  const selectedId = projectId ? missionId : null
  const view = useMission(api, config, selectedId, 'map')
  const currentList = list?.projectId === projectId ? list : null
  const missions = currentList?.missions ?? []
  const live = selectedId && view.mission?.id === selectedId ? view.mission : null
  const mission = live ?? missions.find(({ id }) => id === selectedId) ?? SAMPLE_MISSION
  const sample = mission === SAMPLE_MISSION
  const loadError = selectedId && (view.connection.state === 'closed' ? view.connection.detail : view.error)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    api.get<Mission[]>('/missions', { project_id: projectId })
      .then((missions) => { if (!cancelled) setList({ projectId, missions }) })
      .catch(() => { if (!cancelled) setList({ projectId, missions: [], error: true }) })
    return () => { cancelled = true }
  }, [api, projectId])

  const connection = !selectedId ? null
    : loadError ? 'Mission activity unavailable'
    : view.connection.state === 'reconnecting' ? 'Reconnecting to mission'
    : !live ? 'Connecting to mission'
    : view.connection.state === 'live' ? 'Activity connected' : 'Mission disconnected'

  return (
    <div className="town-screen">
      <div className="town-screen__source">
        <label>
          <span>Town activity</span>
          <select className="town-view__select" value={selectedId ?? ''} onChange={(event) => onSelectMission(event.currentTarget.value || null)}>
            <option value="">Sample mission</option>
            {selectedId && !missions.some(({ id }) => id === selectedId) && <option value={selectedId}>{live?.title ?? 'Selected mission'}</option>}
            {missions.map((item) => (
              <option key={item.id} value={item.id}>{item.title} · {statusLabel(item.id === live?.id ? live.status : item.status)}</option>
            ))}
          </select>
        </label>
        {selectedId && <button className="button button--small" type="button" onClick={() => onOpenMission(selectedId)}>Open mission details</button>}
        <p role="status">{loadError || connection || (currentList?.error ? 'Could not load workspace missions.' : null)}</p>
      </div>
      <MissionMap mission={mission} events={live ? view.events : sample ? SAMPLE_EVENTS : EMPTY_EVENTS} sample={sample} />
    </div>
  )
}
