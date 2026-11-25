# HEX testing handoff

The E1–E6 implementations are on `main` through `7135a11`. Static checks passed, the desktop built, and migration `0023` was applied on the original Windows machine. The recent functional suites and controlled benchmark sweeps are still pending. Cloud deployment is separate implementation work.

## Before running anything

- Pull `main` and follow the [setup instructions](../README.md#install). Use a machine with Docker for mission checks and E1–E5. Apply `uv run alembic upgrade head` from `apps/backend` to the local app database.
- Backend tests reset the schema in `HEXMIND_TEST_DATABASE_URL`. Point it at a disposable database such as `hexmind_test`. Check the previous Windows line-ending failure in `test_coordination.py` on a clean test setup.
- For live missions, start the CrewAI service and test connections in **Models & Keys**. If using `Start HEX.cmd`, set `HEXMIND_CREW_SERVICE_AUTOSTART=true` in `.env` before launch. Agree on a spending cap and keep API keys out of reports.

## Functional checks first

- From `apps/backend`, run `uv run python -m pytest` against the disposable database. From `apps/desktop`, run `node ../../node_modules/vitest/vitest.mjs run --maxWorkers=1` after installing the repo's desktop dependencies.
- Open **Town → Play sample** and check walking, zoom, and room and agent popups. Then open a real mission in Town and verify that activity arrives and a finished mission replays.
- On **Text Toolkit**, verify that parallel builders use separate worktrees, changes join in plan order, the summary starts after both helpers, and scratch worktrees are removed. Exercise a conflicting edit and verify that it is counted and retried serially.

## Benchmark runs

Start with one repeat in **Experiments** to check the setup. For reported sweeps, use benchmark `m3` and hold the workload, model settings, and budget steady except for the variable under study.

| Experiment | What to run |
|---|---|
| E1 | Compare the six patterns. Use Text Toolkit to exercise the parallel condition. |
| E2 | Compare serial and parallel on Text Toolkit. Report overlap, duplicate edits, merge failures, and serial retries. |
| E3 | Test connections with distinct cheap and top model routes. Review the pinned presets and compare cost, speed, pass rate, and escalations. |
| E4 | Compare Blackboard and messaging under the same plan and model setup. |
| E5 | Create worker or reviewer prompt and skill variants and compare them with the baseline. |
| E6 | Follow the [router evaluation commands](routing-labels.md#e6-router-comparison). The Claude-labeled pilot measures agreement with Claude. Use human-reviewed labels for the final comparison on the same holdout. The offline baseline needs no Docker. |

Export the dated report from **Experiments** and save the E6 JSON separately. Include commit, benchmark version, settings, pass rates, elapsed time, tokens, known costs, and any skipped or failed runs.

## Cloud deployment

Confirm the course rubric, host, and budget before provisioning. [PRD §18](../PRD.md#18-roadmap) proposes Google Cloud. Capture evidence of one complete hosted mission if cloud deployment is required.
