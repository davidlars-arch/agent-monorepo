# Architecture

The first version is intentionally small:

- The web app owns the interactive Project Sphere surface.
- Shared repo graph metadata lives in `packages/repo-graph`.
- Shared UI primitives live in `packages/ui`.
- The Unity RPG proof of concept lives in `games/ff6-inspired-rpg` and mounts through `/unity-rpg`.
- The analytics POC starts as local dbt Core models over CSV seeds, targeting DuckDB.

The central UI metaphor is a 3D project globe. Landmark markers let the user inspect each app, package, game, analytics project, and docs area.

## Monorepo Layout

- `apps` contains deployable products and interfaces.
- `packages` contains shared code that multiple apps or domains can import.
- `games` contains game project roots, not generic web code.
- `analytics` contains data projects, dbt models, seeds, and local warehouse POCs.
- `docs` contains architecture and operating context.

The planet UI treats each important folder as a landmark. Featured project folders such as `dbt-agent-poc` and `ff6-inspired-rpg` get visible labels; lower-level support folders stay as dots until selected or hovered.
