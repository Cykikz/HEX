"""E6: score a local classifier and optionally the production ADK Router on a held-out split."""

import argparse
import asyncio
import json
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from time import perf_counter
from typing import Any

from sqlalchemy import select

from app.config import REPO_ROOT, get_settings
from app.db.models import Connection, RoutingLabel
from app.db.session import create_engine, create_sessionmaker
from app.evaluation.labels import COMPLEXITIES, REQUEST_TYPES, Label, normalize_prompt, parse_csv

MODEL_LABELS = REPO_ROOT / "data" / "labels-claude.csv"
ABSTAINED = "<no prediction>"


@dataclass(frozen=True)
class Prediction:
    request_type: str | None
    complexity: str | None
    latency_ms: float


def dataset_id(labels: Sequence[Label]) -> str:
    rows = sorted(
        (normalize_prompt(row.prompt).casefold(), row.request_type, row.complexity, row.split)
        for row in labels
    )
    return sha256(json.dumps(rows, ensure_ascii=False).encode()).hexdigest()


def split_data(labels: Sequence[Label]) -> tuple[list[Label], list[Label]]:
    """Keep the recorded split and reject duplicates even across different DB rows."""
    splits: dict[str, list[Label]] = {"train": [], "test": []}
    seen: set[str] = set()
    for row in sorted(labels, key=lambda item: normalize_prompt(item.prompt).casefold()):
        key = normalize_prompt(row.prompt).casefold()
        if not key or key in seen:
            raise ValueError("the label set contains an empty or duplicate prompt")
        if (
            row.split not in splits
            or row.request_type not in REQUEST_TYPES
            or row.complexity not in COMPLEXITIES
        ):
            raise ValueError("the label set contains an unsupported split or class")
        seen.add(key)
        splits[row.split].append(row)
    train, held_out = splits["train"], splits["test"]
    if not held_out:
        raise ValueError("the label set must contain held-out prompts")
    if {r.request_type for r in train} != REQUEST_TYPES or {
        r.complexity for r in train
    } != COMPLEXITIES:
        raise ValueError("the training split must contain every request type and complexity class")
    return train, held_out


def baseline(train: Sequence[Label], held_out: Sequence[Label]) -> tuple[list[Prediction], float]:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression

    started = perf_counter()
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    features = vectorizer.fit_transform([row.prompt for row in train])
    intent = LogisticRegression(max_iter=1000, random_state=0).fit(
        features, [row.request_type for row in train]
    )
    complexity = LogisticRegression(max_iter=1000, random_state=0).fit(
        features, [row.complexity for row in train]
    )
    fit_ms = (perf_counter() - started) * 1000
    predictions = []
    for row in held_out:
        started = perf_counter()
        features = vectorizer.transform([row.prompt])
        request_type, size = str(intent.predict(features)[0]), str(complexity.predict(features)[0])
        predictions.append(Prediction(request_type, size, (perf_counter() - started) * 1000))
    return predictions, fit_ms


def score(held_out: Sequence[Label], predictions: Sequence[Prediction]) -> dict[str, Any]:
    from sklearn.metrics import accuracy_score, classification_report

    def head(expected: list[str], predicted: list[str], classes: set[str]) -> dict[str, Any]:
        report = classification_report(
            expected, predicted, labels=sorted(classes), output_dict=True, zero_division=0
        )
        return {
            "accuracy": accuracy_score(expected, predicted),
            "macro_f1": report["macro avg"]["f1-score"],
            "per_class": {value: report[value] for value in sorted(classes)},
        }

    return {
        "request_type": head(
            [r.request_type for r in held_out],
            [p.request_type or ABSTAINED for p in predictions],
            REQUEST_TYPES,
        ),
        "complexity": head(
            [r.complexity for r in held_out],
            [p.complexity or ABSTAINED for p in predictions],
            COMPLEXITIES,
        ),
        "exact_match": sum(
            (r.request_type, r.complexity) == (p.request_type, p.complexity)
            for r, p in zip(held_out, predictions, strict=True)
        )
        / len(held_out),
        "abstentions": sum(p.request_type is None for p in predictions),
        "median_latency_ms": statistics.median(p.latency_ms for p in predictions),
    }


async def stored_labels(labeler: str) -> list[Label]:
    engine = create_engine(get_settings().database_url)
    try:
        async with create_sessionmaker(engine)() as session:
            rows = await session.scalars(
                select(RoutingLabel).where(RoutingLabel.labeler == labeler)
            )
            return [
                Label(row.prompt, row.label_type, row.label_complexity, row.split) for row in rows
            ]
    finally:
        await engine.dispose()


async def compare_llm(
    held_out: Sequence[Label], *, connection_name: str, model: str
) -> dict[str, Any]:
    from app.agents.adk_llm import HexAdkLlm
    from app.catalog.service import CatalogService
    from app.orchestration.adk import run_adk
    from app.orchestration.conversation import make_router_agent, read_router_decision
    from app.providers.base import LLMResult
    from app.providers.factory import build_providers
    from app.providers.router import CallContext
    from app.providers.routing import Route, Target
    from app.providers.secrets import make_key_store

    settings = get_settings().model_copy(update={"response_cache": "off"})
    engine = create_engine(settings.database_url)
    sessionmaker = create_sessionmaker(engine)
    adapters = []
    try:
        async with sessionmaker() as session:
            connection = await session.scalar(
                select(Connection).where(Connection.name == connection_name)
            )
        if (
            not connection
            or not connection.enabled
            or not connection.last_test_ok
            or model not in connection.models
        ):
            raise ValueError("select an enabled, tested connection and one of its listed models")
        providers, adapters = build_providers(
            settings,
            sessionmaker,
            make_key_store(settings.key_store),
            CatalogService(settings.data_dir / "catalog"),
        )
        route = Route((Target(connection.id, model),))
        predictions: list[Prediction] = []
        calls: list[LLMResult] = []
        for row in held_out:
            llm = HexAdkLlm(
                router=providers,
                ctx=CallContext(route=route),
                purpose="router",
                max_tokens=1500,
                on_result=calls.append,
            )
            started = perf_counter()
            state, _ = await run_adk(
                make_router_agent(llm),
                message=row.prompt,
                state={
                    "context_text": f"### The user's latest message\n{row.prompt}",
                    "mode": "auto",
                },
            )
            decision = read_router_decision(state)
            predictions.append(
                Prediction(
                    decision.request_type if decision else None,
                    decision.complexity if decision else None,
                    (perf_counter() - started) * 1000,
                )
            )
        priced = [call.est_cost_usd for call in calls if call.est_cost_usd is not None]
        return {
            **score(held_out, predictions),
            "connection": connection_name,
            "model": model,
            "router_calls": len(calls),
            "provider_attempts": sum(call.attempts for call in calls),
            "known_cost_usd": str(sum(priced, Decimal(0))),
            "calls_without_cost_estimate": len(calls) - len(priced),
        }
    finally:
        try:
            await asyncio.gather(*(adapter.aclose() for adapter in adapters))
        finally:
            await engine.dispose()


async def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--labels-file", type=Path, help="CSV with prompt, request_type and complexity"
    )
    source.add_argument("--labeler", help="Use this labeler's rows from the local database")
    parser.add_argument("--label-source", choices=("human-reviewed", "model"), required=True)
    parser.add_argument(
        "--with-llm", action="store_true", help="Send held-out prompts to the selected model"
    )
    parser.add_argument("--connection", help="Saved, tested connection name for live comparison")
    parser.add_argument("--model", help="Exact model ID for live comparison")
    parser.add_argument(
        "--limit", type=int, help="Score both routers on this many held-out prompts"
    )
    parser.add_argument("--out", type=Path, help="Write the JSON report to this file")
    args = parser.parse_args(argv)
    if args.with_llm and not (args.connection and args.model):
        parser.error("--with-llm requires --connection and --model")
    if not args.with_llm and (args.connection or args.model):
        parser.error("--connection and --model require --with-llm")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be positive")

    try:
        labels = (
            parse_csv(args.labels_file.read_text(encoding="utf-8-sig"))
            if args.labels_file
            else await stored_labels(args.labeler)
        )
        digest = dataset_id(labels)
        if args.label_source == "human-reviewed" and (
            (args.labeler or "").casefold() == "claude"
            or (
                MODEL_LABELS.exists()
                and digest == dataset_id(parse_csv(MODEL_LABELS.read_text(encoding="utf-8-sig")))
            )
        ):
            raise ValueError("the bundled Claude labels must be reported with --label-source model")
        train, held_out_all = split_data(labels)
        held_out = held_out_all[: args.limit]
        predictions, fit_ms = baseline(train, held_out)
        report = {
            "experiment": "E6",
            "dataset_sha256": digest,
            "label_source": args.label_source,
            "interpretation": (
                "Agreement with model labels."
                if args.label_source == "model"
                else "Agreement with the supplied human-reviewed labels."
            ),
            "training_prompts": len(train),
            "available_held_out_prompts": len(held_out_all),
            "scored_prompts": len(held_out),
            "scope": "Prompt only, Auto mode",
            "baseline": {
                **score(held_out, predictions),
                "fit_ms": fit_ms,
                "provider_cost_usd": "0",
            },
            "llm_router": await compare_llm(
                held_out, connection_name=args.connection, model=args.model
            )
            if args.with_llm
            else None,
        }
    except ModuleNotFoundError as exc:
        if exc.name == "sklearn":
            parser.error("install the optional dependency with uv run --extra router-eval")
        raise
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    serialized = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.out:
        args.out.write_text(serialized, encoding="utf-8")
    else:
        print(serialized, end="")


if __name__ == "__main__":
    asyncio.run(main())
