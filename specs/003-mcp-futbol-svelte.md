# 003 — MCP server de fútbol (TS + Zod) + playground Svelte 5

Estado global: **Fase 0-4 ✅ (npm publicado + web desplegado) · solo falta GIF (opcional) → Fase 6 (marca) pendiente**

Publicado: **matchday-mcp@0.1.0** en npm (https://www.npmjs.com/package/matchday-mcp).
`npx matchday-mcp` verificado en vivo (6 tools por stdio). El usuario activó 2FA en npm.
Único pendiente menor de Fase 3: GIF demo en Claude Desktop para el README.

### Fase 4 — COMPLETA (desplegada en vivo)
Playground SvelteKit + Svelte 5 (runes) + Tailwind v4. Hero oscuro "floodlit" → dashboard
claro con 4 pestañas (Standings/Team/Compare/Scorers) sobre rutas server `/api/*` con token
server-only. Diseño guiado por skill impeccable (indigo + Archivo Expanded; evita reflejos
verde-césped/ESPN). **En vivo: https://matchday-mcp-web.vercel.app** — verificado con
Playwright (desktop + móvil, 0 errores de consola, datos reales). API en vivo OK (standings,
team, compare, scorers), og.png OK. svelte-check 0 errores, build prod OK.
- Deploy hecho por CLI: `vercel link` (repo GitHub conectado → auto-deploy en push a main),
  env `FOOTBALL_DATA_TOKEN` en Production+Preview, `vercel deploy --prod`. Team
  `reiorozcos-projects`. `.env*` y `.vercel` gitignored (token nunca en git).
- **Pase de pulido (skill impeccable `polish`)**: contraste verificado WCAG AA (canvas-resolved:
  7.1–8.3, blanco/indigo 5.78); reduced-motion safety net global; tabs del dashboard con patrón
  ARIA completo + teclado (flechas/Home/End); chips de liga `aria-pressed` (filtros) + tap
  target; CTAs hero inline-flex (hover-lift); runtime Vercel fijado `nodejs22.x`. Desplegado.
  Nota entorno: `brew` subió Node local a v26 → adapter-vercel exige runtime explícito para
  build local.

Repos públicos:
- MCP: https://github.com/reiorozco/matchday-mcp (MIT, CI verde, 0 alertas/PRs/vulns). Nombre libre en npm.
- Web: https://github.com/reiorozco/matchday-mcp-web (SvelteKit + Svelte 5 + Tailwind v4).
Pendiente Fase 3: cuenta npm (no tiene) + `npm login` → publicar; GIF en Claude Desktop.
Pendiente Fase 4: deploy del web en Vercel + env `FOOTBALL_DATA_TOKEN` (dashboard del usuario).

Repo local: `~/Dev/matchday-mcp` (git init, sin commits aún). Token gratis del usuario
guardado SOLO como env `FOOTBALL_DATA_TOKEN` (nunca en git); irá en env de Vercel.

## Objetivo

Construir un artefacto público nuevo que cierre el gap de marca (headline "Svelte 5 +
AI/MCP" vs GitHub 100% React). Dos piezas que se refuerzan:

1. **MCP server** en TypeScript con schemas Zod, espejo no-propietario de lo que hago en
   Fleet (MCP + Zod). Publicado en GitHub + npm, ejecutable con `npx`.
2. **Playground Svelte 5** (runes) desplegado en Vercel: landing que explica el server +
   dashboard interactivo de fútbol usando la misma capa de datos.

Reemplaza a `vidly-app` en los 3 destacados de LinkedIn. `vidly-api` se conserva como
credencial de backend/tests/CI (ya no al frente).

## Fuente de datos

**football-data.org API v4** (decidido en Fase 1). La key de prueba `123` de TheSportsDB
truncaba todo (tabla=top5, 1 fixture, solo 5 ligas) → no servía para un flagship pulido.
football-data.org free: **token gratis** (header `X-Auth-Token`, registro ~1 min), límite
**10 req/min**, **12 competiciones top** (PL, PD/La Liga, BL1, SA, FL1, CL, DED, PPL, ELC,
BSA, WC, EC) con standings completos, partidos, goleadores y team matches.
- Token vía env `FOOTBALL_DATA_TOKEN` (nunca en git). Quien corra el MCP usa su propio
  token gratis; el playground en Vercel usa nuestro token server-side (cero fricción para
  reclutadores).
- Límite 10 req/min → caché TTL + retry/backoff en 429. Sin endpoint de búsqueda de equipo
  por nombre → se construye y cachea un índice nombre→id a partir de las ligas domésticas.

## Decisiones (Fase 0) — CERRADAS

- **Nombre del paquete/repo:** `matchday-mcp`.
- **Scope npm:** sin scope → `matchday-mcp` (mejor con `npx`).
- **Demo AI (Fase 5):** stretch opcional. El playground funciona sin AI (dashboard
  directo) → siempre arriba y gratis; el chat AI se añade después si se quiere.

---

### Fase 1 — Notas de cierre (verificado en vivo)

- 6 tools funcionando con datos reales; protocolo MCP stdio OK (initialize + tools/list +
  tools/call probados). typecheck + build verdes.
- **Lecciones football-data free tier:**
  - Offseason: la "current season" de la API ya apunta a la temporada nueva sin empezar
    (tabla vacía). → `getCurrentSeason()` con cutover en agosto, se pasa season explícita.
  - `/teams/{id}/matches` es errático (403 en algunos clubes p. ej. Barcelona). → partidos
    de un club se DERIVAN de `/competitions/{code}/matches?season=` filtrando por team.id;
    el índice nombre→id guarda también el código de liga de cada club.
  - 10 req/min → caché TTL + retry/backoff 429; `findTeam` escanea liga por liga con salida
    temprana (club común = 1-2 llamadas).
  - Resolución de equipo rankeada: exacto > empieza-con > nombre más corto
    ("Barcelona" → FC Barcelona, no Espanyol).

## Fase 1 — Core del MCP server

- Repo TS: `@modelcontextprotocol/sdk`, `zod`, `tsup` (build), `vitest`, `tsx`.
- Transporte **stdio** (Claude Desktop) y exportar la capa de datos para reuso del
  playground.
- **Capa de datos** `thesportsdb.ts`: fetch + caché en memoria con TTL + manejo de 429
  (backoff/cola) → punto de ingeniería frente al límite 30 req/min.
- **Tools (6)** con input Zod validado y descripciones claras:
  1. `get_standings` — tabla completa de una competición.
  2. `get_matches` — partidos de una competición (filtros status/matchday).
  3. `get_top_scorers` — goleadores de una competición.
  4. `find_team` — resolver club por nombre (índice cacheado) → país, estadio, año, comps.
  5. `get_team_matches` — partidos de un club (resultados/fixtures) + form W/D/L.
  6. `compare_teams` — comparar dos clubes por forma reciente (últimos 5) y tally W/D/L.

## Fase 2 — Tests + CI ✅

- **20 tests** (Vitest, `fetch` mockeado vía `fetchImpl`):
  - `footballdata`: caché hit / TTL refetch, retry en 429 + agotamiento, 403, falta de token,
    parseo de tabla TOTAL, `findTeam` ranking/early-exit/null, match por short name.
  - `tools`: `getCurrentSeason` (cutover agosto), formateo de tabla, competición desconocida
    (ToolError sin fetch), equipo no encontrado, derivación de partidos + form W/D/L, compare.
- CI `.github/workflows/ci.yml`: matriz Node 20/22, `npm ci → typecheck → test → build`.
  No requiere secrets (fetch mockeado). Secuencia verificada localmente en verde.
- Nota: queda 1 alerta `low` dev-only (esbuild dev-server en Windows, transitiva de
  tsup/tsx/vitest, no se publica). Sin fix no-breaking; se deja documentada.

## Fase 3 — README + publicación + verificación en Claude Desktop

- README excelente: qué es MCP, qué hace, badges (npm, CI, licencia MIT), tabla de tools,
  bloque de config para `claude_desktop_config.json` (`npx matchday-mcp`), GIF del server
  respondiendo en Claude Desktop, enlace al playground.
- Publicar en **GitHub** (público, MIT, dependabot.yml, topics) + **npm** (`bin` → `npx`).
- Verificar de punta a punta en Claude Desktop y capturar el GIF.

## Fase 4 — Playground Svelte 5 + deploy

- SvelteKit + **Svelte 5 runes** ($state/$derived/$effect). Diseño limpio y responsive.
- Landing que explica el MCP server (con el snippet de instalación) + **dashboard**:
  buscar equipo, ver próximos partidos / últimos resultados, comparar dos equipos.
  Reutiliza la capa de datos (vía route handler de SvelteKit para no exponer y para
  cachear server-side).
- OG tags + título correctos (lección de la auditoría). Deploy en **Vercel**, rama `main`,
  Production Branch = main.

## Fase 5 — (Stretch, opcional) Demo AI "pregúntale a la liga"

- Route server-side con Claude API (modelo Haiku) usando el MCP server como herramientas
  (MCP connector) → el visitante pregunta en lenguaje natural y Claude usa las tools.
- Rate-limit por IP + posibles respuestas cacheadas para acotar coste. Usar la skill
  `claude-api` como referencia del SDK/connector.

## Fase 6 — Integración de marca

- LinkedIn: añadir el proyecto a destacados (sustituye a `vidly-app`); descripción EN/ES;
  thumbnail/OG correcto (Post Inspector).
- Perfil README (`reiorozco`): añadir a la tabla de proyectos destacados.
- Portafolio (`portafoliov2-ro`): se incorporará cuando se haga su revisión (chat aparte),
  ya con este proyecto existente → sin retrabajo.
- Actualizar memoria (`marca-profesional-2026`, `github-audit-2026`).

---

## Verificación

- **Server:** `npm ci && npm run build && npm test` verde; `npx matchday-mcp` arranca por
  stdio; tools responden en Claude Desktop con datos reales (GIF).
- **Playground:** desplegado HTTP 200, 0 errores de consola (Playwright), responsive,
  OG correcto en Post Inspector.
- **Marca:** card de LinkedIn con preview correcto; perfil README actualizado.

## Notas de ejecución

- Español; sin firmas automáticas en commits/docs (CLAUDE.md global).
- Cambios por fases con OK explícito antes de avanzar; actualizar este spec al cerrar cada
  fase o al encontrar bloqueadores.
- Herramientas disponibles: skill `claude-api`, `claude-code-guide`, Playwright MCP,
  Vercel MCP.
