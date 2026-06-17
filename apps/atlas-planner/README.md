# Atlas Planner

Atlas Planner is the token-aware agent work planner that currently runs inside the
OpenClaw Atlas web surface.

It is treated as its own workspace and map landmark because the product surface
is no longer just project metadata: it tracks Kanban work, agent token runway,
ticket lifecycle timestamps, completion commits, tags, and activity reporting.

## Current Host

- UI shell: `apps/web/components/earth-globe.tsx`
- Planner state: browser `localStorage`
- Loop registry: `loops/project-controller/projects.json`
- Atlas landmark: `packages/repo-graph/src/index.ts`

## Extraction Target

The next step is moving planner-specific UI and state into this workspace while
keeping the Atlas map as the launcher.
