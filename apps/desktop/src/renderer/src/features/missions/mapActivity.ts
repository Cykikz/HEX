import type { AgentEvent } from '../../generated/events'
import { PERSONA_NAMES, personaOf, teamActivity, type MemberState } from './team'
import type { District } from './town/layout'
import type { Mission } from './types'

export function stationFor(persona: string): District {
  if (persona === 'pm' || persona === 'researcher') return 'planning'
  if (persona === 'qa' || persona === 'code-reviewer' || persona === 'security') return 'review'
  return 'build'
}

/** Shared events describe a station. A preceding agent event does not establish who owns them. */
export function mapActivity(mission: Mission, events: AgentEvent[], replaying: boolean) {
  const checks = new Map<string, string>()
  const blockers = new Map<string, string>()
  const assignments = new Map<string, string>()
  const modelCalls = new Map<string, { provider: string; model: string; latencyMs: number; ok: boolean }>()
  const validators = new Map<string, { state: MemberState; doing: string }>()
  const features = new Map(mission.milestones.flatMap((milestone) =>
    milestone.features.map((feature) => [feature.id, feature.title] as const)))
  const milestones = new Map(mission.milestones.map((milestone) => [milestone.id, milestone.title]))
  let lastCheck: { name: string; state: 'passed' | 'failed' | 'interrupted'; exitCode?: number; durationMs?: number } | undefined
  let handoff: { persona: string; title: string; files: string[] } | undefined
  let milestoneTitle: string | undefined
  let status: string = replaying ? 'draft' : mission.status

  const attributed = events.filter((event) => {
    switch (event.type) {
      case 'run_status_changed':
        if (replaying && event.payload.status === 'scoping') status = 'scoping'
        return false
      case 'mission_status_changed': {
        const nextStatus = event.payload.status
        if (replaying) status = nextStatus
        if (nextStatus !== 'running' && nextStatus !== 'scoping') {
          const lastPending = [...checks.values()].at(-1)
          if (lastPending) lastCheck = { name: lastPending, state: 'interrupted' }
          checks.clear()
          for (const [id, validator] of validators) {
            if (validator.state === 'working') validators.set(id, { state: 'idle', doing: validator.doing })
          }
        }
        return false
      }
      case 'milestone_status_changed':
        milestoneTitle = event.payload.title
        return false
      case 'feature_status_changed':
        features.set(event.payload.feature_id, event.payload.title)
        assignments.set(event.payload.persona, event.payload.title)
        if (replaying && event.payload.status === 'in_progress') status = 'running'
        return true
      case 'llm_call_completed': {
        const persona = personaOf(event.agent_id)
        if (!persona) return false
        const { provider, model, latency_ms, ok } = event.payload
        modelCalls.set(persona, { provider, model, latencyMs: latency_ms, ok })
        return true
      }
      case 'handoff_recorded': {
        const { persona, feature_id, files_changed } = event.payload
        handoff = { persona: PERSONA_NAMES[persona] ?? persona, title: features.get(feature_id) ?? feature_id, files: files_changed }
        return true
      }
      case 'need_raised':
        blockers.set(event.payload.need_id, event.payload.summary)
        return personaOf(event.agent_id) !== null
      case 'need_answered':
        blockers.delete(event.payload.need_id)
        return false
      case 'check_started':
        checks.set(`${event.task_id ?? ''}:${event.payload.name}:${event.seq}`, event.payload.name)
        return false
      case 'check_completed': {
        const { name, exit_code, duration_ms } = event.payload
        const prefix = `${event.task_id ?? ''}:${name}:`
        const prior = [...checks.keys()].find((key) => key.startsWith(prefix))
        if (prior !== undefined) checks.delete(prior)
        lastCheck = {
          name, state: exit_code === 0 ? 'passed' : exit_code === null ? 'interrupted' : 'failed',
          exitCode: exit_code ?? undefined, durationMs: duration_ms ?? undefined
        }
        return false
      }
      case 'validator_started':
      case 'validator_reported': {
        const { validator, milestone_id } = event.payload
        const title = milestones.get(milestone_id) ?? milestone_id
        if (event.type === 'validator_started') {
          validators.set(validator, { state: 'working', doing: `Validating ${title}` })
        } else {
          const verdict = event.payload.verdict
          const result = verdict === 'pass' ? 'Passed' : verdict === 'fail' ? 'Failed' : 'Needs you'
          validators.set(validator, { state: verdict === 'pass' ? 'done' : 'failed', doing: `${result} · ${title}` })
        }
        return true
      }
      default:
        return personaOf(event.agent_id) !== null
    }
  })

  const active = status === 'running' || status === 'scoping'
  const team = teamActivity(attributed, true).map((member) => {
    const doing = member.state === 'working' && member.steps.length === 0 ? 'Started work' : member.doing
    const updated = { ...member, doing, ...validators.get(member.id) }
    return updated.state === 'working' && !active ? { ...updated, state: 'idle' as const } : updated
  })
  const inFlight = [...checks.values()]
  const lastPending = inFlight.at(-1)
  if (!active && lastPending) lastCheck = { name: lastPending, state: 'interrupted' }

  return {
    team,
    pending: active ? inFlight : [],
    lastCheck,
    handoff,
    assignments,
    modelCalls,
    blockers: [...blockers].map(([id, summary]) => ({ id, summary })),
    status,
    milestoneTitle: replaying ? milestoneTitle : mission.milestones.find((milestone) => milestone.status === 'active')?.title ?? milestoneTitle
  }
}
