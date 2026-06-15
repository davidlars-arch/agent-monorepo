"use client";

import { repoEdges, repoNodes, type RepoNode } from "@agent/repo-graph";
import { IconButton, Panel } from "@agent/ui";
import { motion } from "framer-motion";
import { Braces, Database, Gamepad2, GitBranch, Radar, Rocket, Search, Terminal } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const kindStyles: Record<RepoNode["kind"], string> = {
  app: "border-signal bg-violet-50 text-violet-900",
  package: "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900",
  analytics: "border-cyan-300 bg-cyan-50 text-cyan-900",
  data: "border-emerald-300 bg-emerald-50 text-emerald-900",
  docs: "border-zinc-300 bg-zinc-50 text-zinc-900",
  game: "border-rose-300 bg-rose-50 text-rose-950"
};

const commandLines = [
  "scan monorepo --graph",
  "launch games/ff6-inspired-rpg --webgl",
  "inspect analytics/dbt-agent-poc",
  "materialize mart_repo_health",
  "render lineage --target web"
];

function nodeById(id: string) {
  return repoNodes.find((node) => node.id === id);
}

export function AgentTerminal() {
  const [activeNode, setActiveNode] = useState<RepoNode>(repoNodes[0]);
  const [expanded, setExpanded] = useState(false);

  const activeEdges = useMemo(
    () =>
      repoEdges.filter((edge) => edge.from === activeNode.id || edge.to === activeNode.id),
    [activeNode.id]
  );

  return (
    <main className="min-h-screen overflow-hidden px-5 py-5 text-ink sm:px-7 lg:px-9">
      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-7xl flex-col gap-5">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-zinc-500">
              Agentic Terminal
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">Repo command surface</h1>
          </div>
          <div className="flex items-center gap-2">
            <IconButton aria-label="Scan repos">
              <Radar size={18} />
            </IconButton>
            <IconButton aria-label="Open terminal">
              <Terminal size={18} />
            </IconButton>
          </div>
        </header>

        <section className="grid flex-1 gap-5 lg:grid-cols-[1fr_360px]">
          <div
            className="relative min-h-[560px] overflow-hidden rounded-lg border border-soft-grid bg-white"
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
          >
            <RepoGraph activeNode={activeNode} expanded={expanded} onSelect={setActiveNode} />

            <motion.button
              type="button"
              aria-label="Reveal repository graph"
              className="orb-matrix absolute left-1/2 top-1/2 z-20 h-44 w-44 rounded-full shadow-orb-core outline-none ring-1 ring-white/60 sm:h-56 sm:w-56"
              animate={{
                x: "-50%",
                y: "-50%",
                scale: expanded ? 0.78 : 1,
                rotate: expanded ? 8 : 0
              }}
              transition={{ type: "spring", stiffness: 170, damping: 18 }}
              onFocus={() => setExpanded(true)}
              onBlur={() => setExpanded(false)}
            >
              <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/20 text-white backdrop-blur">
                <Rocket size={24} />
              </span>
            </motion.button>

            <div className="pointer-events-none absolute bottom-5 left-5 z-30 rounded-md border border-zinc-200 bg-white/86 px-3 py-2 text-xs text-zinc-600 shadow-sm backdrop-blur">
              Hover the sphere to unfold the monorepo graph.
            </div>
          </div>

          <aside className="flex flex-col gap-5">
            <Panel className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Selected Node
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{activeNode.label}</h2>
                </div>
                <span className="rounded-md border border-zinc-200 px-2 py-1 text-xs uppercase text-zinc-500">
                  {activeNode.status}
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-600">{activeNode.summary}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {activeNode.id === "unity-rpg" ? (
                  <Link
                    href="/unity-rpg"
                    className="rounded-md border border-signal bg-signal px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                  >
                    Launch WebGL slot
                  </Link>
                ) : null}
                {activeEdges.map((edge) => {
                  const other = nodeById(edge.from === activeNode.id ? edge.to : edge.from);
                  return other ? (
                    <button
                      key={`${edge.from}-${edge.to}`}
                      type="button"
                      className="rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-signal hover:text-signal"
                      onClick={() => setActiveNode(other)}
                    >
                      {other.label}
                    </button>
                  ) : null;
                })}
              </div>
            </Panel>

            <Panel className="p-0">
              <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
                <Terminal size={17} className="text-signal" />
                <p className="text-sm font-semibold">Command queue</p>
              </div>
              <div className="space-y-1 p-4 font-mono text-xs">
                {commandLines.map((line) => (
                  <div
                    key={line}
                    className="flex items-center gap-2 rounded-md bg-zinc-950 px-3 py-2 text-violet-100"
                  >
                    <span className="text-violet-400">$</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <Gamepad2 size={18} className="text-rose-600" />
                <h2 className="text-base font-semibold">Unity RPG Slot</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                A Unity WebGL build can land in the game repo and mount behind the current browser placeholder.
              </p>
              <Link
                href="/unity-rpg"
                className="mt-4 inline-flex rounded-md border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-900 transition hover:border-rose-400"
              >
                Open RPG
              </Link>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-cyan-600" />
                <h2 className="text-base font-semibold">Analytics POC</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                dbt Core with DuckDB seeds will produce local repo health models for the web UI.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <Metric label="Seeds" value="3" />
                <Metric label="Models" value="2" />
              </div>
            </Panel>
          </aside>
        </section>
      </div>
    </main>
  );
}

function RepoGraph({
  activeNode,
  expanded,
  onSelect
}: {
  activeNode: RepoNode;
  expanded: boolean;
  onSelect: (node: RepoNode) => void;
}) {
  return (
    <motion.div
      className="absolute inset-0"
      animate={{ opacity: expanded ? 1 : 0.42 }}
      transition={{ duration: 0.25 }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {repoEdges.map((edge) => {
          const from = nodeById(edge.from);
          const to = nodeById(edge.to);
          if (!from || !to) return null;
          const active = activeNode.id === from.id || activeNode.id === to.id;
          return (
            <motion.line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={active ? "#6f35ff" : "#d7cbed"}
              strokeWidth={active ? 0.34 : 0.18}
              strokeDasharray={active ? "1.2 0.8" : "0"}
              initial={false}
              animate={{ pathLength: expanded ? 1 : 0.32 }}
            />
          );
        })}
      </svg>

      {repoNodes.map((node) => (
        <motion.button
          key={node.id}
          type="button"
          className={`absolute z-10 min-w-28 rounded-lg border px-3 py-2 text-left text-xs shadow-sm transition hover:scale-[1.03] ${kindStyles[node.kind]} ${
            activeNode.id === node.id ? "ring-2 ring-signal ring-offset-2" : ""
          }`}
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`
          }}
          initial={false}
          animate={{
            x: "-50%",
            y: "-50%",
            opacity: expanded ? 1 : 0,
            scale: expanded ? 1 : 0.65
          }}
          transition={{ type: "spring", stiffness: 170, damping: 18 }}
          onClick={() => onSelect(node)}
        >
          <span className="flex items-center gap-2 font-semibold">
            {node.kind === "analytics" ? <Database size={14} /> : null}
            {node.kind === "package" ? <Braces size={14} /> : null}
            {node.kind === "app" ? <GitBranch size={14} /> : null}
            {node.kind === "data" ? <Search size={14} /> : null}
            {node.kind === "game" ? <Gamepad2 size={14} /> : null}
            {node.label}
          </span>
        </motion.button>
      ))}
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
