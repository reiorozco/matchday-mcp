/**
 * The MCP tools, plus pure handler functions that contain all the logic.
 *
 * Handlers take a FootballData instance and validated args and return a plain string,
 * which keeps them trivially unit-testable; `registerTools` wraps them for the MCP server.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  FootballData,
  FootballDataError,
  resolveCompetitionCode,
  COMPETITIONS,
  type Match,
  type Scorer,
  type TableRow,
  type Team,
} from "./footballdata.js";

/** A controlled, user-facing tool error (vs. an unexpected crash). */
export class ToolError extends Error {}

/**
 * football-data.org season = the start year ("2024" = 2024-25). We default to the in-progress
 * or most recently completed season rather than the API's "current season", which in the
 * off-season already points at the next, not-yet-started season (empty tables). Cutover in August.
 */
export function getCurrentSeason(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12
  return String(month >= 8 ? year : year - 1);
}

const COMPETITION_HINT = `Use a league name or code: ${Object.keys(COMPETITIONS).join(", ")} (e.g. "Premier League" / "PL", "La Liga" / "PD").`;

function competitionOrThrow(input: string): string {
  const code = resolveCompetitionCode(input);
  if (!code) throw new ToolError(`Unknown competition "${input}". ${COMPETITION_HINT}`);
  return code;
}

async function teamOrThrow(db: FootballData, name: string): Promise<Team> {
  const team = await db.findTeam(name);
  if (!team) {
    throw new ToolError(
      `No team found matching "${name}" in the free-tier leagues. Try the full club name, e.g. "Real Madrid".`,
    );
  }
  return team;
}

/**
 * A team's matches in its domestic league for a season, sorted chronologically. Derived from
 * the competition's match list filtered by team id — the per-team endpoint is unreliable on the
 * free tier, and this scopes cleanly to the league we indexed the team under.
 */
async function teamLeagueMatches(db: FootballData, team: Team, season: string): Promise<Match[]> {
  const code = db.competitionCodeForTeam(team.id);
  if (!code) {
    throw new ToolError(`Couldn't determine a league for ${team.name}.`);
  }
  const all = await db.competitionMatches(code, { season });
  return all
    .filter((m) => m.homeTeam.id === team.id || m.awayTeam.id === team.id)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate));
}

// ── Formatting ───────────────────────────────────────────────────────────────

const date = (iso: string) => iso.slice(0, 10);
const time = (iso: string) => iso.slice(11, 16);

function formatStandings(rows: TableRow[], title: string): string {
  const header = `**${title}**\n #  Team                         P   W  D  L   GD  Pts`;
  const lines = rows.map((r) => {
    const pos = String(r.position).padStart(2);
    const name = r.team.name.slice(0, 26).padEnd(26);
    const p = String(r.playedGames).padStart(2);
    const w = String(r.won).padStart(2);
    const d = String(r.draw).padStart(2);
    const l = String(r.lost).padStart(2);
    const gd = String(r.goalDifference).padStart(3);
    const pts = String(r.points).padStart(3);
    return `${pos}  ${name} ${p}  ${w} ${d} ${l}  ${gd}  ${pts}`;
  });
  return [header, ...lines].join("\n");
}

function formatMatch(m: Match): string {
  const home = m.homeTeam.name ?? "TBD";
  const away = m.awayTeam.name ?? "TBD";
  if (m.status === "FINISHED") {
    return `- ${date(m.utcDate)} — ${home} ${m.score.fullTime.home}-${m.score.fullTime.away} ${away}`;
  }
  return `- ${date(m.utcDate)} ${time(m.utcDate)} — ${home} vs ${away} (${m.status.toLowerCase()})`;
}

function formatScorer(s: Scorer, i: number): string {
  const rank = String(i + 1).padStart(2);
  const goals = String(s.goals).padStart(2);
  return `${rank}. ${goals} goals — ${s.player.name} (${s.team.name})`;
}

function formatTeam(t: Team): string {
  const comps = t.runningCompetitions?.map((c) => c.name).join(", ");
  return [
    `**${t.name}**${t.tla ? ` (${t.tla})` : ""}`,
    t.area?.name ? `Country: ${t.area.name}` : null,
    t.venue ? `Stadium: ${t.venue}` : null,
    t.founded ? `Founded: ${t.founded}` : null,
    comps ? `Competitions: ${comps}` : null,
    t.website ? `Website: ${t.website}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** W/D/L from one team's perspective for a finished match. */
function outcomeFor(teamId: number, m: Match): "W" | "D" | "L" | "?" {
  const { home, away } = m.score.fullTime;
  if (home == null || away == null) return "?";
  const isHome = m.homeTeam.id === teamId;
  const us = isHome ? home : away;
  const them = isHome ? away : home;
  if (us > them) return "W";
  if (us < them) return "L";
  return "D";
}

// ── Pure handlers ────────────────────────────────────────────────────────────

export async function getStandingsHandler(
  db: FootballData,
  args: { competition: string; season?: string },
): Promise<string> {
  const code = competitionOrThrow(args.competition);
  const season = args.season ?? getCurrentSeason();
  const rows = await db.standings(code, season);
  if (rows.length === 0) return `No standings available for ${args.competition} (season ${season}).`;
  return formatStandings(rows, `${args.competition} standings — ${season}`);
}

export async function getMatchesHandler(
  db: FootballData,
  args: { competition: string; status?: string; matchday?: number; season?: string },
): Promise<string> {
  const code = competitionOrThrow(args.competition);
  const params: Record<string, string> = { season: args.season ?? getCurrentSeason() };
  if (args.status) params.status = args.status.toUpperCase();
  if (args.matchday != null) params.matchday = String(args.matchday);
  const matches = await db.competitionMatches(code, params);
  if (matches.length === 0) return `No matches found for ${args.competition} with those filters.`;
  const title = `${args.competition} matches${args.matchday != null ? ` — matchday ${args.matchday}` : ""}`;
  return [`**${title}**`, ...matches.slice(0, 30).map(formatMatch)].join("\n");
}

export async function getTopScorersHandler(
  db: FootballData,
  args: { competition: string; limit?: number; season?: string },
): Promise<string> {
  const code = competitionOrThrow(args.competition);
  const season = args.season ?? getCurrentSeason();
  const scorers = await db.scorers(code, args.limit ?? 10, season);
  if (scorers.length === 0) return `No scorer data available for ${args.competition} (season ${season}).`;
  return [`**${args.competition} — top scorers (${season})**`, ...scorers.map(formatScorer)].join("\n");
}

export async function findTeamHandler(db: FootballData, args: { name: string }): Promise<string> {
  const team = await teamOrThrow(db, args.name);
  return formatTeam(team);
}

export async function getTeamMatchesHandler(
  db: FootballData,
  args: { team: string; status?: string; limit?: number; season?: string },
): Promise<string> {
  const team = await teamOrThrow(db, args.team);
  const season = args.season ?? getCurrentSeason();
  const limit = args.limit ?? 5;
  const matches = await teamLeagueMatches(db, team, season);
  if (matches.length === 0) return `No league matches found for ${team.name} in season ${season}.`;

  let selected: Match[];
  if (args.status === "FINISHED") {
    selected = matches.filter((m) => m.status === "FINISHED").slice(-limit);
  } else if (args.status) {
    const want = args.status.toUpperCase();
    selected = matches.filter((m) => m.status === want).slice(0, limit);
  } else {
    // Default: most recent finished, falling back to upcoming if the season hasn't started.
    const finished = matches.filter((m) => m.status === "FINISHED");
    selected = finished.length
      ? finished.slice(-limit)
      : matches.filter((m) => m.status !== "FINISHED").slice(0, limit);
  }
  if (selected.length === 0) return `No matches found for ${team.name} with those filters.`;

  const form = selected.filter((m) => m.status === "FINISHED").map((m) => outcomeFor(team.id, m)).join("");
  const header = `**${team.name} — matches (${season})**${form ? ` (form: ${form})` : ""}`;
  return [header, ...selected.map(formatMatch)].join("\n");
}

export async function compareTeamsHandler(
  db: FootballData,
  args: { teamA: string; teamB: string; season?: string },
): Promise<string> {
  const [a, b] = await Promise.all([teamOrThrow(db, args.teamA), teamOrThrow(db, args.teamB)]);
  const season = args.season ?? getCurrentSeason();
  const [aAll, bAll] = await Promise.all([
    teamLeagueMatches(db, a, season),
    teamLeagueMatches(db, b, season),
  ]);
  const last5 = (id: number, all: Match[]) => all.filter((m) => m.status === "FINISHED" && (m.homeTeam.id === id || m.awayTeam.id === id)).slice(-5);
  const aMatches = last5(a.id, aAll);
  const bMatches = last5(b.id, bAll);
  const tally = (id: number, matches: Match[]) => {
    const o = matches.map((m) => outcomeFor(id, m));
    return {
      form: o.join("") || "n/a",
      w: o.filter((x) => x === "W").length,
      d: o.filter((x) => x === "D").length,
      l: o.filter((x) => x === "L").length,
    };
  };
  const ta = tally(a.id, aMatches);
  const tb = tally(b.id, bMatches);
  return [
    `**${a.name} vs ${b.name}** — last 5 (${season})`,
    "",
    `${a.name} — form ${ta.form}  (${ta.w}W ${ta.d}D ${ta.l}L)`,
    `${b.name} — form ${tb.form}  (${tb.w}W ${tb.d}D ${tb.l}L)`,
    "",
    `${a.name} recent results:`,
    ...aMatches.map(formatMatch),
    "",
    `${b.name} recent results:`,
    ...bMatches.map(formatMatch),
  ].join("\n");
}

// ── MCP registration ─────────────────────────────────────────────────────────

const asText = (text: string) => ({ content: [{ type: "text" as const, text }] });

/** Wrap a pure handler so ToolError/FootballDataError surface as readable tool errors. */
function wrap<A>(db: FootballData, fn: (db: FootballData, args: A) => Promise<string>) {
  return async (args: A) => {
    try {
      return asText(await fn(db, args));
    } catch (err) {
      if (err instanceof ToolError || err instanceof FootballDataError) {
        return { content: [{ type: "text" as const, text: `⚠️ ${err.message}` }], isError: true };
      }
      throw err;
    }
  };
}

const competitionField = z
  .string()
  .min(1)
  .describe(`Competition name or code. ${COMPETITION_HINT}`);
const seasonField = z
  .string()
  .regex(/^\d{4}$/)
  .optional()
  .describe("Season start year as 'YYYY', e.g. '2024' for 2024-25. Defaults to current.");

export function registerTools(server: McpServer, db: FootballData): void {
  server.registerTool(
    "get_standings",
    {
      title: "Get league standings",
      description: "Get the current league table for a competition (position, W/D/L, GD, points).",
      inputSchema: { competition: competitionField, season: seasonField },
    },
    wrap(db, getStandingsHandler),
  );

  server.registerTool(
    "get_matches",
    {
      title: "Get competition matches",
      description:
        "Get matches for a competition. Filter by status (SCHEDULED/FINISHED/IN_PLAY) and/or matchday.",
      inputSchema: {
        competition: competitionField,
        status: z
          .enum(["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED", "POSTPONED"])
          .optional()
          .describe("Match status filter"),
        matchday: z.number().int().positive().optional().describe("Matchday number"),
        season: seasonField,
      },
    },
    wrap(db, getMatchesHandler),
  );

  server.registerTool(
    "get_top_scorers",
    {
      title: "Get top scorers",
      description: "Get the top scorers for a competition.",
      inputSchema: {
        competition: competitionField,
        limit: z.number().int().min(1).max(50).optional().describe("How many scorers (default 10)"),
        season: seasonField,
      },
    },
    wrap(db, getTopScorersHandler),
  );

  server.registerTool(
    "find_team",
    {
      title: "Find a team",
      description:
        "Look up a club by name across the major leagues. Returns country, stadium, founding year and competitions.",
      inputSchema: { name: z.string().min(1).describe("Club name, e.g. 'Real Madrid'") },
    },
    wrap(db, findTeamHandler),
  );

  server.registerTool(
    "get_team_matches",
    {
      title: "Get team matches",
      description:
        "Get a club's matches (recent results or upcoming fixtures), with a W/D/L form string.",
      inputSchema: {
        team: z.string().min(1).describe("Club name, e.g. 'Liverpool'"),
        status: z
          .enum(["SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "FINISHED", "POSTPONED"])
          .optional()
          .describe("Match status filter (default: most recent)"),
        limit: z.number().int().min(1).max(50).optional().describe("How many matches (default 5)"),
        season: seasonField,
      },
    },
    wrap(db, getTeamMatchesHandler),
  );

  server.registerTool(
    "compare_teams",
    {
      title: "Compare two teams",
      description: "Compare two clubs by recent form (last 5 results) and W/D/L tally.",
      inputSchema: {
        teamA: z.string().min(1).describe("First club name"),
        teamB: z.string().min(1).describe("Second club name"),
        season: seasonField,
      },
    },
    wrap(db, compareTeamsHandler),
  );
}
