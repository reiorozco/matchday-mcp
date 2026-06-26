import { describe, it, expect } from "vitest";
import { FootballData } from "../src/footballdata.js";
import {
  getCurrentSeason,
  getStandingsHandler,
  findTeamHandler,
  getTeamMatchesHandler,
  compareTeamsHandler,
  ToolError,
} from "../src/tools.js";
import { routedFetch } from "./helpers.js";

const team = (id: number, name: string, shortName?: string) => ({
  id,
  name,
  shortName: shortName ?? null,
  tla: null,
  crest: null,
  founded: null,
  venue: null,
});

const finished = (id: number, date: string, homeId: number, home: string, awayId: number, away: string, hs: number, as: number) => ({
  id,
  utcDate: `${date}T15:00:00Z`,
  status: "FINISHED",
  matchday: 1,
  competition: { name: "Premier League" },
  homeTeam: { id: homeId, name: home, shortName: null, tla: null },
  awayTeam: { id: awayId, name: away, shortName: null, tla: null },
  score: { winner: null, fullTime: { home: hs, away: as } },
});

describe("getCurrentSeason", () => {
  it("uses the previous year before August (off-season / mid-season)", () => {
    expect(getCurrentSeason(new Date(2026, 0, 15))).toBe("2025"); // January
    expect(getCurrentSeason(new Date(2026, 6, 15))).toBe("2025"); // July
  });
  it("rolls to the new year from August onward", () => {
    expect(getCurrentSeason(new Date(2026, 7, 1))).toBe("2026"); // August
    expect(getCurrentSeason(new Date(2026, 8, 15))).toBe("2026"); // September
  });
});

describe("getStandingsHandler", () => {
  it("formats the league table", async () => {
    const body = {
      standings: [
        {
          type: "TOTAL",
          table: [
            { position: 1, team: { name: "Arsenal FC" }, playedGames: 38, won: 26, draw: 7, lost: 5, goalDifference: 44, points: 85 },
          ],
        },
      ],
    };
    const { impl } = routedFetch([{ match: "/competitions/PL/standings", body }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    const out = await getStandingsHandler(db, { competition: "Premier League", season: "2024" });
    expect(out).toContain("Premier League standings — 2024");
    expect(out).toContain("Arsenal FC");
    expect(out).toContain("85");
  });

  it("rejects an unknown competition with a ToolError (before any fetch)", async () => {
    const db = new FootballData({
      apiKey: "x",
      fetchImpl: (async () => {
        throw new Error("fetch should not be called");
      }) as unknown as typeof fetch,
    });
    await expect(getStandingsHandler(db, { competition: "Quidditch" })).rejects.toBeInstanceOf(ToolError);
  });
});

describe("findTeamHandler", () => {
  it("throws a ToolError when no team matches", async () => {
    const { impl } = routedFetch([{ match: "/competitions/", body: { teams: [] } }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    await expect(findTeamHandler(db, { name: "Nope FC" })).rejects.toBeInstanceOf(ToolError);
  });
});

describe("getTeamMatchesHandler", () => {
  it("derives a club's finished matches and computes a W/D/L form string", async () => {
    const matches = [
      finished(1, "2026-05-01", 64, "Liverpool FC", 99, "Foo FC", 3, 0), // W
      finished(2, "2026-05-08", 88, "Bar FC", 64, "Liverpool FC", 2, 0), // L
      finished(3, "2026-05-15", 64, "Liverpool FC", 77, "Baz FC", 1, 1), // D
    ];
    const { impl } = routedFetch([
      { match: "/competitions/PL/teams", body: { teams: [team(64, "Liverpool FC", "Liverpool")] } },
      { match: "/competitions/PL/matches", body: { matches } },
      { match: "/competitions/", body: { teams: [] } },
    ]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    const out = await getTeamMatchesHandler(db, { team: "Liverpool", status: "FINISHED", season: "2025" });
    expect(out).toContain("form: WLD");
    expect(out).toContain("Liverpool FC 3-0 Foo FC");
  });
});

describe("compareTeamsHandler", () => {
  it("compares two clubs' recent form", async () => {
    const matches = [
      finished(1, "2026-05-01", 64, "Liverpool FC", 65, "Manchester City FC", 2, 1), // LIV W, MCI L
    ];
    const { impl } = routedFetch([
      {
        match: "/competitions/PL/teams",
        body: { teams: [team(64, "Liverpool FC", "Liverpool"), team(65, "Manchester City FC", "Man City")] },
      },
      { match: "/competitions/PL/matches", body: { matches } },
      { match: "/competitions/", body: { teams: [] } },
    ]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    const out = await compareTeamsHandler(db, { teamA: "Liverpool", teamB: "Man City", season: "2025" });
    expect(out).toContain("Liverpool FC vs Manchester City FC");
    expect(out).toContain("Liverpool FC — form W");
    expect(out).toContain("Manchester City FC — form L");
  });
});
