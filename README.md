# Agent Monorepo

An experimental agentic terminal interface with a sci-fi repo graph UI and a small analytics engineering POC using dbt Core.

## Structure

- `apps/web` - Next.js web interface.
- `packages/repo-graph` - Shared repo/node metadata for the UI.
- `packages/ui` - Shared UI primitives.
- `analytics/dbt-agent-poc` - dbt Core + DuckDB proof of concept.
- `docs` - Architecture notes.

## First Commands

```bash
npm install
npm run dev
```

The web app runs from `apps/web`.
