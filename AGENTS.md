# AGENTS.md — streamvault-v3-frontend

StreamVault v3 Fire TV UI. React 19 + norigin spatial navigation, targeting Amazon Fire TV / Android TV.

## Stack

- **Framework**: React 19 + Vite 5 + TypeScript (strict: noUncheckedIndexedAccess + exactOptionalPropertyTypes)
- **Styling**: Tailwind 4
- **TV navigation**: `@noriginmedia/norigin-spatial-navigation@2.1.0` (exact pin)
- **Test**: Vitest (unit) + Playwright (E2E, WebKit gate)
- **Accessibility**: axe-core + jsx-a11y strict
- **Video**: hls.js (dynamic import, ABR)
- **Deploy**: Docker (`streamvault-v3-frontend`, port 3006), auto-deploy via `workflow_run` on push to main
- **Design tokens**: Oxide system — CSS vars + TS constants in `src/tokens/`

## Key paths

| Path                        | Purpose                                                  |
| --------------------------- | -------------------------------------------------------- |
| `src/tokens/`               | Oxide design tokens (CSS vars + TS)                      |
| `src/components/`           | Button, Card, Skeleton, ErrorShell, FocusRing primitives |
| `src/nav/`                  | norigin focus management, back stack (`backStack.ts`)    |
| `src/routes/`               | Live, Movies, Series, Search, Favorites route shells     |
| `src/api/`                  | ApiClient (Bearer + auto-refresh on 401), Zod schemas    |
| `src/telemetry/`            | Telemetry event tracking                                 |
| `src/hooks/useHlsPlayer.ts` | HLS player hook (Phase 5a — pending)                     |
| `e2e/`                      | Playwright E2E specs                                     |
| `DECISIONS.md`              | Architecture decision log (JWT contract, etc.)           |

## Hard rules

1. **D-pad navigation via norigin only** — never `setTimeout` hold-timer; use rate-based detection for Fire TV Silk auto-tap pairs
2. **`useFocusable` on every interactive element** — raw `<input>`, `<button>` without wiring = broken on TV
3. **Bundle budget**: 600 KB gzip cap (Vite build gate)
4. **axe-core + jsx-a11y strict** — zero violations on every PR
5. **No direct main commits** — branch + PR, CI must pass

## Active status (2026-04-30)

- Prod: LIVE at `streamvault.srinivaskotha.uk` (NPM proxy → port 3006)
- Phases 0–4 complete; Phase 5a (Player Shell: HLS + OSD) is next
- Bundle: `index-Bz7Uccv7.js` (prod), auto-deploy on every push to main
- Tests: 342 Vitest + Playwright green

## Known constraints

- Phase 5a entry: `useHlsPlayer` hook (dynamic hls.js import, auto-retry 2×, ABR level control)
- `capLevelToPlayerSize` wiring — must land before Phase 5b
- Audio-tracks frontend integration (Option B PR 2/3) gated on backend PR #53 deploy
- Fire TV hardware smoke pending (user action)
- sv*e2e_test E2E auth tests skip in CI (no `SV_TEST*\*` secrets) — fail-fast skip guard in place
