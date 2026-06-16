"use client";

import { repoEdges, repoNodes, type RepoNode } from "@agent/repo-graph";
import { IconButton, Panel } from "@agent/ui";
import { motion } from "framer-motion";
import { Database, Gamepad2, Radar, Terminal } from "lucide-react";
import Link from "next/link";
import { type CSSProperties, useMemo, useState } from "react";

const commandLines = [
  "scan monorepo --graph",
  "launch games/ff6-inspired-rpg --webgl",
  "inspect analytics/dbt-agent-poc",
  "materialize mart_repo_health",
  "render lineage --target web"
];

const matrixColumns = [
  "0101 RUN",
  "AI SYS 7",
  "NODE 13",
  "LOAD 42",
  "0xFF00",
  "SCAN OK",
  "DATA IO",
  "VOID 01",
  "ROOT 9",
  "SYNC ++"
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
              Project Sphere
            </p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">Repo command surface</h1>
          </div>
          <div className="flex items-center gap-2">
            <IconButton aria-label="Scan repos">
              <Radar size={18} />
            </IconButton>
            <IconButton aria-label="Open command surface">
              <Terminal size={18} />
            </IconButton>
          </div>
        </header>

        <section className="grid flex-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div
            className="graph-stage relative h-[calc(100vh-170px)] min-h-[580px] max-h-[760px] overflow-hidden rounded-lg border border-soft-grid bg-white"
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
          >
            <div className="pointer-events-none absolute left-5 top-5 z-30 max-w-[280px]">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                Live Repo Map
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Click a node to inspect folders, dependencies, and runnable surfaces.
              </p>
            </div>

            <div className="absolute left-1/2 top-[56%] z-20 h-[min(58vh,54vw,560px)] w-[min(58vh,54vw,560px)] -translate-x-1/2 -translate-y-1/2 max-sm:h-[min(70vw,360px)] max-sm:w-[min(70vw,360px)]">
              <motion.div
                role="group"
                aria-label="Monorepo folder planet"
                tabIndex={0}
                className="orb-matrix h-full w-full overflow-hidden rounded-full shadow-orb-core outline-none"
                animate={{
                  scale: expanded ? 1.035 : 1,
                  rotate: expanded ? 2 : 0
                }}
                transition={{ type: "spring", stiffness: 170, damping: 18 }}
                onFocus={() => setExpanded(true)}
                onBlur={() => setExpanded(false)}
              >
                <span className="matrix-rain" aria-hidden="true">
                  {matrixColumns.map((column, index) => (
                    <span
                      key={`${column}-${index}`}
                      className="matrix-rain__column"
                      style={
                        {
                          "--column-index": index,
                          "--column-delay": `${index * -0.37}s`,
                          "--column-speed": `${3.8 + (index % 4) * 0.42}s`
                        } as CSSProperties
                      }
                    >
                      {column}
                      <br />
                      101001
                      <br />
                      {index % 2 ? "EXEC" : "LINK"}
                      <br />
                      001101
                      <br />
                      {index % 3 ? "CORE" : "ECHO"}
                    </span>
                  ))}
                </span>
                <PlanetLandmarks activeNode={activeNode} onSelect={setActiveNode} />
              </motion.div>
            </div>

            <div className="pointer-events-none absolute bottom-5 left-5 z-30 rounded-md border border-zinc-200 bg-white/86 px-3 py-2 text-xs text-zinc-600 shadow-sm backdrop-blur">
              Folder landmarks are live. Click a dot to change the selected folder.
            </div>
          </div>

          <aside className="pointer-events-auto z-40 flex flex-col gap-5">
            <Panel className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Selected Folder
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{activeNode.label}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-violet-500">
                    {activeNode.group}
                  </p>
                </div>
                <span className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs uppercase text-violet-700">
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
                <Gamepad2 size={18} className="text-violet-700" />
                <h2 className="text-base font-semibold">Unity RPG Slot</h2>
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-600">
                A Unity WebGL build can land in the game repo and mount behind the current browser placeholder.
              </p>
              <Link
                href="/unity-rpg"
                className="mt-4 inline-flex rounded-md border border-violet-200 px-3 py-2 text-xs font-semibold text-violet-900 transition hover:border-violet-400"
              >
                Open RPG
              </Link>
            </Panel>

            <Panel className="p-5">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-violet-700" />
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

function PlanetLandmarks({
  activeNode,
  onSelect
}: {
  activeNode: RepoNode;
  onSelect: (node: RepoNode) => void;
}) {
  return (
    <span className="planet-landmarks" aria-label="Monorepo folder landmarks">
      <svg className="planet-links" viewBox="0 0 100 100" aria-hidden="true">
        {repoEdges.map((edge) => {
          const from = nodeById(edge.from);
          const to = nodeById(edge.to);
          if (!from || !to) {
            return null;
          }

          const isActive = edge.from === activeNode.id || edge.to === activeNode.id;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={`planet-link ${isActive ? "planet-link--active" : ""}`}
            />
          );
        })}
      </svg>
      {repoNodes.map((node) => (
        <button
          key={node.id}
          type="button"
          title={node.label}
          aria-label={node.label}
          className={`planet-landmark ${activeNode.id === node.id ? "planet-landmark--active" : ""}`}
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`
          }}
          onClick={() => onSelect(node)}
        >
          <span className={`planet-landmark__label ${node.featured ? "planet-landmark__label--featured" : ""}`}>
            {node.shortLabel}
          </span>
        </button>
      ))}
    </span>
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
