# ⚽ matchday-mcp

[![npm version](https://img.shields.io/npm/v/matchday-mcp.svg)](https://www.npmjs.com/package/matchday-mcp)
[![CI](https://github.com/reiorozco/matchday-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/reiorozco/matchday-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![MCP](https://img.shields.io/badge/MCP-server-7c3aed.svg)](https://modelcontextprotocol.io)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives any MCP client
(Claude Desktop, Claude Code, …) live **football/soccer data** — standings, fixtures, results,
top scorers and team comparisons across Europe's top leagues.

Built with **TypeScript** + **Zod**, backed by the free [football-data.org](https://www.football-data.org) API.

> Ask Claude *"How is Real Madrid doing this season?"* or *"Compare Arsenal and Liverpool's recent form"*
> and it answers with real data through these tools.

## Demo

```text
> get_standings  { "competition": "La Liga" }

**La Liga standings — 2025**
 #  Team                         P   W  D  L   GD  Pts
 1  FC Barcelona               38  31  1  6   59   94
 2  Real Madrid CF             38  27  5  6   42   86
 3  Villarreal CF              38  22  6 10   26   72
 4  Club Atlético de Madrid    38  21  6 11   18   69
 ...
```

<!-- A short GIF of the tools running inside Claude Desktop will live here. -->

## Tools

| Tool | What it does |
|------|--------------|
| `get_standings` | League table for a competition (position, W/D/L, GD, points). |
| `get_matches` | Matches for a competition, filterable by status and matchday. |
| `get_top_scorers` | Top scorers for a competition. |
| `find_team` | Look up a club by name (country, stadium, founded year, competitions). |
| `get_team_matches` | A club's recent results or upcoming fixtures, with a W/D/L form string. |
| `compare_teams` | Compare two clubs by recent form (last 5) and W/D/L tally. |

Competitions (free tier): Premier League (`PL`), La Liga (`PD`), Bundesliga (`BL1`),
Serie A (`SA`), Ligue 1 (`FL1`), Eredivisie (`DED`), Primeira Liga (`PPL`), Championship (`ELC`),
Brazil Série A (`BSA`), Champions League (`CL`), World Cup (`WC`), European Championship (`EC`).
You can pass a competition by name (`"Premier League"`) or code (`"PL"`).

## Quick start (Claude Desktop)

1. **Get a free API token** at [football-data.org/client/register](https://www.football-data.org/client/register)
   (takes ~1 minute).

2. Add the server to your `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "matchday": {
         "command": "npx",
         "args": ["-y", "matchday-mcp"],
         "env": { "FOOTBALL_DATA_TOKEN": "your_free_token_here" }
       }
     }
   }
   ```

3. Restart Claude Desktop. Ask it about standings, fixtures, scorers or team form.

> Works the same in any MCP client. In **Claude Code**: `claude mcp add matchday -e FOOTBALL_DATA_TOKEN=your_token -- npx -y matchday-mcp`.

## Development

```bash
git clone https://github.com/reiorozco/matchday-mcp.git
cd matchday-mcp
npm install

export FOOTBALL_DATA_TOKEN=your_free_token   # required to hit the live API

npm run dev        # run the server over stdio (tsx)
npm test           # run the unit tests (no token needed — fetch is mocked)
npm run typecheck  # tsc --noEmit
npm run build      # bundle to dist/ with tsup
```

| Variable | Required | Description |
|----------|----------|-------------|
| `FOOTBALL_DATA_TOKEN` | yes | Free token from football-data.org. |

## Design notes

- **Zod-validated tools.** Every tool input is described and validated with Zod, so the model
  gets clear schemas and bad arguments fail fast with readable errors.
- **Caching + rate-limit resilience.** The free tier allows 10 req/min and returns HTTP 429
  when exceeded, so the client adds an in-memory TTL cache plus bounded retry/backoff.
- **Lazy team index.** football-data.org has no team-name search, so the client builds a
  name → id index across the domestic leagues *one league at a time with early exit* — a
  well-known club costs 1–2 requests, not a full sweep. Name resolution is ranked
  (exact → starts-with → shortest name), so `"Barcelona"` → *FC Barcelona*, not *RCD Espanyol*.
- **Off-season aware.** In the off-season the API's "current season" already points at the
  next, not-yet-started season (empty tables), so the default season rolls over in August.
- **Pure, testable handlers.** Tool logic lives in plain functions returning strings; the MCP
  wiring is a thin layer on top. The same data layer is reused by the
  [web playground](#) *(coming in the next release)*.

## Data

Data from [football-data.org](https://www.football-data.org). This project is not affiliated
with football-data.org or any league.

## License

[MIT](./LICENSE) © Reinaldo Orozco
