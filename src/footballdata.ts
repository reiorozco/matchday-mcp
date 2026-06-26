/**
 * Thin, cached client for the football-data.org API (v4).
 *
 * The free tier requires a token (X-Auth-Token header) and is capped at 10 requests/minute,
 * returning HTTP 429 when exceeded, so this client adds an in-memory TTL cache plus bounded
 * retry/backoff. It also lazily builds and caches a team name → id index across the free
 * competitions, since the API has no team-name search endpoint. The MCP tools and the Svelte
 * playground both reuse this single layer.
 */

const DEFAULT_BASE_URL = "https://api.football-data.org/v4";
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min — football data changes slowly

/** Free-tier competitions, mapped to their human aliases. Key = football-data.org code. */
export const COMPETITIONS: Record<string, string[]> = {
  PL: ["premier league", "epl", "english premier league", "premier"],
  PD: ["la liga", "laliga", "primera division", "spanish la liga"],
  BL1: ["bundesliga", "german bundesliga"],
  SA: ["serie a", "italian serie a"],
  FL1: ["ligue 1", "french ligue 1"],
  DED: ["eredivisie", "dutch eredivisie"],
  PPL: ["primeira liga", "portuguese liga", "liga portugal"],
  ELC: ["championship", "english championship", "efl championship"],
  BSA: ["brasileirao", "brazil serie a", "campeonato brasileiro", "serie a brazil"],
  CL: ["champions league", "ucl", "uefa champions league"],
  WC: ["world cup", "fifa world cup"],
  EC: ["euro", "euros", "european championship"],
};

/** Domestic leagues to scan when resolving a team by name (skip CL/WC/EC: same clubs appear here). */
const TEAM_INDEX_CODES = ["PL", "PD", "BL1", "SA", "FL1", "DED", "PPL", "ELC", "BSA"];

export interface TableRow {
  position: number;
  team: { id: number; name: string; shortName: string | null; tla: string | null; crest: string | null };
  playedGames: number;
  form: string | null;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface MatchSide {
  id: number | null;
  name: string | null;
  shortName: string | null;
  tla: string | null;
}

export interface Match {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  competition: { name: string } | null;
  homeTeam: MatchSide;
  awayTeam: MatchSide;
  score: { winner: string | null; fullTime: { home: number | null; away: number | null } };
}

export interface Scorer {
  player: { id: number; name: string; nationality: string | null };
  team: { id: number; name: string };
  goals: number;
  assists: number | null;
  penalties: number | null;
  playedMatches: number | null;
}

export interface Team {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  founded: number | null;
  venue: string | null;
  website: string | null;
  area?: { name: string | null } | null;
  runningCompetitions?: { name: string }[];
}

export interface FootballDataOptions {
  apiKey?: string;
  baseUrl?: string;
  cacheTtlMs?: number;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Retries on HTTP 429 before giving up. */
  maxRetries?: number;
  /** Base backoff in ms (doubles each retry). Set to 0 in tests. */
  retryDelayMs?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class FootballDataError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "FootballDataError";
  }
}

/** Resolve a free-text competition name or code to a football-data.org code, or null. */
export function resolveCompetitionCode(input: string): string | null {
  const upper = input.trim().toUpperCase();
  if (upper in COMPETITIONS) return upper;
  const lower = input.trim().toLowerCase();
  for (const [code, aliases] of Object.entries(COMPETITIONS)) {
    if (aliases.some((a) => a === lower)) return code;
  }
  for (const [code, aliases] of Object.entries(COMPETITIONS)) {
    if (aliases.some((a) => a.includes(lower) || lower.includes(a))) return code;
  }
  return null;
}

export class FootballData {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly cacheTtlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly cache = new Map<string, { expires: number; data: unknown }>();
  private readonly teamIndex = new Map<string, Team>();
  private readonly teamCompCode = new Map<number, string>();
  private readonly scannedCodes = new Set<string>();

  constructor(options: FootballDataOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.FOOTBALL_DATA_TOKEN ?? "";
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1500;
  }

  /** Cached GET against an API endpoint (e.g. "/competitions/PL/standings", { season: "2024" }). */
  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    if (!this.apiKey) {
      throw new FootballDataError(
        "Missing football-data.org token. Set FOOTBALL_DATA_TOKEN (free at football-data.org).",
      );
    }
    const query = new URLSearchParams(params).toString();
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;

    const cached = this.cache.get(url);
    if (cached && cached.expires > Date.now()) {
      return cached.data as T;
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { headers: { "X-Auth-Token": this.apiKey } });
      } catch (err) {
        lastError = err;
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new FootballDataError(
          `Network error calling football-data.org: ${(err as Error).message}`,
        );
      }

      if (res.status === 429) {
        // Rate limited (10 req/min on the free tier). Back off and retry.
        if (attempt < this.maxRetries) {
          await sleep(this.retryDelayMs * 2 ** attempt);
          continue;
        }
        throw new FootballDataError(
          "football-data.org rate limit reached (10 req/min on the free tier). Try again shortly.",
          429,
        );
      }

      if (res.status === 403) {
        throw new FootballDataError(
          "This resource isn't available on the free tier (competition or season restricted).",
          403,
        );
      }

      if (!res.ok) {
        throw new FootballDataError(`football-data.org responded with HTTP ${res.status}`, res.status);
      }

      const data = (await res.json()) as T;
      this.cache.set(url, { expires: Date.now() + this.cacheTtlMs, data });
      return data;
    }

    throw new FootballDataError(
      `Failed to reach football-data.org: ${(lastError as Error)?.message ?? "unknown error"}`,
    );
  }

  async standings(code: string, season?: string): Promise<TableRow[]> {
    const data = await this.get<{ standings: { type: string; table: TableRow[] }[] }>(
      `/competitions/${code}/standings`,
      season ? { season } : {},
    );
    const total = data.standings.find((s) => s.type === "TOTAL") ?? data.standings[0];
    return total?.table ?? [];
  }

  async competitionMatches(code: string, params: Record<string, string> = {}): Promise<Match[]> {
    const data = await this.get<{ matches: Match[] }>(`/competitions/${code}/matches`, params);
    return data.matches ?? [];
  }

  async scorers(code: string, limit = 10, season?: string): Promise<Scorer[]> {
    const params: Record<string, string> = { limit: String(limit) };
    if (season) params.season = season;
    const data = await this.get<{ scorers: Scorer[] }>(`/competitions/${code}/scorers`, params);
    return data.scorers ?? [];
  }

  private async competitionTeams(code: string): Promise<Team[]> {
    const data = await this.get<{ teams: Team[] }>(`/competitions/${code}/teams`);
    return data.teams ?? [];
  }

  /**
   * Resolve a team by name. Scans the domestic free-tier leagues one at a time, accumulating
   * a name → team index and returning as soon as there's a match — so a well-known club costs
   * 1–2 requests instead of a full sweep. Prefers exact (name/shortName/TLA, case-insensitive)
   * matches, then partial. Scanned competitions and the index persist for the client's lifetime.
   */
  async findTeam(name: string): Promise<Team | null> {
    const query = name.trim().toLowerCase();
    const tryMatch = (): Team | null => {
      const exact = this.teamIndex.get(query);
      if (exact) return exact;
      // Rank partial matches: keys that start with the query win, then the shortest team
      // name (so "Barcelona" → "FC Barcelona", not "RCD Espanyol de Barcelona").
      const candidates: { key: string; team: Team }[] = [];
      for (const [key, team] of this.teamIndex) {
        if (key.includes(query) || query.includes(key)) candidates.push({ key, team });
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const aStarts = a.key.startsWith(query) ? 0 : 1;
        const bStarts = b.key.startsWith(query) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.team.name.length - b.team.name.length;
      });
      return candidates[0]!.team;
    };

    let match = tryMatch();
    if (match) return match;

    for (const code of TEAM_INDEX_CODES) {
      if (this.scannedCodes.has(code)) continue;
      this.scannedCodes.add(code);
      let teams: Team[];
      try {
        teams = await this.competitionTeams(code);
      } catch {
        continue; // skip competitions that error (e.g. transient 403/429)
      }
      for (const t of teams) {
        if (!this.teamCompCode.has(t.id)) this.teamCompCode.set(t.id, code);
        for (const key of [t.name, t.shortName, t.tla].filter(Boolean) as string[]) {
          const k = key.toLowerCase();
          if (!this.teamIndex.has(k)) this.teamIndex.set(k, t);
        }
      }
      match = tryMatch();
      if (match) return match;
    }
    return null;
  }

  /** Domestic league code a team was indexed under (set by findTeam), if known. */
  competitionCodeForTeam(teamId: number): string | undefined {
    return this.teamCompCode.get(teamId);
  }
}
