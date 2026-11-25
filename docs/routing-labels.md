# Routing labels

> **Current label set: written and labeled by Claude, not by a person (2026-11-22, PRD D85).** The project owner chose this instead of labeling 150 prompts by hand. `data/labels-claude.csv` holds 150 prompts (40 question, 45 code_edit, 35 new_workflow, 30 clarification; 55 low, 56 medium, 39 high), imported with `--labeler claude`. Results from experiment E6 must say so: they measure the routers against one model's judgement, not against human answers. To get a human answer key, label at least 30 of these prompts yourself and import them under your own name; `agreement claude <you>` then reports how closely the two agree, and a kappa below about 0.6 means these definitions need tightening before anyone trusts the labels.

Use human-reviewed labels for a human-grounded comparison. The bundled Claude labels can exercise the E6 implementation and measure agreement with that labeler.

**Target:** at least 150 labeled prompts by the end of M2. At least 30 of them must be labeled independently by two people, so we can report agreement.

## File format

The file is a UTF-8 CSV with a header row:

```csv
prompt,request_type,complexity
Add a delete button to each todo item,code_edit,low
Why does the filter reset when I reload?,question,low
Replace Google login with GitHub OAuth and update the session handling,code_edit,high
```

- `split` is an optional column (`train` or `test`). Leave it out unless you have a reason. Each prompt then gets a stable 80/20 split computed from its text, so both labelers' copies of a prompt land in the same split.
- Write prompts the way a developer would type them into H.E.X Mind, about a to-do style web app or similar projects. Vary the phrasing and include some vague requests.

## Labels

**request_type**

| Value | Use when the developer… |
|---|---|
| `question` | wants an explanation, answer or analysis, and no files should change |
| `code_edit` | wants existing project files changed |
| `new_workflow` | wants a new feature, app or larger build that creates new code |
| `clarification` | is too vague to act on safely (for example "make it better" or "fix the thing") |

**complexity** (judge the work itself, not how long the prompt is)

| Value | Meaning | Example |
|---|---|---|
| `low` | one isolated, bounded change (one file, a few lines) | "Rename the Save button to Add" |
| `medium` | related changes across several files or components | "Add due dates to todos and show them in the list" |
| `high` | architectural, many dependencies, security-sensitive, or a broad refactor | "Add user accounts with password reset" |

When unsure between two levels, pick the higher one and note it in your own copy of the file. Don't discuss your labels with the other labeler until the agreement numbers have been computed.

## Commands

Run these from `apps/backend`:

```sh
uv run python -m app.evaluation.labels import ../../data/labels-raghav.csv --labeler raghav
uv run python -m app.evaluation.labels agreement raghav shrey   # Cohen's kappa on shared prompts
uv run python -m app.evaluation.labels stats
```

Re-importing a file replaces that labeler's labels for those prompts.

Report kappa together with raw agreement. A kappa below about 0.6 means the definitions above need tightening before the labels can be trusted.

## E6 router comparison

Run the offline baseline from `apps/backend` with the optional `router-eval` extra. It reads the recorded split, fits TF-IDF and two logistic-regression classifiers on the training prompts, and reports performance on the held-out prompts.

```sh
uv run --extra router-eval python -m app.evaluation.router_baseline --labels-file ../../data/labels-claude.csv --label-source model
```

Use `--labeler NAME` to read stored labels or supply a human-reviewed CSV with `--label-source human-reviewed`. E6 records the label source, dataset hash, counts, per-class scores, exact-match accuracy and latency in JSON. Add `--out FILE` to save the report. Reports contain aggregates and a dataset hash.

To include the desktop app's ADK Router, add `--with-llm --connection NAME --model MODEL_ID` for a tested connection. This sends the held-out prompts to that model, with the same prompt-only input and Auto mode. It reports abstentions, model attempts and known estimated provider costs. Use `--limit N` for a smaller pilot applied to both comparators. Use one full held-out set for the reported comparison.
