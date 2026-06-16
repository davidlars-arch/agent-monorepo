export type RepoNodeKind = "app" | "package" | "analytics" | "data" | "docs" | "game";

export type RepoNode = {
  id: string;
  label: string;
  shortLabel: string;
  group: "apps" | "packages" | "games" | "analytics" | "docs";
  kind: RepoNodeKind;
  x: number;
  y: number;
  status: "planned" | "scaffolded" | "poc";
  summary: string;
  featured?: boolean;
};

export type RepoEdge = {
  from: string;
  to: string;
};

export const repoNodes: RepoNode[] = [
  {
    id: "web",
    label: "apps/web",
    shortLabel: "web",
    group: "apps",
    kind: "app",
    x: 50,
    y: 13,
    status: "scaffolded",
    summary: "Project Sphere web UI with the 3D repo globe and runnable project surfaces."
  },
  {
    id: "crypto-trader",
    label: "apps/crypto-trader-test",
    shortLabel: "crypto-trader",
    group: "apps",
    kind: "app",
    x: 38,
    y: 22,
    status: "poc",
    summary: "Dry-run-first Kraken spot trader experiment with guarded live-trading switches."
  },
  {
    id: "ui",
    label: "packages/ui",
    shortLabel: "ui",
    group: "packages",
    kind: "package",
    x: 78,
    y: 31,
    status: "scaffolded",
    summary: "Shared primitives for panels, commands, and compact interface controls."
  },
  {
    id: "repo-graph",
    label: "packages/repo-graph",
    shortLabel: "repo-graph",
    group: "packages",
    kind: "package",
    x: 72,
    y: 71,
    status: "scaffolded",
    summary: "Typed metadata that powers the Project Sphere landmarks and related repo views."
  },
  {
    id: "unity-rpg",
    label: "games/ff6-inspired-rpg",
    shortLabel: "ff6-inspired-rpg",
    group: "games",
    kind: "game",
    x: 86,
    y: 55,
    status: "poc",
    summary: "Unity WebGL project folder for the original FF6-inspired RPG prototype.",
    featured: true
  },
  {
    id: "dbt",
    label: "analytics/dbt-agent-poc",
    shortLabel: "dbt-agent-poc",
    group: "analytics",
    kind: "analytics",
    x: 24,
    y: 72,
    status: "poc",
    summary: "dbt Core project folder for local DuckDB models and analytics engineering POC work.",
    featured: true
  },
  {
    id: "seeds",
    label: "analytics/dbt-agent-poc/seeds",
    shortLabel: "seeds",
    group: "analytics",
    kind: "data",
    x: 18,
    y: 32,
    status: "poc",
    summary: "Tiny repo, event, and run datasets for bootstrapping visual analytics."
  },
  {
    id: "docs",
    label: "docs",
    shortLabel: "docs",
    group: "docs",
    kind: "docs",
    x: 50,
    y: 88,
    status: "planned",
    summary: "Architecture notes and operating decisions as the monorepo evolves."
  }
];

export const repoEdges: RepoEdge[] = [
  { from: "web", to: "ui" },
  { from: "web", to: "crypto-trader" },
  { from: "web", to: "repo-graph" },
  { from: "web", to: "unity-rpg" },
  { from: "web", to: "dbt" },
  { from: "unity-rpg", to: "docs" },
  { from: "dbt", to: "seeds" },
  { from: "dbt", to: "docs" },
  { from: "repo-graph", to: "docs" }
];
