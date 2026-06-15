export type RepoNodeKind = "app" | "package" | "analytics" | "data" | "docs" | "game";

export type RepoNode = {
  id: string;
  label: string;
  kind: RepoNodeKind;
  x: number;
  y: number;
  status: "planned" | "scaffolded" | "poc";
  summary: string;
};

export type RepoEdge = {
  from: string;
  to: string;
};

export const repoNodes: RepoNode[] = [
  {
    id: "web",
    label: "apps/web",
    kind: "app",
    x: 50,
    y: 13,
    status: "scaffolded",
    summary: "Agentic terminal UI with the purple sphere, repo graph, and command surface."
  },
  {
    id: "ui",
    label: "packages/ui",
    kind: "package",
    x: 78,
    y: 31,
    status: "scaffolded",
    summary: "Shared primitives for panels, commands, and compact interface controls."
  },
  {
    id: "repo-graph",
    label: "packages/repo-graph",
    kind: "package",
    x: 72,
    y: 71,
    status: "scaffolded",
    summary: "Typed metadata that powers the graph around the central terminal sphere."
  },
  {
    id: "unity-rpg",
    label: "games/ff6-inspired-rpg",
    kind: "game",
    x: 86,
    y: 55,
    status: "poc",
    summary: "Unity WebGL slot for an original FF6-inspired RPG prototype with a browser launch screen."
  },
  {
    id: "dbt",
    label: "analytics/dbt-agent-poc",
    kind: "analytics",
    x: 24,
    y: 72,
    status: "poc",
    summary: "dbt Core project aimed at local DuckDB models for a lightweight analytics demo."
  },
  {
    id: "seeds",
    label: "analytics/seeds",
    kind: "data",
    x: 18,
    y: 32,
    status: "poc",
    summary: "Tiny repo, event, and run datasets for bootstrapping visual analytics."
  },
  {
    id: "docs",
    label: "docs",
    kind: "docs",
    x: 50,
    y: 88,
    status: "planned",
    summary: "Architecture notes and operating decisions as the monorepo evolves."
  }
];

export const repoEdges: RepoEdge[] = [
  { from: "web", to: "ui" },
  { from: "web", to: "repo-graph" },
  { from: "web", to: "unity-rpg" },
  { from: "web", to: "dbt" },
  { from: "unity-rpg", to: "docs" },
  { from: "dbt", to: "seeds" },
  { from: "dbt", to: "docs" },
  { from: "repo-graph", to: "docs" }
];
