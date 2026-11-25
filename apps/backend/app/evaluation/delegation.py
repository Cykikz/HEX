"""Resolve E3 presets from tested model connections without changing team assignments."""

import json
import uuid
from decimal import Decimal
from hashlib import sha256
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.catalog.assigner import Pick, assign
from app.catalog.requirements import requirements_with_custom
from app.catalog.service import CatalogService
from app.db.models import Connection, ConnectionKey
from app.evaluation import missions
from app.providers.assignments import AssignmentIn, ModelRef
from app.providers.presets import PRESETS

REVIEWER = "code-reviewer"


class DelegationSetupError(ValueError):
    """The configured models cannot distinguish the planned E3 conditions yet."""


def _ref(pick: Pick) -> ModelRef:
    return ModelRef(connection_id=uuid.UUID(pick.connection_id), model=pick.model)


async def presets(
    session: AsyncSession,
    catalog: CatalogService,
) -> dict[str, dict[str, AssignmentIn]]:
    keyed = set(
        await session.scalars(
            select(ConnectionKey.connection_id).where(ConnectionKey.disabled.is_(False))
        )
    )
    tested = await session.scalars(
        select(Connection).where(Connection.enabled.is_(True), Connection.last_test_ok.is_(True))
    )
    available = {
        str(c.id) for c in tested if not PRESETS[c.provider_type].requires_key or c.id in keyed
    }
    entries = [
        entry
        for entry in await catalog.entries(session)
        if entry.connection_id in available
        and (entry.free or (entry.input_per_mtok is not None and entry.output_per_mtok is not None))
    ]
    if not entries:
        raise DelegationSetupError(
            "Connect and test a free model or model with known pricing in Models & Keys"
        )

    benchmarks = missions.load_apps()
    builders = {
        f["persona"] for app in benchmarks for m in app.plan["milestones"] for f in m["features"]
    }
    reviewers = {REVIEWER} | {
        name
        for app in benchmarks
        for m in app.plan["milestones"]
        for name in m.get("validators", [])
    }
    roles = sorted(builders | reviewers)
    requirements = requirements_with_custom()
    cheap_offers = assign(roles, entries, "cheapest", requirements)
    top_offers = assign(roles, entries, "best", requirements)
    cheap = {p.persona_id: AssignmentIn(primary=_ref(p.primary)) for p in cheap_offers if p.primary}
    top = {p.persona_id: AssignmentIn(primary=_ref(p.primary)) for p in top_offers if p.primary}
    if missing := (set(roles) - (cheap.keys() & top.keys())):
        raise DelegationSetupError(f"Connect a usable model for {', '.join(sorted(missing))}")

    mixed = {role: top[role] if role in reviewers else cheap[role] for role in roles}
    if mixed == cheap or mixed == top:
        raise DelegationSetupError(
            "Connect models that give the cheap and top presets distinct worker and reviewer routes"
        )

    conditions = {"all-cheap": cheap, "all-top": top, "mixed": mixed}
    upgrades = {p.persona_id: _ref(p.escalate) for p in cheap_offers if p.escalate}
    if builders & upgrades.keys():
        conditions["mixed-escalation"] = {
            role: assignment.model_copy(update={"escalate": upgrades.get(role)})
            if role in builders
            else assignment
            for role, assignment in mixed.items()
        }
    return conditions


def snapshot(routes: dict[str, AssignmentIn]) -> dict[str, Any]:
    return {role: settings.model_dump(mode="json") for role, settings in routes.items()}


def comparison_id(presets: dict[str, dict[str, AssignmentIn]], budget_usd: Decimal) -> str:
    data = json.dumps(
        [
            missions.BENCHMARK_VERSION,
            str(budget_usd.normalize()),
            {name: snapshot(routes) for name, routes in presets.items()},
        ],
        sort_keys=True,
    )
    return sha256(data.encode()).hexdigest()[:16]
