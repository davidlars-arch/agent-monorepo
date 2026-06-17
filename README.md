# Project Sphere

An OpenClaw project atlas with a 3D repo globe, Unity RPG slice, analytics POC, and repo health loop.

## Structure

- `apps/*` - deployable applications and user-facing surfaces.
- `packages/*` - shared libraries and internal platform code.
- `games/*` - game projects, including Unity source and generated WebGL output.
- `analytics/*` - analytics engineering projects such as dbt Core + DuckDB POCs.
- `docs/*` - architecture notes, operating decisions, and product/design context.

This follows the usual large-monorepo split: deployables in `apps`, reusable code in `packages`, domain-specific project roots for specialized work, and docs/tooling kept visible at the root instead of buried in random app folders.

## First Commands

```bash
npm install
npm run dev
```

The web app runs from `apps/web`.

## Loops

The repo health loop lives in `loops/repo-health`.

```bash
npm run loop:repo-health
npm run loop:repo-health -- --build
```

It writes persistent loop state to `loops/repo-health/STATE.md` and the latest run report to `loops/repo-health/latest-report.md`.
Those generated state/report files are local-only; the durable repo files are the loop docs in `loops/repo-health` and the runner in `scripts/repo-health-loop.mjs`.

The web atlas loop lives in `loops/web-atlas`.

```bash
npm run loop:web-atlas
npm run loop:web-atlas -- --build
```

It checks the Project Sphere web app, repo graph metadata, and shared UI package, then writes its loop state to `loops/web-atlas/STATE.md` and latest report to `loops/web-atlas/latest-report.md`.

## Unity WebGL

The Unity source of truth is `games/ff6-inspired-rpg/webgl-build`. Sync it into the web app after rebuilding Unity:

```bash
npm run sync:unity-webgl
```
