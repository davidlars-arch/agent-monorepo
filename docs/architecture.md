# Architecture

The first version is intentionally small:

- The web app owns the interactive agentic terminal surface.
- Shared repo graph metadata lives in `packages/repo-graph`.
- Shared UI primitives live in `packages/ui`.
- The Unity RPG proof of concept lives in `games/ff6-inspired-rpg` and mounts through `/unity-rpg`.
- The analytics POC starts as local dbt Core models over CSV seeds, targeting DuckDB.

The central UI metaphor is a purple control sphere. Hovering it reveals the monorepo graph and lets the user inspect each app, package, and analytics project.
