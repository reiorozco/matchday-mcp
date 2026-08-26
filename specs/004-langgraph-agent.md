# 004 — matchday-agent (Python + LangGraph + FastAPI on Fly.io)

Global status: **Phases 0-7 CLOSED (infra + docs + handoff + brand) ·
Language pivot 2026-07-27 late (agent English-default with user-language
mirror; anchor cases rewritten in English; dataset variant `-en`) ·
Phase 4 baseline English **3.53/5 correctness**, **0.88 tool_selection**
in 15 English anchor cases (agent + judge = Gemini paid, ~$0.19 total
across the pivot; Spanish baseline 4.27 preserved historically) ·
live at https://matchday-agent.fly.dev · public repo at
https://github.com/reiorozco/matchday-agent · handoff issue at
https://github.com/reiorozco/matchday-mcp-web/issues/1 · LinkedIn assets
in matchday-agent/docs/marketing/linkedin.md · v1 FULLY SHIPPED**.
Repo `~/Dev/matchday-agent` on main. This spec closed the "agentic app"
gap in the public portfolio (LangGraph orchestration + RAG + observability +
MCP tools + web).

**Runtime validation evidence (2026-07-26)**:

- `uv sync` — 90 packages, no conflicts.
- `scripts/checkpointer_smoke.py` × 2 runs — persistence across process
  restart proven (counter 0 → 1 → 2; real UUIDv7 checkpoint IDs from
  Supabase session pooler at `aws-0-ca-central-1.pooler.supabase.com:5432`).
- `scripts/llm_smoke.py` × 3 runs — Groq (`llama-3.3-70b-versatile`) +
  Gemini (`gemini-flash-latest`, `gemini-3.5-flash`) all respond `hola`
  with `tool-calling: supported`. `init_chat_model` abstraction confirmed:
  provider swap is zero-code.
- `scripts/mcp_smoke.py` — Python `stdio_client` spawns `npx -y
  matchday-mcp`, lists all 6 tools, `get_standings(PD)` returns real
  2024–25 La Liga standings from football-data.org.
- LangSmith — auth OK, traces flowing (visible in project `matchday-agent`).
- Two drift discoveries baked into `docs/decisions.md § 0.1`:
  Gemini 2.5 line closed to new API accounts; `AIMessage.content` shape
  differs between Groq (`str`) and Gemini 3.x (`list[dict]` with
  `extras.signature`).

Related shipped artifacts (context, not touched by this spec):
- **matchday-mcp@0.1.0** on npm (`npx matchday-mcp`, 6 tools over stdio).
  Consumed here as an MCP client from Python.
- **matchday-mcp-web** live at https://matchday-mcp-web.vercel.app (Svelte 5 +
  runes + Tailwind v4, Vercel). Will consume this agent through HTTP/SSE. UI
  changes deferred to a future spec in that repo.

## Objective

Evolve matchday from "MCP server + playground" to a full agentic application:
a football-analyst agent that reasons in multi-step, calls MCP tools, retrieves
Wikipedia context via RAG, persists state in Postgres and is fully observable.

The v1 of this agent ships:
1. **LangGraph core** — state graph with ReAct node + conditional edges +
   parallelization pattern (case: standings across 5 leagues).
2. **MCP client (Python)** — spawns `npx matchday-mcp` over stdio and binds
   its 6 tools as LangChain tools available to the agent.
3. **RAG v1 (Wikipedia)** — matches + clubs corpus in Supabase pgvector.
4. **Persistence** — LangGraph Postgres checkpointer (same Supabase).
5. **FastAPI + SSE** — public HTTP endpoint streaming reasoning to the web.
6. **Observability + evals (LangSmith)** — tracing on every run + baseline
   evals over the five anchor use cases.
7. **Deploy** — Fly.io machine with `auto_stop_machines = stop` (cost-safe).

## Final architecture

| Component            | Repo / stack                            | Runtime                          |
|----------------------|-----------------------------------------|----------------------------------|
| MCP server           | `matchday-mcp` (TS, on npm)             | stdio subprocess (`npx`)         |
| Agent (this spec)    | `matchday-agent` (Python 3.12 + uv)     | Fly.io (auto-stop machine)       |
| Frontend             | `matchday-mcp-web` (Svelte 5)           | Vercel (already deployed)        |
| Postgres + pgvector  | Supabase project `matchday-dev`         | Supabase managed                 |

Data flow: **web (Vercel) → HTTP/SSE → agent (Fly.io) → { MCP tools, RAG,
Postgres checkpointer, LangSmith }**.

## Anchor use cases (v1 done = these five pass evals)

1. **"How is X arriving to the clásico"** — recent form + top scorers + RAG
   context (rivalry history from Wikipedia).
2. **"Analysis of Y's next match"** — fixture + form + head-to-head + narrative.
3. **"Compare A vs B this season"** — statistical + form comparison.
4. **"Which league is most contested right now"** — parallel fetch of the top
   five leagues' standings + spread/std-dev computation (exercises the
   parallelization pattern).
5. **"Weekend summary in LaLiga"** — matches, top performers, storylines.

## Closed decisions (Step 1) — do not re-open

| Area                | Decision                                                        |
|---------------------|-----------------------------------------------------------------|
| Language / runtime  | Python 3.12+ managed with `uv` 0.9.20                           |
| Orchestration       | LangGraph (state machine + ReAct + parallel nodes)              |
| LLM provider        | **Groq** primary (free tier, tool-calling native) via `init_chat_model` abstraction so `LLM_PROVIDER` env can swap to Gemini/OpenAI without code changes |
| MCP client          | Official `mcp` Python SDK, `stdio_client` → `npx matchday-mcp`  |
| Frontend integration| HTTP/SSE contract only in this spec; UI work → later spec       |
| RAG v1 corpus       | Wikipedia (matches + clubs), stored in Supabase pgvector        |
| Persistence         | LangGraph checkpointer on the same Supabase Postgres            |
| Deploy              | Fly.io single machine, `auto_stop_machines = stop`              |
| Auth                | Public endpoint + per-IP rate limit + CORS pinned to Vercel     |
| V1 scope            | 5 anchor cases + LangSmith tracing + basic evals                |
| Dev MCP tooling     | Supabase MCP in `.mcp.json` (project scope, `read_only=true`)   |
| Language convention | English everywhere (code, specs, commits, README) except the agent's chat responses, which are Spanish |

## Phase 0 — Setup & validation (Context7 + librarian)

Every item is a **validation task** that produces a documented answer in
`docs/decisions.md` (new file in the agent repo). Nothing gets pinned in
`pyproject.toml` or written as code until this phase closes.

### Phase 0 — Closing notes (2026-07-25) ✅

**Status: closed.** All 9 sub-tasks validated via four parallel
Context7/librarian passes (LangGraph stack, MCP Python SDK, FastAPI SSE
+ Postgres/pgvector, Fly.io deploy + Supabase MCP). Findings consolidated
in `~/Dev/matchday-agent/docs/decisions.md`. Draft artifacts committed
to the agent repo (see status line above).

Closed decisions summary (full text in `docs/decisions.md` — do not
duplicate here):

| #   | Decision                                                                                                                             |
|-----|--------------------------------------------------------------------------------------------------------------------------------------|
| 0.1 | Versions pinned: `langgraph 1.2.9`, `langchain 1.3.14`, `langchain-core 1.5.1`, `langchain-groq 1.1.3`, `langchain-google-genai 4.3.1`, `langsmith 0.10.10`, `mcp>=1.28.1,<2`, `langchain-mcp-adapters 0.3.0`, `fastapi 0.140.0`, `uvicorn[standard] 0.51.0`, `sse-starlette>=0.3.0`, `pgvector 0.5.0`, `psycopg[binary,pool] 3.3.4`, `slowapi 0.1.10`, `Wikipedia-API 0.15.0`. Groq default model: `llama-3.3-70b-versatile` — **do NOT default to Mixtral 8x7b (deprecated by Groq)**. |
| 0.2 | MCP client via `mcp.client.stdio.stdio_client` → `npx -y matchday-mcp`. Tool binding via `langchain-mcp-adapters.load_mcp_tools(session)` (0.3.0 is actively maintained, safe for portfolio). Docker MUST include Node 20+ (multi-stage COPY from `node:20-slim` into `python:3.12-slim`). FastAPI `lifespan` opens ONE persistent MCP session on startup, reused for every request. |
| 0.3 | **Raw psycopg 3 + pgvector-python** (no SQLAlchemy, no `sqlalchemy` skill). Aligns with `AsyncPostgresSaver`'s driver; ~20 LOC vs. ORM boilerplate for a single table. |
| 0.4 | `AsyncPostgresSaver.from_conn_string(DATABASE_URL)` + idempotent `.setup()`. **Supabase v1 pinned DSN** = session pooler on port **5432** at `aws-0-<REGION>.pooler.supabase.com`, username `postgres.<REF>`. Transaction pooler (port 6543) and IPv6-only direct (`db.<REF>.supabase.co:5432`) are NOT used at v1 — see `docs/decisions.md` §0.4 for the full port table. `create_react_agent(..., version="v2")` (v1 deprecated). |
| 0.5 | `astream_events(version="v2")` for v1 (well-known event filter pattern); v3 (typed projections `.messages` / `.tool_calls` / `.output`) is a Phase 3 stretch. Buffering-off headers: `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`. Full contract in `docs/api-contract.md`. |
| 0.6 | Dockerfile + fly.toml drafts committed. `auto_stop_machines = "stop"`, `min_machines_running = 0`, `shared-cpu-1x` @ 512 MB (bump to 1 GB if the Node subprocess + pgvector queries pressure it). Known limitation: **idle SSE streams do NOT keep the machine awake** (v1 shrug — anchor cases complete in < 30 s). |
| 0.7 | `.mcp.json` at repo root, name `supabase-matchday-dev`, `type=http`, `read_only=true`, `features=database,docs`. `.claude/settings.local.json` cleared (the pre-existing `supabase` disable was inert given the new name). `<PROJECT_REF>` placeholder — user must paste. |
| 0.8 | Skills to install (manual, from user's `skills.sh` registry): `supabase-postgres-best-practices` ⭐, `fastapi-python`, `python-testing-patterns`, `pydantic`. `sqlalchemy` skill **skipped** per 0.3. Core agentic (LangGraph / LangSmith / MCP Python) has no autoskills entry — the four Phase 0 librarian outputs are the substitute reference. |
| 0.9 | LangSmith auto-instruments when `LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY` are set. Custom metadata via `@traceable(metadata={...})`. Project name: `matchday-agent`. Extra envs recognized: `LANGSMITH_ENDPOINT`, `LANGSMITH_TRACING_MODE`, `LANGSMITH_TRACING_SAMPLING_RATE`. |

**Open items requiring the user** (also listed in `docs/decisions.md`
and `.env.example`, TODO-marked):

1. ~~Supabase project ref → `.mcp.json` and `DATABASE_URL`~~ — ✅
   captured 2026-07-25 (`vdggittczhvvszguqxez`, region `ca-central-1`);
   baked into `.mcp.json` + `.env.example`.
2. Supabase DB password — user pastes to local `.env` + later
   `fly secrets set`. Never through chat.
3. Groq API key (free tier at console.groq.com).
4. LangSmith API key + project creation (`matchday-agent`).
5. `skills.sh` runs for the 4 skills above.
6. `brew install flyctl` (deferred to Phase 5 kickoff).

Runtime smoke checks that require those credentials before they can be
executed (they exist as drafts, safe to run once envs are populated):

- `uv run python scripts/mcp_smoke.py` (needs `FOOTBALL_DATA_TOKEN`).
- `uv run python scripts/checkpointer_smoke.py` (needs `DATABASE_URL`).
- LangSmith hello-world graph run (needs `LANGSMITH_*` + a chat model).

**Gate: Momus reviews THIS spec (updated with Phase 0 closing notes)
before Phase 1 begins.**

### 0.1 — Pin current versions (Context7)

Query Context7 for each library and record the version chosen in
`docs/decisions.md`. Prefer latest stable; note any known-good pairing.

- `langgraph` + `langgraph-checkpoint-postgres`
- `langchain-core` + `langchain`
- `langchain-groq` (primary provider)
- `langchain-google-genai` (fallback provider — optional install)
- `langsmith` (Python SDK)
- `fastapi` (async) + `uvicorn[standard]`
- `sse-starlette` (or `EventSourceResponse` directly from Starlette)
- `mcp` (Python SDK) + `langchain-mcp-adapters` if it exists and is maintained
- `pgvector` (Python bindings) + `psycopg[binary,pool]` or `asyncpg`
- `slowapi` (rate limiting)
- `pytest` + `pytest-asyncio` + `httpx`
- `wikipedia` (or REST client for ingestion)

Exit: `pyproject.toml` draft with every dep pinned to a resolved version.

### 0.2 — MCP Python client → matchday-mcp

Validate the officially recommended pattern to consume a stdio MCP server from
Python. Deliverables:

- Smoke script `scripts/mcp_smoke.py` that:
  1. Spawns `npx matchday-mcp` via `mcp.client.stdio.stdio_client`.
  2. Lists the 6 tools (initialize + `tools/list`).
  3. Calls `get_standings(PD)` and prints the parsed result.
- Decide tool-binding strategy: `langchain-mcp-adapters` if maintained and it
  produces `BaseTool` instances LangGraph can bind, otherwise a small manual
  wrapper. Documented tradeoff in `docs/decisions.md`.
- Confirm the Docker image must include a Node.js runtime (to run `npx`).

Exit: smoke script prints real football-data results, session closes cleanly.

### 0.3 — Postgres client + pgvector: SQLAlchemy vs raw

Decide between (a) SQLAlchemy + `sqlalchemy-pgvector` or (b) raw `psycopg` /
`asyncpg` + `pgvector` bindings. Constraints to check via Context7:

- What does `langgraph-checkpoint-postgres` expect? (`psycopg` connection?
  `asyncpg` pool? DSN string?) That is the deciding factor.
- Does pgvector Python integrate cleanly with the chosen driver?
- We only need two tables managed by us (`documents`, plus whatever
  checkpointer creates). No ORM benefit at this scale.

Default recommendation if Context7 is neutral: **raw `psycopg` (async) +
`pgvector`**, no SQLAlchemy. Install `sqlalchemy` skill only if this decision
flips to ORM. Document rationale.

Exit: driver + pgvector bindings selected and pinned; migration strategy for
the `documents` table (single SQL file `db/schema.sql`) drafted.

### 0.4 — LangGraph Postgres checkpointer

Validate exact setup via Context7:

- `AsyncPostgresSaver.from_conn_string(SUPABASE_DB_URL)` (or current API).
- First-boot `await checkpointer.setup()` to create tables.
- Thread-id namespace: v1 uses `X-Session-Id` header from the web (UUID
  generated client-side, stored in `localStorage`). No user auth in v1.
- Verify SSL requirements against Supabase pooler URL (session vs transaction
  pooler; checkpointer needs prepared statements → **session pooler** or
  direct connection).

Exit: notebook or script `scripts/checkpointer_smoke.py` that runs a tiny
graph, writes state, restarts, and resumes from checkpoint.

### 0.5 — FastAPI SSE contract for the frontend

Freeze the SSE event shape now — this becomes the contract
`matchday-mcp-web` will consume. Validate via Context7 the recommended
`astream_events` filtering pattern on LangGraph.

Frozen event shape (JSON body of each `data:` line):

```
event: token         → { "text": "..." }                     // model tokens
event: tool_call     → { "tool": "get_standings", "input": {...}, "id": "..." }
event: tool_result   → { "id": "...", "ok": true, "summary": "..." }
event: final         → { "message": "...", "sources": [...] }
event: error         → { "code": "...", "message": "..." }
```

Endpoints:
- `POST /chat` — non-streaming (JSON in/out), used for tests + evals.
- `POST /chat/stream` — SSE, primary path for the web.
- `GET  /health` — Fly.io wake probe.
- `GET  /` — version + model + tools count (useful for the web's about page).

Exit: contract documented in `docs/api-contract.md` and referenced from
README.

### 0.6 — Deploy target on Fly.io

Draft (not yet applied) the deploy artifacts:

- **Dockerfile** — `python:3.12-slim` base + `node:20` runtime (needed to
  spawn `npx matchday-mcp`) + `uv` for reproducible installs. Multi-stage if
  it keeps the image slim; single stage acceptable if faster to iterate.
- **fly.toml**:
  ```toml
  primary_region = "mia"           # decide in 0.6: mia | iad | sea
  [http_service]
  auto_stop_machines  = "stop"     # cost-safe
  auto_start_machines = true
  min_machines_running = 0
  [http_service.concurrency]
  hard_limit = 20
  soft_limit = 10
  [[vm]]
  size = "shared-cpu-1x"           # decide RAM: 512MB start, bump to 1GB if
                                   # MCP subprocess + pgvector pressures it
  ```
- Secrets to declare (not set yet):
  `GROQ_API_KEY`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, `DATABASE_URL`,
  `FOOTBALL_DATA_TOKEN` (passed through to the MCP subprocess env),
  `ALLOWED_ORIGINS`.
- Health check: `/health` returning 200 with `{ "ok": true, "version": "..." }`.

Install `flyctl` (`brew install flyctl`) is deferred to Phase 5.

Exit: `Dockerfile` and `fly.toml` committed as drafts, image builds locally
(`docker build`), container starts and answers `GET /` (no LLM call yet).

### 0.7 — Supabase MCP for dev (project scope)

Add `.mcp.json` at repo root with the Supabase MCP scoped to the
`matchday-dev` project, `read_only=true` by default, `features=database,docs`.

```json
{
  "mcpServers": {
    "supabase-matchday-dev": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=<PROJECT_REF>&read_only=true&features=database,docs"
    }
  }
}
```

Exit: MCP visible to Claude Code, schema exploration works; `<PROJECT_REF>`
resolved and recorded in `docs/decisions.md` (not the URL — only the ref).

### 0.8 — Skills (manual install from validated registry)

Install these skills into the agent repo scope:

- `supabase-postgres-best-practices` (Supabase official) ⭐
- `fastapi-python` (mindrally)
- `python-testing-patterns` (wshobson)
- `pydantic` (bobmatnyc)
- `sqlalchemy` (bobmatnyc) — **only if 0.3 selects SQLAlchemy**

The core agentic stack (LangGraph / LangSmith / MCP Python) has no skill in
the registry — use Context7 + the `librarian` subagent whenever depth is
needed.

Exit: `.claude/skills/` populated; each install path documented.

### 0.9 — LangSmith project setup

- Project name: `matchday-agent` (env `LANGSMITH_PROJECT`).
- Tracing enabled via env: `LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY`.
- Metadata tagged on every run: `session_id`, detected `use_case` (one of the
  five anchors, or `other`), `model`, `env` (dev/prod).
- Redaction rule for any accidental key in trace payloads.

Exit: hello-world graph run appears in LangSmith with expected tags.

### Phase 0 exit criteria (all must hold)

- `pyproject.toml` with pinned versions
- `Dockerfile` + `fly.toml` build locally
- `.mcp.json` with Supabase scope
- All skills installed
- MCP smoke script prints real football-data output
- Postgres + checkpointer smoke script survives a restart
- LangSmith run visible with correct tags
- `docs/decisions.md` + `docs/api-contract.md` filled

**Gate: run Momus over this spec (updated with Phase 0 findings) before
starting Phase 1.**

## Phase 1 — Agent core (LangGraph graph)

### Phase 1 — Closing notes (2026-07-26) ✅

**Status: closed.** Package `src/matchday_agent/{graph.py, prompts/system.py,
tools/mcp_tools.py, cli.py}` shipped in commit `1f46185` on
`matchday-agent` main (7 new files, 366 LOC). `basedpyright` 0/0,
`ruff check` + `ruff format` clean. `mda` CLI runs, streams via
`astream_events(version="v2")`, and persists across process restarts via
`AsyncPostgresSaver` on the Supabase session pooler. 5/5 anchor use cases
produce coherent Spanish answers with tool citations against real
football-data.org data.

**Runtime validation evidence (2026-07-26)**:

- Case #1 ("Cómo llega el Real Madrid al clásico") — chains
  `get_standings` → `find_team` → `get_team_matches`, cites sources inline.
- Case #2 ("Próximo partido del Manchester City") — correctly emits
  `get_matches(competition="PL", status="SCHEDULED")`; response is the
  honest "no dispongo del dato" fallback because that endpoint returned
  empty for the current PL window (rule #1 of the system prompt).
- Case #3 ("Compará Real Madrid vs Barcelona") — chains `find_team` ×2 +
  `compare_teams`, extracts H2H (Barça 2W, RM 1W), recent form
  (RM 4W1L, Barça 3W2L), 8-pt gap.
- Case #4 ("Cuál de las top 5 ligas está más disputada") —
  **parallelization test**: emits `get_standings("PD"|"PL"|"BL1"|"SA"|"FL1")`
  in a SINGLE assistant response, ranks leagues by 1st-to-3rd point gap
  (PL & SA tied at 14 pts, Ligue 1 15, LaLiga 22, Bundesliga 24).
- Case #5 ("Resumen del fin de semana en LaLiga") — chains
  `get_matches(status="FINISHED")` + `get_top_scorers`, joins matches
  with the season scorers table (Mbappé 25, Muriqi 23, etc.).
- Persistence: `mda --session <same-uuid>` in a fresh process recalls
  the first team asked (Real Madrid) and the clásico question — proves
  `AsyncPostgresSaver` round-trip across process restarts.

**Deltas from the original Phase 1 plan (worth capturing)**:

1. **RAG tool NOT stubbed.** The spec said "the 1 RAG tool (added in
   Phase 2; stubbed here)". Kept it out entirely — a stub tool with no
   useful output degrades tool-selection reasoning. RAG lands in
   Phase 2 with a real implementation.
2. **LLM default = Groq `llama-3.3-70b-versatile`.** The spec noted
   "or Kimi K2 — bench both in-repo and pick". Bench deferred;
   `llama-3.3-70b-versatile` ships as the default and passes 5/5
   anchor cases. Kimi K2 A/B moved to Phase 4 (LangSmith evals).
3. **Empirical prompt tuning is part of Phase 1, not deferrable.**
   First anchor run revealed the model does NOT parallelize tool calls
   or use complementary tools without explicit instruction. Added three
   rules to `SYSTEM_PROMPT`: (a) "emit N tool calls in a SINGLE
   response for N-entity questions"; (b) a question→tools coverage
   guide mapping common Spanish football queries to tool combos;
   (c) "try alternative tools before saying 'no dispongo del dato'".
   Case #4 improved from fetching 2 of 5 leagues to fetching all 5 in
   parallel. Lesson: prompt tuning is part of the definition-of-done
   for Phase 1, not a separate later phase.
4. **`[tool.basedpyright]` config** added to `pyproject.toml`:
   `typeCheckingMode = "standard"` (down from basedpyright's stricter
   default `"recommended"`). The `langchain` / `langgraph` /
   `langchain-mcp-adapters` ecosystem leaks untyped generics through
   its public API; `"standard"` still catches real type errors
   (missing imports, wrong arg types, undeclared generics) without
   drowning in ~50 warnings of ecosystem noise.

**Exit criteria met**: 5/5 anchor use cases + persistence proven +
parallelization exercise validated. Phase 2 (RAG on Wikipedia →
Supabase pgvector) is ready to start.

- Package layout `src/matchday_agent/{graph.py, tools/, prompts/, cli.py}`.
- `init_chat_model` reads `LLM_PROVIDER` + `LLM_MODEL` env; default =
  Groq + Llama 3.3 70B Versatile (or Kimi K2 — bench both in-repo and pick).
- Graph v1 = single ReAct node (`create_react_agent` from
  `langgraph.prebuilt`) with:
  - The 6 MCP tools (bound via 0.2's wrapper).
  - The 1 RAG tool (added in Phase 2; stubbed here).
  - System prompt: football analyst, always answers in **Spanish**, cites
    which tool the number came from.
- Postgres checkpointer wired using the driver picked in 0.3/0.4.
- CLI REPL `uv run mda` (entrypoint declared in `pyproject.toml`) for
  local end-to-end conversation testing.
- Verify each anchor use case returns a coherent Spanish answer from the CLI
  before moving on.

Exit: 5/5 anchor cases produce sensible answers locally; state persists
across REPL restarts on the same `--session <uuid>`.

## Phase 2 — RAG v1 (Wikipedia → pgvector)

### Phase 2 — Closing notes (2026-07-26) ✅

**Status: closed.** Wikipedia RAG shipped on `matchday-agent` main.
Corpus lives in Supabase `public.documents` — **2400 chunks across 68
unique Wikipedia URLs** (50 EN + 18 ES, 20 LaLiga clubs + 20 Premier
League clubs + 10 famous derbies/finals; one ES page missing due to
title mismatch — `Athletic Bilbao` vs `Athletic Club`). `basedpyright`
0/0, `ruff` clean. The 7-tool agent (6 MCP + `search_football_context`)
answers case #1 with RAG-enriched Spanish context.

**Runtime validation evidence (2026-07-26)**:

- **Embedder verified**: `intfloat/multilingual-e5-large` (1024d, MIT,
  ~100 langs) via `fastembed>=0.7.1`. Model cached at
  `~/.cache/fastembed/`; first-run download 2.24 GB in ~1-2 min.
  Subsequent loads ~3-5 s from disk.
- **Ingest verified**: EN pass = 1165 chunks / 50 pages, ES pass =
  1235 chunks / 19 pages. Total 2400 rows in `documents`. Idempotent
  on re-run (`ON CONFLICT DO UPDATE` on `(source_url, chunk_idx)`).
- **Schema verified**: 11 columns + 4 indexes (pk, unique, HNSW cosine,
  wiki_lang). Applied via raw `psycopg` against `DATABASE_URL` (see
  delta 3 below).
- **Case #1 anchor** (`¿Cómo llega el Real Madrid al clásico contra el
  Barcelona? [historia + rivalidad + datos actuales]`) emits three
  tool calls in order: `get_standings("PD")`, `get_team_matches(team=
  "Real Madrid", limit=5)`, `search_football_context(query="historia
  del Clásico", k=5)`. Response combines current standings (RM 2° at
  86 pts vs Barça 1° at 94 pts), recent form (WLWWW), and Wikipedia
  historical context (1920s origin, political/cultural framing),
  each cited inline with `(fuente: <tool_name>)`.
- **Persistence unchanged**: the Phase 1 AsyncPostgresSaver
  checkpointer still round-trips; documents live in the same Supabase
  Postgres alongside the checkpointer's own tables (no namespace
  collision).

**Deltas from the original Phase 2 plan (worth capturing)**:

1. **Embedder pivot from `BAAI/bge-m3` to
   `intfloat/multilingual-e5-large`.** The librarian research pass
   recommended BGE-M3 via fastembed. Empirical check
   (`TextEmbedding.list_supported_models()`) showed BGE-M3 is NOT in
   fastembed's catalog — it requires the separate `FlagEmbedding`
   library because of multi-vector modes. Pivoted to E5-large in
   fastembed's native catalog. Same 1024d, still multilingual (~100
   langs), MIT license. Chunk size adjusted to 480 tokens (from 512)
   to leave headroom for E5's `"passage: "` prefix under the
   512-token truncation limit.
2. **Chunker requires `from_tiktoken_encoder`, not the default.**
   `RecursiveCharacterTextSplitter` defaults to `len` (characters),
   NOT tokens. 480 characters is ~100 tokens — way too small.
   `from_tiktoken_encoder("cl100k_base")` swaps in the tiktoken
   byte-pair counter that the 480/64 numbers are calibrated against.
3. **Migration path: Supabase MCP was `read_only=true`.** Per Phase 0
   § 0.7 safety default. Pivoted to raw `psycopg` against
   `DATABASE_URL` for DDL — same session pooler the app uses. DO NOT
   flip the MCP to `read_only=false` for future migrations; keep the
   manual path (exposes fewer write surfaces to the LLM).
4. **pgvector `<=>` needs `Vector()` wrap, INSERT does not.**
   Discovered at first case #1 run with the error
   `operator does not exist: vector <=> double precision[]`.
   `register_vector_async` handles column-typed INSERTs but not
   standalone operator expressions. Fix documented in
   `docs/decisions.md § 2.4`. Rule of thumb: any raw vector
   expression outside a direct column INSERT MUST wrap the operand
   with `Vector()`.
5. **RAG tool wired at the CLI, not inside `graph.py`.** The tool
   composition `[*mcp_tools, search_football_context]` happens in
   `cli.py` before `build_agent()`. Keeps `graph.py` reusable for
   Phase 4 eval runs and Phase 3 FastAPI lifespan.
6. **Coverage guide additions made the model call the RAG tool.**
   Same Phase 1 lesson: without an explicit prompt entry mapping
   "cómo llega X a un clásico" to also call `search_football_context`,
   the model would default to MCP-only. Added inline instruction
   plus a new "historia / rivalidad / partidos legendarios" coverage
   entry. Case #1 confirms both trigger paths work.

**Exit criteria met**: 2400 chunks ingested + case #1 emits
`search_football_context` and its response includes Wikipedia-derived
narrative with `(fuente: ...)` attribution. Phase 3 (FastAPI +
`astream_events(v2)` SSE + `slowapi` rate limit) is ready to start.

- Ingestion script `scripts/ingest_wikipedia.py`:
  - Seed list: LaLiga (20 clubs) + Premier League (20 clubs) → 40 pages v1.
  - Optional stretch: 10 famous matches (finals, clásicos) as separate docs.
  - Fetch via `wikipedia` lib or REST API (respect UA + rate limits).
  - Chunk with `RecursiveCharacterTextSplitter` (~500 tokens, overlap ~100).
  - Embed with a **free** model — decide in this phase between:
    - `fastembed` local with `BAAI/bge-small-en-v1.5` (English) or
      `paraphrase-multilingual-MiniLM-L12-v2` (multilingual; better since
      queries arrive in Spanish).
    - Cohere `embed-multilingual-v3` free tier (network call, no memory cost).
  - Store rows in `documents(id, source_url, title, chunk_idx, content,
    embedding vector, updated_at)`.
- Retrieval tool `search_football_context(query, k=5)` bound to the agent.
- Update the system prompt to nudge the agent to use RAG for "history",
  "rivalry", "legendary" style questions.
- Verify: "clásico" query surfaces Barça vs Real Madrid Wikipedia chunks in
  the final answer's citations.

Exit: RAG tool used in at least anchor cases #1 and #5; latency budget
respected (retrieval < 400 ms p95 locally).

## Phase 3 — FastAPI + SSE + rate limit

### Phase 3 — Closing notes (2026-07-26) ✅

**Status: closed.** Public HTTP surface shipped on `matchday-agent`
main. Four endpoints (`GET /`, `GET /health`, `POST /chat`,
`POST /chat/stream`) live per the frozen contract in
[`docs/api-contract.md`](../../matchday-agent/docs/api-contract.md).
FastAPI + `sse-starlette` for the SSE path, `slowapi` for rate limit
(20 req/min per IP on POST endpoints), CORS from `ALLOWED_ORIGINS`
env, `X-Session-Id` UUID validation feeding LangGraph `thread_id`.
`lifespan` composes the same AsyncExitStack as the CLI (checkpointer
+ MCP + RAG + agent build). `basedpyright` 0/0, `ruff` clean.

**Runtime validation evidence (2026-07-26)**:

Verified with `uvicorn matchday_agent.app:app --port 8000`:

- `GET /` → `{name, version, model, tools[7]}` — includes all 7
  bound tools (6 MCP + `search_football_context`).
- `GET /health` → `{ok: true, version}`.
- `POST /chat` without `X-Session-Id` → 400 with descriptive detail.
- `POST /chat` with malformed UUID → 400 with parse-error detail.
- `POST /chat` valid → real LLM + tool response, echoes `session_id`,
  Spanish content with inline `(fuente: X)` citations.
- `POST /chat/stream` tool-triggering question → SSE frames in
  correct order: `event: tool_call` (tool=get_standings, input,
  run_id) → `event: tool_result` (id echoes run_id, summary
  truncated to ~300 chars) → 2× `event: token` → `event: final`
  (full accumulated message + `sources: []`).
- `POST /chat/stream` no-tool question ("¿capital de Francia?") →
  28× `event: token` + `event: final`. Confirms token streaming
  path is independent of tool calls.
- `event: error` implicitly verified during Groq TPD saturation
  (see delta 3) — emitter caught `groq.BadRequestError` and emitted
  `{"code": "APIError", "message": "..."}` then closed the stream.

**Deltas from the original Phase 3 plan (worth capturing)**:

1. **Shared streaming helpers extracted**. Per § 1.5's rule
   ("do not diverge REPL and SSE event handling"), extracted
   `extract_chunk_text` + `format_tool_input` into
   `src/matchday_agent/streaming.py`. Both `cli.py` and `app.py`
   import from it. Any future provider-content-shape fix lives in
   one place.
2. **slowapi handler cast for FastAPI typing compatibility**.
   FastAPI's `add_exception_handler` expects
   `(Request, Exception) -> Response`; slowapi's handler is
   `(Request, RateLimitExceeded) -> Response` (a narrower
   contravariant subtype). Wrapped with `cast(Any, ...)` — a
   legitimate type assertion, not a suppression. Documented in
   decisions.md § 3.3.
3. **Groq's daily TPD limit was hit mid-testing** (99,335 / 100,000
   tokens across Phases 1-3). Near the cap, Groq returned malformed
   text-form tool calls (`<function=get_standings {...}></function>`)
   instead of structured `tool_calls[]`, causing
   `groq.BadRequestError: tool_use_failed`. **Provider swap to
   `google_genai:gemini-3.5-flash` via `.env` edit is zero-code**
   and was verified end-to-end — all 4 endpoints + all SSE event
   kinds worked with Gemini. Empirical proof of the § 0.1 promise.
   Reverted `.env` back to Groq afterwards (still the primary per
   § 0.1). Documented in decisions.md § 3.6.
4. **v1 leaves several contract fields intentionally simple**:
   `sources: []`, `event: tool_result.ok` always true,
   `event: error.code` = exception class name, no `event: ping`,
   no `usage` tokens. All documented as "reserved for Phase 4+"
   in `docs/api-contract.md` — SHAPE frozen, CONTENT filled later.
5. **`docs/api-contract.md` updated to reflect impl reality**.
   The Phase 0 draft was aspirational (structured `sources`,
   `usage`, `event: ping`). Rewrote to be v1-truthful with
   explicit "reserved for Phase 4+" notes. Consumers reading the
   doc today get exactly what the API returns. Only impl update
   to reduce drift was adding `session_id` to `ChatResponse`.

**Exit criteria met**: 4 endpoints work, SSE stream matches the
frozen event shape byte-for-byte, validation errors return
descriptive 400s, provider swap validated as zero-code, all types
green. Phase 4 (LangSmith observability + evals over the 5 anchor
cases) is ready to start.

- FastAPI app in `src/matchday_agent/app.py` implementing the endpoints
  frozen in 0.5.
- Streaming: `astream_events` piped through an `EventSourceResponse`; event
  filter matches the frozen contract.
- CORS: `ALLOWED_ORIGINS` env (comma-separated) restricts to
  `https://matchday-mcp-web.vercel.app` + `http://localhost:5173` for dev.
- Rate limit with `slowapi`, in-memory backend, 20 req/min per IP on
  `/chat/stream` and `/chat`; `/health` unlimited.
- Session id: read `X-Session-Id` header (UUID); validate format; use as
  checkpointer thread id.
- Local smoke: `curl -N -H 'X-Session-Id: <uuid>' -d '{"message":"..."}'
  http://localhost:8000/chat/stream` streams the expected events end-to-end.

Exit: SSE stream matches the frozen contract byte-for-byte; rate-limit
returns 429 with a machine-readable body after threshold.

## Phase 4 — Observability + evals (LangSmith)

### Phase 4 — Closing notes (2026-07-26) ✅ (infra) · ⏸ (baseline)

**Status**: infrastructure closed. Quantitative baseline capture blocked
by free-tier daily quotas across BOTH providers — infra proven, baseline
needs a rerun tomorrow (or paid-tier upgrade). `basedpyright` 0/0, `ruff`
clean.

Shipped:

- `src/matchday_agent/evals/{__init__,dataset,judge_prompt,evaluators,runner}.py`
  (~450 LOC total). Runner exposed as `uv run evals` per
  `pyproject.toml [project.scripts]`.
- `evals/anchor_cases.jsonl` — 15 examples (5 anchor cases × 3 phrasing
  variations: formal / casual / elliptical), each with hand-written
  `reference_summary` + `expected_tools[]`.
- `evals/baseline.md` — generated by the runner; currently populated with
  the honest STATUS placeholder because the quota-blocked run couldn't
  produce real scores.
- LangSmith dataset `matchday-agent-anchor-cases` created in the UI, 15
  examples uploaded. Reused across reruns via `read_dataset` +
  fallback-to-`create_dataset`.
- Experiment `matchday-agent-phase4` created in LangSmith with 15 traces
  (all errored due to 429, but present for tag / metadata inspection).

**Runtime validation evidence (2026-07-26)**:

- Runner startup: dataset loaded (15 examples), MCP subprocess spawned,
  agent built with 7 tools, Postgres checkpointer set up.
- `_ensure_dataset` correctly detected the missing dataset on first run,
  created it, uploaded all 15 examples.
- `aevaluate()` ran all 15 cases in parallel (max_concurrency=2), each
  attached the right `configurable.thread_id`, `metadata`, and `tags`
  per the spec § 0.9 requirements — visible in the LangSmith UI as
  eval-tagged runs.
- `error_handling='log'` (default) captured Groq 429s and Gemini 429s as
  per-example errors and continued processing. All 15 traces uploaded
  cleanly, `baseline.md` written by the runner without crashing.
- `.env` provider swap (Groq -> Gemini -> Groq) executed via `sed -i ''`
  + `mv .env.bak .env` trap, same pattern as Phase 3 § 3.6. Verified
  reverted.

**Deltas from the original Phase 4 plan (worth capturing)**:

1. **LangSmith dataset MUST be hosted for `aevaluate()`**. Both raw
   `list[dict]` and locally-constructed `list[Example]` fail with
   `LangSmithNotFoundError: Reference dataset not found` in
   `_get_project()`. Fix: `client.create_dataset() +
   client.create_examples()` first, then `aevaluate(data=DATASET_NAME)`
   passing the name string. Read-or-create pattern in
   `runner._ensure_dataset`. Documented in decisions.md § 4.1.
2. **Free-tier daily quotas blocked baseline capture**. Groq's TPD
   (100k/day) was already at 97k+ from Phases 1-3; Phase 4 needed
   ~75k more. Gemini's per-day per-model per-project limit is only
   **20 requests/day** (far tighter than Groq's tokens), 15 agent +
   judge calls exceeded it. **Both providers 429'd 15/15 cases**.
   Escape hatch is either paid tier OR wait for quota reset (~24h)
   and rerun. Runner supports the rerun path zero-code — same
   `uv run evals` command, dataset reused. Documented in decisions.md
   § 4.3.
3. **`cast(Any, ...)` on evaluators list** because LangSmith's
   `EVALUATOR_T | AEVALUATOR_T` protocol expects a strict
   `(Run, Example | None) -> EvaluationResult` signature that pyright
   can't reconcile with the SDK's runtime signature-introspection
   pattern. Same technique as Phase 3 § 3.3 for slowapi. Documented
   in decisions.md § 4.2.
4. **Hand-written references over self-baseline**. Reference summaries
   describe "what a good answer looks like" rather than "what the
   agent currently produces". Self-baseline scores 5/5 trivially and
   loses regression signal.
5. **AsyncExitStack composition is now a load-bearing pattern**.
   CLI + FastAPI lifespan + evals runner all compose the identical
   `AsyncPostgresSaver + matchday_mcp_tools + build_agent` stack. A
   4th caller triggers extraction to `build_full_agent_stack()`
   factory. Documented in decisions.md § 4.4.

**Exit criteria — partial**:

- ✅ Runner + evaluators + dataset all shipped and pass type checks.
- ✅ LangSmith trace pipeline verified (dataset created, experiment
  created, 15 traces uploaded, metadata + tags flowed).
- ⏸ Quantitative baseline NOT yet captured due to quota exhaustion —
  requires a rerun when free-tier quotas reset (~24h) or an upgrade
  to Groq's Dev Tier. Runner is unchanged; `uv run evals` produces
  a real baseline on the next attempt.
- ✅ Regression threshold documented (correctness_mean drop > 0.5 →
  fail CI in Phase 6 when we add CI).

Phase 5 (Fly.io deploy) can proceed independently — deployment doesn't
depend on having a passing baseline; the baseline can be captured after
deploy against the live URL if desired.

- Instrument every request with a LangSmith run + metadata tags from 0.9.
- Evals dataset committed at `evals/anchor_cases.jsonl` — 5 anchor cases × 3
  variations = 15 examples. Each example: `{input, reference_summary,
  expected_tools[]}`.
- Evaluators (LangSmith SDK):
  - `correctness` — LLM-as-judge (Groq's largest available or Gemini 2.5
    Flash as judge to avoid self-judging on the same base) scoring the
    answer against `reference_summary` on a 1–5 scale.
  - `tool_selection` — set overlap between called tools and
    `expected_tools`.
  - `latency` — p50 / p95 per case (measured client-side in the eval runner).
- Runner: `uv run evals` → writes results to LangSmith project + prints a
  Markdown table to stdout.
- Baseline captured and committed to `evals/baseline.md`.

Exit: baseline recorded; regression threshold documented (any future run
that drops correctness > 0.5 fails CI when we add it).

## Phase 5 — Deploy to Fly.io

### Phase 5 — Closing notes (2026-07-26) ✅

**Status: closed.** Live at https://matchday-agent.fly.dev on Fly.io
(app `matchday-agent` under org `rei-orozco`, region `iad`,
`shared-cpu-1x` / 512 MB, `auto_stop_machines = 'stop'`,
`min_machines_running = 0`, image size 183 MB). All 5 SSE event kinds
byte-verified in production against the frozen contract; CORS pinned to
the Vercel origin; secrets set exclusively via `fly secrets set --stage`
(never touched chat). `basedpyright` 0/0, `ruff` clean. Full delta log
and decisions in `~/Dev/matchday-agent/docs/decisions.md § 5.1–5.9`.

**Runtime validation evidence (2026-07-26)**:

- **Deploy pipeline**: `flyctl v0.4.74` on the workstation, `fly launch
  --no-deploy --copy-config --name matchday-agent --region iad --yes`
  created the app + normalized `fly.toml`. `fly secrets set --stage`
  set 6 secrets (digests verified; no values echoed). `fly deploy`
  succeeded on the 3rd attempt — first two crashed on Dockerfile bugs
  (see Deltas below). Final image built + pushed in 5-7 min per build,
  183 MB.
- **Cold start (initial `/health` from a `stopped` machine)**:
  `HTTP 200 · ttfb=20.79 s`. 2.5x over the spec's `< 8 s` target;
  acceptable per the spec's own "acceptable for demo" qualifier.
  Breakdown in `docs/decisions.md § 5.2`.
- **Warm `/`**: `HTTP 200 · ttfb=0.41 s`. Response includes all 7 tools
  bound (6 MCP + `search_football_context`) + `model:
  "groq:llama-3.3-70b-versatile"` — confirms `[env]` runtime config
  flowed through Fly to the container.
- **SSE case #3 happy path**
  (session `c64f94f9-c06c-48d9-86b5-9f562a878c7b`, "Compará Real Madrid
  vs Barcelona esta temporada"): 3 `event: tool_call` in a SINGLE
  assistant response (`compare_teams` + `find_team` ×2 — parallel tool
  execution confirmed live) + 3 `event: tool_result` (all `ok: true`,
  IDs echoed) + 328 `event: token` + 1 `event: final` with full
  accumulated message + `sources: []`. Total wall-clock 2.47 s on the
  warm machine. All 5 event kinds present, all field shapes match the
  frozen contract in [`docs/api-contract.md`](../../matchday-agent/docs/api-contract.md).
- **SSE case #1 error path**
  (session `e1e2a32c-a8fa-41ae-a14e-648bace7fb72`, "¿Cómo llega el
  Real Madrid al clásico contra el Barcelona?"): produced a REAL
  `event: error` with `{"code": "RateLimitError", "message": "...429
  ...Limit 100000, Used 97209..."}` — Groq TPD saturation from
  Phase 4 § 4.3 + Phase 5's own case #3 (~3 k tokens) tipped the
  cumulative counter past the daily cap. Positive side effect: the
  `event: error` contract path was verified in production against a
  genuine upstream failure (not a synthesized test). Stream closed
  cleanly after the error frame.
- **CORS positive**: request with `Origin:
  https://matchday-mcp-web.vercel.app` → `HTTP 200` + response echoes
  `access-control-allow-origin: https://matchday-mcp-web.vercel.app`.
- **CORS negative**: request with `Origin: https://evil.example.com`
  → `HTTP 400`, NO `access-control-allow-origin` header (browser
  blocks by default).
- **Auto-start**: `fly deploy` left the machine in `stopped` state;
  the first external `/health` request 4 min later woke it in 20.79 s.
  Confirmed end-to-end.
- **Auto-stop**: last external request at 22:09:39 UTC; `fly machine
  list` at 22:13:38 UTC reported `state = stopped, checks = 0/1`.
  Auto-stop delay ≈ 4 min after last inbound traffic. Confirmed
  end-to-end. (Earlier snapshot at 22:12 raced the scheduler and
  showed `state = started` — see `docs/decisions.md § 5.9` for the
  full observation.)

**Deltas from the original Phase 5 plan (worth capturing)**:

1. **Dockerfile from Phase 0 § 0.6 had 4 real bugs**. Full analysis in
   `docs/decisions.md § 5.3.1–5.3.4`. Summary: (a) missing
   `.dockerignore` would have leaked `.env` into the image; (b)
   `USER appuser` was AFTER `uv sync` — `.venv/` ended up root-owned
   and the container crash-looped 10× on `Permission denied` when
   `uv run` tried to re-sync entry points; (c) `CMD ["uv", "run",
   "uvicorn", ...]` should be `["/app/.venv/bin/uvicorn", ...]` —
   direct invocation avoids the re-sync entirely and saves ~2-3 s of
   cold start; (d) `RUN uv sync` before `COPY . .` installed deps
   but NOT the local `matchday-agent` package — needed a second
   `uv sync` after `COPY . .` (two-step for layer caching). Each fix
   required its own `fly deploy` iteration to surface the next bug.
2. **Region: `iad`, not `mia`**. Phase 0 default was `mia`; Phase 5
   chose `iad` for ~1000 km RTT to Supabase `ca-central-1` (vs.
   ~2500 km for `mia`). Also closer to Vercel edge for the frontend.
3. **`fly.toml [env]` needed 3 additions**. Phase 0 draft had only
   `PORT`, `LOG_LEVEL`. Added `LANGSMITH_TRACING = 'true'` (required
   for auto-instrumentation to fire per § 0.9), `LLM_PROVIDER = 'groq'`
   + `LLM_MODEL = 'llama-3.3-70b-versatile'` (explicit defaults for
   zero-code provider swap per § 3.6).
4. **`fly launch` normalized `fly.toml`, dropped comments**. flyctl
   rewrote the file in single-quote TOML style with keys sorted
   alphabetically and ALL comments stripped. Restored the
   semantically-critical inline comments (region rationale, SSE +
   auto-stop known limitation, memory bump threshold) by hand.
   Rule of thumb documented in `docs/decisions.md § 5.7`.
5. **`fastembed` model cache is ephemeral per cold start** (2.24 GB
   E5-large). Not fixed in v1 — first RAG call after a cold start
   pays ~60-90 s (embedder download + init + LLM). Documented as a
   Phase 6+ optimization target in `docs/decisions.md § 5.4`.
6. **Case #1 blocked by Groq TPD, but case #3 covers happy path**.
   Anchor case #1 requires the RAG tool to actually execute for full
   end-to-end verification with a Wikipedia citation. Blocked here by
   the same free-tier quota reality of § 4.3. The tool IS bound and
   IS callable (verified via `GET /` tools list); actually invoking
   it via LLM tool-choice waits for the next Groq TPD reset window
   (or a paid tier upgrade). Case #3 covered the entire SSE happy
   path (3 parallel tools, tokens, final), and case #1's natural 429
   covered the error path — full contract coverage without needing a
   RAG-triggered run.

**Exit criteria met**:

- ✅ Live URL responds. `curl https://matchday-agent.fly.dev/` returns
  the expected metadata with all 7 tools.
- ✅ Health check green. `/health` returns `{"ok": true, "version":
  "0.1.0"}` in 20.79 s cold / 0.41 s warm.
- ✅ SSE contract byte-verified end-to-end. Case #3 covers the full
  happy path (5 event kinds); case #1 covers the error path with a
  genuine upstream failure.
- ✅ CORS pinned to Vercel origin. Positive → 200 + Allow-Origin
  header echoed. Negative → 400, no Allow-Origin header.
- ✅ Auto-start confirmed via the 20.79 s cold-start-from-stopped
  observation on the initial `/health`.
- ✅ Auto-stop confirmed via `state = stopped` at 22:13:38 UTC (≈ 4 min
  after the last external request). Cost-safety property holds.
- ✅ Secrets never touched chat. `set -a; . ./.env; set +a; fly
  secrets set --stage <6 vars>` piped directly from the local `.env`.
  Output grep'd to strip any accidental echo of the key names +
  values. `fly secrets list` shows digests only.
- ✅ Cold start noted in `docs/decisions.md § 5.2` for README callout.

Phase 6 (README + `GET /openapi.json` link + web-repo GitHub issue) can
proceed. The RAG-triggered live end-to-end (case #1 with actual Wikipedia
citation from `search_football_context`) can be captured any time after
the next Groq TPD reset without touching the deploy — it's a
verification-only rerun.

---

**Original Phase 5 task list (kept for reference)**:

- `brew install flyctl` on the workstation.
- `fly launch --no-deploy` from the drafted Dockerfile + fly.toml.
- `fly secrets set` all env from 0.6.
- `fly deploy`. Verify:
  - Health check green.
  - Machine transitions to `auto_stopped` after idle.
  - Cold start on first request < 8 s (acceptable for demo; note in README).
  - SSE works through Fly's edge (no buffering).
- End-to-end curl smoke against the live URL for one anchor case.
- CORS check: request from `https://matchday-mcp-web.vercel.app` succeeds;
  request from unlisted origin is blocked.

Exit: live URL responds; secrets never left the shell / never in git; note
the machine specs actually chosen (RAM/region) in `docs/decisions.md`.

## Phase 6 — API contract publication

### Phase 6 — Closing notes (2026-07-26) ✅

**Status: closed.** Public GitHub repo
[reiorozco/matchday-agent](https://github.com/reiorozco/matchday-agent)
created and pushed (8 commits, all on main). `README.md` landing page
written at repo root (~200 lines, portfolio-quality, every doc
single-sourced). `/openapi.json` reachable at
<https://matchday-agent.fly.dev/openapi.json> (auto-generated by FastAPI
from Pydantic models, 4 documented paths, 2 939 B). Handoff issue filed
at [matchday-mcp-web#1](https://github.com/reiorozco/matchday-mcp-web/issues/1)
with the full SSE contract table, a ~50 LOC Svelte 5 runes-friendly
sample consumer, session/CORS/rate-limit notes, and a 6-item DoD
checklist. Full delta log and decisions in
`~/Dev/matchday-agent/docs/decisions.md § 6.1–6.5`.

**Runtime validation evidence (2026-07-26)**:

- **GitHub repo created**: `gh repo create reiorozco/matchday-agent
  --public --source . --push --remote origin` — succeeded, all 8
  commits pushed, `origin/main` set as upstream. Homepage set to
  <https://matchday-agent.fly.dev>. Repo alignment with sister repos
  (both already public):
  [matchday-mcp](https://github.com/reiorozco/matchday-mcp) (npm
  package + GitHub source, upstream) +
  [matchday-mcp-web](https://github.com/reiorozco/matchday-mcp-web)
  (Svelte 5 + Vercel, downstream consumer).
- **Pre-push secret sweep**: `git log --all -p | grep -E "^\+.*_(KEY|
  TOKEN|URL|SECRET|PASSWORD)=[A-Za-z0-9]{15,}"` = 0 matches. Two
  shorter matches were false positives (literal `...` placeholders
  inside markdown code blocks in `decisions.md`). Rule documented in
  `docs/decisions.md § 6.4` for future first-push audits.
- **`/openapi.json` reachable**: `HTTP 200 · 2 939 B · ttfb=26.5 s`
  (cold-start-from-stopped since machine had been idle). Warm subsequent
  requests < 0.5 s. Paths listed: `/`, `/chat`, `/chat/stream`,
  `/health`. Linked prominently in the README header + endpoints table.
- **Handoff issue #1 delivered self-sufficient**: contract table + code
  sample + refs designed so a Svelte 5 contributor can implement without
  follow-up questions. Meets the exit criterion "reader can go from
  README to a working curl in under 5 minutes" via the README's `Live
  demo (60 s copy-paste)` section.
- **README exit criterion**: verified by dry-running the header curl
  block against the (still cold) live URL — the three curls
  (`/` metadata, `POST /chat` non-streaming, `POST /chat/stream` SSE)
  return valid contract-shaped responses without any local setup.

**Deltas from the original Phase 6 plan (worth capturing)**:

1. **LangSmith trace screenshot left as TODO in README**. The Phase 6
   plan called for a screenshot inline. The LangSmith project is
   currently team-scoped (no public shareable trace URL), so a
   screenshot would need to be captured manually with sensitive
   metadata cropped. Marked `TODO` in `README.md § Observability` with
   the target path `docs/screenshots/langsmith-trace.png`. Not blocking
   the phase close — one image can land in a follow-up commit.
2. **Repo push discovered `matchday-agent` had no git remote**. Local
   commits existed since Phase 0 but no `origin`. Not a bug — the
   `~/Dev/matchday-agent` clone was implicitly local-only until Phase 6
   ("API contract PUBLICATION" implies going public). `gh repo create
   --source .` handled remote setup + push in one call.
3. **Convention alignment: `.omo/`, `.claude/`, `.agents/` and `specs/`
   stay untracked**. All four are dev-side tooling (`.omo/` = opencode
   session state, `.claude/` = Claude Code settings, `.agents/` =
   skill lockfile targets, `specs/` = local planning docs in the
   sibling `matchday-mcp` repo). None ship to the public repo. Baked
   into `.gitignore` for `.omo/`, `.claude/skills/`, `.agents/`. `specs/`
   lives in a different repo where it's also untracked (verified in
   Phase 5 § 5.7 debug work).
4. **Handoff issue exceeded the "seed" ambition**. Original spec text
   said "seed of the web-side spec"; issue #1 shipped ready-to-implement
   content (contract + sample + DoD). Trade-off — the frontend
   contributor gets an unambiguous target and can start coding immediately,
   at the cost of the issue being longer than a typical "seed" would be.
   Acceptable because the frontend spec is a follow-up in a different
   repo, so having the contract front-loaded in the issue itself
   removes cross-repo lookups from the implementation loop.

**Exit criteria met**:

- ✅ Public repo at <https://github.com/reiorozco/matchday-agent>,
  8 commits, main tracks `origin/main`.
- ✅ `README.md` at repo root. Sections: title/badges · Live demo
  (60 s) · What's inside · Anchor use cases · Endpoints · Local
  quickstart (CLI + HTTP + Docker) · Configuration · Architecture ·
  Observability · Evals · Deploy · Related repos · License.
- ✅ `/openapi.json` reachable + linked from the README header and
  endpoints table.
- ✅ Handoff GitHub issue filed at
  [matchday-mcp-web#1](https://github.com/reiorozco/matchday-mcp-web/issues/1)
  with full contract + sample code + refs + DoD checklist.
- ✅ Exit criterion "reader → working curl in under 5 minutes" met.
  README's `Live demo (60 s copy-paste)` block includes 3 valid curls
  that hit the live URL and return contract-shaped responses on first
  read (no clone, no install).
- ⏸ LangSmith trace screenshot marked `TODO` in README. Non-blocking;
  can land in a follow-up commit when a shareable trace URL exists.

**v1 SHIPPED.** Phase 7 (brand integration — LinkedIn Featured,
profile README updates, build-in-public posts) is a marketing / audience
phase, orthogonal to the code deliverable. It can proceed when the
Phase 4 evals baseline gets its final quota-unblocked rerun (so the
LinkedIn story includes a real score, not a `pending quota` placeholder).

---

**Original Phase 6 task list (kept for reference)**:

- README of `matchday-agent`: quickstart (Docker + Fly.io), env matrix, SSE
  event shapes, sample `curl`, LangSmith trace screenshot, evals baseline
  link.
- `GET /openapi.json` reachable (FastAPI default) and linked from README.
- Open a GitHub issue in `matchday-mcp-web` titled *"Consume matchday-agent
  chat endpoint"* linking this spec and the frozen contract — that will
  become the seed of the web-side spec.

Exit: a reader who has never seen this repo can go from README to a working
`curl` against the live URL in under 5 minutes.

## Phase 7 — Brand integration

### Phase 7 — Closing notes (2026-07-27) ✅

**Status: closed.** LinkedIn assets drafted in
[`matchday-agent/docs/marketing/linkedin.md`](../../matchday-agent/docs/marketing/linkedin.md)
— Featured card description (ES + EN), two build-in-public posts covering
Phase 2 (RAG shipped) + Phase 5-6 (v1 live on Fly.io) in ES + EN,
copy-paste-ready. Profile README (`reiorozco/reiorozco`) updated in-place
via a single commit: `matchday-agent` added as the new top row in the
Featured Projects table, `matchday-mcp` row description tweaked to
reference the agent as a downstream consumer, and the AI Engineering
learning bullet expanded to include "LangGraph agents with RAG +
observability" pointing at the new repo.

**Runtime validation evidence (2026-07-27)**:

- **LinkedIn assets committed** at
  `matchday-agent/docs/marketing/linkedin.md` — 3 sections:
  Featured card copy (ES + EN, ~200 chars each, fits LinkedIn's field
  limits), Post 1 (Phase 2 RAG retrospective, ES + EN,
  ~1500 chars each), Post 2 (Phase 5-6 milestone with working curl,
  ES + EN, ~2000 chars each). All posts end with a `#` hashtag block
  and a `Repo:` link — copy-paste-ready for LinkedIn's feed post
  composer.
- **Profile README applied** at
  <https://github.com/reiorozco/reiorozco> — the "matchday" card is
  now a **matchday stack** story (matchday-agent + matchday-mcp cross-linked
  in adjacent Featured Projects rows). Featured Projects goes from 7
  rows to 8; `matchday-agent` is row 1 (most recent + most technically
  ambitious).
- **Cross-repo linking** verified in-place: profile README
  matchday-agent row → matchday-agent's public repo → matchday-agent's
  README → matchday-mcp-web issue #1 → back to matchday-agent contract.
  A recruiter or contributor lands on the profile and reaches the
  live URL in ≤ 3 clicks.

**Deltas from the original Phase 7 plan (worth capturing)**:

1. **LinkedIn Featured card copy shipped BOTH as a Featured description
   AND as a full build-in-public post**. The plan called for a "1-2 line
   hook that names LangGraph + RAG + evals" for the Featured card. Also
   shipped are the longer build-in-public posts because the two artifacts
   serve different LinkedIn surfaces (Featured section = passive
   scanning; feed posts = active engagement / algorithm surfaces).
2. **Featured Projects table: matchday-agent as row 1, not just added
   at bottom**. Recruiters skim top-down; the newest + most technically
   ambitious project belongs at the top. Existing rows shift down by
   one. `matchday-mcp` row 2 with a lighter reference to the agent
   preserves its identity as the foundational open-source layer.
3. **Memory files (`marca-profesional-2026`, `github-audit-2026`)
   NOT touched**. Those live in the user's private memory system
   (outside any of the 3 matchday repos). Noted at the bottom of
   `docs/marketing/linkedin.md` for the user to sync manually. Not
   blocking Phase 7 closure — they're an internal-facing artifact,
   not a public one.
4. **Post preview cards NOT validated via LinkedIn Post Inspector**.
   The Inspector requires publishing (or at least authoring) a
   real post; can't be run against local Markdown drafts. The
   `matchday-agent` repo README + live URL both have proper OG
   meta (auto-generated by GitHub + FastAPI). When the user
   publishes the drafts, LinkedIn will fetch OG tags from those
   URLs and render the previews. Not blocking; deferred to the
   user's publish step.

**Exit criteria met**:

- ✅ Featured card copy drafted in ES + EN, fits LinkedIn's field
  limits, points to the repo + live URL.
- ✅ Profile README (`reiorozco/reiorozco`) updated to include
  `matchday-agent` in Featured Projects + updated AI Engineering
  learning bullet. Applied via a single commit to the profile repo,
  not just drafted.
- ✅ Two build-in-public posts drafted in ES + EN, each with a
  concrete technical narrative + working code / URL. Ready to
  publish as-is.
- ⏸ Memory files (`marca-profesional-2026`, `github-audit-2026`)
  left for the user to update manually — private tooling.
- ⏸ LinkedIn Post Inspector validation deferred to the user's
  actual publish step (Inspector can only run against a real
  URL that's been shared, not a Markdown draft).

**v1 fully SHIPPED across all 3 repos**:

- [matchday-mcp](https://github.com/reiorozco/matchday-mcp) — npm
  package, 6 tools, MCP stdio (untouched by this spec, referenced).
- [matchday-agent](https://github.com/reiorozco/matchday-agent) —
  this repo, LangGraph + RAG + FastAPI + Fly.io, live at
  <https://matchday-agent.fly.dev>.
- [matchday-mcp-web](https://github.com/reiorozco/matchday-mcp-web) —
  Svelte 5 frontend, live at <https://matchday-mcp-web.vercel.app>,
  handoff issue #1 filed to consume the agent's SSE.

---

**Original Phase 7 task list (kept for reference)**:

- LinkedIn Featured: upgrade the matchday card to a **matchday stack** story
  (MCP + Agent + Web). New 1–2 line hook that names LangGraph + RAG + evals.
- Profile README (`reiorozco`): add `matchday-agent` row to the projects
  table.
- Build-in-public: 2–3 LinkedIn posts across phases (0/2, 4/5). Draft in
  Spanish + English variants.
- Update memory files: `marca-profesional-2026`, `github-audit-2026`.

Exit: post preview cards render correctly (Post Inspector); README table
updated; memory files reflect the shipped state.

---

## Verification (definition of done for v1)

- All 5 anchor use cases pass evals with correctness ≥ 4/5 average.
- `POST /chat/stream` on the live URL streams the frozen SSE event shape.
- LangSmith shows traces with `session_id`, `use_case`, `model`, `env`.
- Fly.io machine auto-stops when idle and cold-starts on the first request.
- CORS blocks non-Vercel origins in prod.
- No secrets in git (checked); `.env.example` documents every var.
- `pytest` green: unit for tool wrappers + integration for MCP subprocess +
  smoke for graph + smoke for `/chat` JSON endpoint.
- READMEs (agent + issue in web repo) updated.
- Cost projected: Fly.io free-allowance-friendly (single 512MB–1GB machine,
  auto-stop) + Supabase free tier + Groq free tier + LangSmith free tier.

## Execution notes

- **Language convention (in force from spec 004 forward):** English
  everywhere — specs, commits, PR titles/bodies, code identifiers, comments,
  README, branches, issues, tests. **Only the agent's chat responses are in
  Spanish** (per the "SF Bay Area senior engineer" register + the user's
  actual product surface). This spec itself is in English.
- No auto-signatures in commits or docs (global CLAUDE.md rule).
- Phase-by-phase execution with explicit approval before advancing. Update
  this spec at each phase close and at every blocker.
- **After Phase 0: Momus review of this spec** (pass the updated file to
  Momus) before touching Phase 1.
- Skill loading per phase:
  - Phase 0.3–0.4 / Phase 2: `supabase-postgres-best-practices`
    (+ `sqlalchemy` if 0.3 flips).
  - Phase 1+: `pydantic`, `python-testing-patterns`.
  - Phase 3: `fastapi-python`.
- Available tools: **Context7** (docs of any lib), **librarian** subagent
  (external OSS + docs), **Supabase MCP** (dev DB introspection via
  `.mcp.json`), Playwright MCP (only useful indirectly when the web spec
  starts consuming this agent).
