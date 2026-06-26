import { describe, it, expect } from "vitest";
import { FootballData, FootballDataError, resolveCompetitionCode } from "../src/footballdata.js";
import { fakeResponse, routedFetch } from "./helpers.js";

const team = (id: number, name: string, shortName?: string, tla?: string) => ({
  id,
  name,
  shortName: shortName ?? null,
  tla: tla ?? null,
  crest: null,
  founded: null,
  venue: null,
});

describe("resolveCompetitionCode", () => {
  it("passes through valid codes (case-insensitive)", () => {
    expect(resolveCompetitionCode("PL")).toBe("PL");
    expect(resolveCompetitionCode("pd")).toBe("PD");
  });

  it("resolves human aliases", () => {
    expect(resolveCompetitionCode("Premier League")).toBe("PL");
    expect(resolveCompetitionCode("la liga")).toBe("PD");
    expect(resolveCompetitionCode("Bundesliga")).toBe("BL1");
  });

  it("returns null for unknown competitions", () => {
    expect(resolveCompetitionCode("Quidditch League")).toBeNull();
  });
});

describe("FootballData.get — caching", () => {
  it("caches identical requests within the TTL", async () => {
    const { impl, calls } = routedFetch([{ match: "/standings", body: { standings: [] } }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    await db.standings("PL", "2024");
    await db.standings("PL", "2024");
    expect(calls.length).toBe(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const { impl, calls } = routedFetch([{ match: "/standings", body: { standings: [] } }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl, cacheTtlMs: 0 });
    await db.standings("PL", "2024");
    await db.standings("PL", "2024");
    expect(calls.length).toBe(2);
  });
});

describe("FootballData.get — errors & retries", () => {
  it("throws when no token is configured", async () => {
    const db = new FootballData({ apiKey: "" });
    await expect(db.standings("PL")).rejects.toThrow(/token/i);
  });

  it("retries on 429 and then succeeds", async () => {
    let n = 0;
    const impl = (async () => {
      n++;
      return n === 1 ? fakeResponse(429, {}) : fakeResponse(200, { standings: [] });
    }) as unknown as typeof fetch;
    const db = new FootballData({ apiKey: "x", fetchImpl: impl, retryDelayMs: 0 });
    await expect(db.standings("PL", "2024")).resolves.toEqual([]);
    expect(n).toBe(2);
  });

  it("throws a 429 error after exhausting retries", async () => {
    const { impl } = routedFetch([{ match: "/standings", status: 429 }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl, retryDelayMs: 0, maxRetries: 1 });
    await expect(db.standings("PL", "2024")).rejects.toMatchObject({ status: 429 });
  });

  it("throws a clear error on 403 (restricted resource)", async () => {
    const { impl } = routedFetch([{ match: "/standings", status: 403 }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    await expect(db.standings("PL", "2024")).rejects.toBeInstanceOf(FootballDataError);
  });
});

describe("FootballData.standings", () => {
  it("returns the TOTAL table", async () => {
    const body = {
      standings: [
        { type: "HOME", table: [{ position: 1 }] },
        { type: "TOTAL", table: [{ position: 1, team: { name: "Arsenal FC" }, points: 85 }] },
      ],
    };
    const { impl } = routedFetch([{ match: "/standings", body }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    const rows = await db.standings("PL", "2024");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.points).toBe(85);
  });
});

describe("FootballData.findTeam", () => {
  it("ranks partial matches (shortest name wins) and records the league code", async () => {
    const { impl, calls } = routedFetch([
      { match: "/competitions/PL/teams", body: { teams: [team(57, "Arsenal FC", "Arsenal", "ARS")] } },
      {
        match: "/competitions/PD/teams",
        body: {
          teams: [
            team(80, "RCD Espanyol de Barcelona", "Espanyol", "ESP"),
            team(81, "FC Barcelona", "Barça", "FCB"),
          ],
        },
      },
      { match: "/competitions/", body: { teams: [] } }, // fallback for other leagues
    ]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });

    const match = await db.findTeam("Barcelona");
    expect(match?.name).toBe("FC Barcelona");
    expect(db.competitionCodeForTeam(81)).toBe("PD");
    // Early exit: scans only PL then PD, not the remaining leagues.
    expect(calls.length).toBe(2);
  });

  it("returns null when nothing matches", async () => {
    const { impl } = routedFetch([{ match: "/competitions/", body: { teams: [] } }]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    expect(await db.findTeam("Nonexistent United")).toBeNull();
  });

  it("matches exactly by short name", async () => {
    const { impl } = routedFetch([
      { match: "/competitions/PL/teams", body: { teams: [team(65, "Manchester City FC", "Man City", "MCI")] } },
      { match: "/competitions/", body: { teams: [] } },
    ]);
    const db = new FootballData({ apiKey: "x", fetchImpl: impl });
    const match = await db.findTeam("Man City");
    expect(match?.id).toBe(65);
  });
});
