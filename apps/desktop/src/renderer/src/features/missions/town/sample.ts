import type { AgentEvent } from '../../../generated/events'
import type { Mission, MissionFeature } from '../types'

const start = '2026-01-01T12:00:00.000Z'
const feature = (id: string, title: string, persona: string, file: string): MissionFeature => ({
  id, title, persona, status: 'done', attempts: 1, commit: null, description: title,
  preconditions: [], expected_behavior: [], contract_refs: [], extra_skills: [], target_files: [file]
})

const layout = feature('layout', 'Sketch the seed catalog', 'designer', 'design/seed-catalog.png')
const catalog = feature('catalog', 'Load the seed catalog', 'backend', 'src/catalog.ts')
const search = feature('search', 'Add search and filters', 'frontend', 'src/SeedCatalog.tsx')

export const SAMPLE_MISSION: Mission = {
  id: 'town-sample', project_id: 'town-sample', run_id: 'town-sample', title: 'Build a seed catalog',
  idea: 'Help gardeners find seeds by name and planting season.', status: 'completed', branch: 'sample',
  budget_usd: null, spent_usd: 0, tokens_in: 0, tokens_out: 0,
  created_at: start, started_at: start, finished_at: '2026-01-01T12:04:00.000Z',
  milestones: [{
    id: 'seed-catalog', title: 'Searchable seed catalog', status: 'passed',
    validators: ['qa', 'code-reviewer'], features: [layout, catalog, search]
  }],
  validation_contract: [], apply: null
}

type SampleEvent = {
  [Type in AgentEvent['type']]: Pick<Extract<AgentEvent, { type: Type }>, 'type' | 'payload'> & { agent_id?: string }
}[AgentEvent['type']]

const featureStep = (task: MissionFeature, status: 'in_progress' | 'done'): SampleEvent => ({
  type: 'feature_status_changed',
  payload: { feature_id: task.id, persona: task.persona, title: task.title, status, attempts: 1, commit: null }
})
const handoff = (task: MissionFeature): SampleEvent => ({
  type: 'handoff_recorded',
  payload: { feature_id: task.id, persona: task.persona, files_changed: task.target_files, model_used: 'Sample model', cost_usd: 0, tokens_in: 0, tokens_out: 0 }
})

const timeline: SampleEvent[] = [
  { type: 'mission_status_changed', payload: { status: 'running', previous: 'awaiting_approval', reason: null } },
  { type: 'agent_started', agent_id: 'pm', payload: { agent: 'pm', framework: 'adk', kind: 'planning', parent: null } },
  { type: 'milestone_status_changed', payload: { milestone_id: 'seed-catalog', title: 'Searchable seed catalog', status: 'active' } },
  { type: 'agent_finished', agent_id: 'pm', payload: { agent: 'pm', framework: 'adk', duration_ms: 12000, ok: true } },
  featureStep(layout, 'in_progress'), featureStep(catalog, 'in_progress'), handoff(layout), featureStep(layout, 'done'),
  featureStep(search, 'in_progress'), handoff(catalog), featureStep(catalog, 'done'),
  { type: 'tool_called', agent_id: 'frontend', payload: { tool: 'write_file', summary: search.target_files[0], ok: true } },
  handoff(search), featureStep(search, 'done'),
  { type: 'validator_started', payload: { validator: 'qa', milestone_id: 'seed-catalog', round: 1 } },
  { type: 'check_started', payload: { name: 'Catalog tests' } },
  { type: 'validator_started', payload: { validator: 'code-reviewer', milestone_id: 'seed-catalog', round: 1 } },
  { type: 'check_completed', payload: { name: 'Catalog tests', exit_code: 0, duration_ms: 2400 } },
  { type: 'validator_reported', payload: { validator: 'qa', milestone_id: 'seed-catalog', round: 1, verdict: 'pass', findings: 0, blocking: 0 } },
  { type: 'validator_reported', payload: { validator: 'code-reviewer', milestone_id: 'seed-catalog', round: 1, verdict: 'pass', findings: 0, blocking: 0 } },
  { type: 'mission_status_changed', payload: { status: 'completed', previous: 'running', reason: null } }
]

export const SAMPLE_EVENTS: AgentEvent[] = timeline.map((event, index) => ({
  ...event, agent_id: event.agent_id ?? null, schema_version: 8, event_id: `sample-${index}`,
  seq: index + 1, run_id: SAMPLE_MISSION.run_id, task_id: null,
  ts: new Date(Date.parse(start) + index * 12000).toISOString()
}))
