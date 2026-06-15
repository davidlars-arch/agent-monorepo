"use client";

import { Shield, Sparkles, Swords, Zap } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";

type SliceStage = "title" | "room" | "dialogue" | "battle" | "victory" | "defeat";
type EnemyIntent = "scratch" | "overwind";

const heroMaxHp = 42;
const heroMaxMp = 12;
const enemyMaxHp = 28;
const miraLines = [
  "The old observatory woke up again.",
  "Every lens is pointing at the same impossible star.",
  "If the engine below is singing, something ancient is listening.",
  "Take this spark and go carefully. It likes courage, not panic."
];

export function RpgSliceMock() {
  const [stage, setStage] = useState<SliceStage>("title");
  const [lineIndex, setLineIndex] = useState(0);
  const [heroHp, setHeroHp] = useState(heroMaxHp);
  const [heroMp, setHeroMp] = useState(heroMaxMp);
  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [focusStacks, setFocusStacks] = useState(0);
  const [enemyIntent, setEnemyIntent] = useState<EnemyIntent>("scratch");
  const [log, setLog] = useState<string[]>([
    "Clockwork Imp jitters, ready to scratch.",
    "A Clockwork Imp rattles out of the dark."
  ]);

  const stageLabel = useMemo(() => {
    switch (stage) {
      case "title":
        return "Title";
      case "room":
        return "Observatory Room";
      case "dialogue":
        return "Mira";
      case "battle":
        return "Battle Test";
      case "victory":
        return "Victory";
      case "defeat":
        return "Defeat";
    }
  }, [stage]);

  function resetBattle() {
    setLineIndex(0);
    setHeroHp(heroMaxHp);
    setHeroMp(heroMaxMp);
    setEnemyHp(enemyMaxHp);
    setFocusStacks(0);
    setEnemyIntent("scratch");
    setLog(["Clockwork Imp jitters, ready to scratch.", "A Clockwork Imp rattles out of the dark."]);
  }

  function startGame() {
    resetBattle();
    setStage("room");
  }

  function continueDialogue() {
    if (lineIndex >= miraLines.length - 1) {
      setStage("battle");
      return;
    }

    setLineIndex((current) => current + 1);
  }

  function pushLog(lines: string[]) {
    setLog((current) => [...lines, ...current].slice(0, 5));
  }

  function resolveEnemyTurn(guarding = false) {
    const incomingPower = enemyIntent === "overwind" ? 11 : 6;
    const guardBonus = guarding ? 4 : 0;
    const enemyDamage = Math.max(1, incomingPower - 4 - guardBonus);
    const nextHeroHp = Math.max(0, heroHp - enemyDamage);
    const nextIntent: EnemyIntent = enemyIntent === "scratch" ? "overwind" : "scratch";
    const enemyLine =
      enemyIntent === "overwind"
        ? `Clockwork Imp over-winds and slams for ${enemyDamage} damage.`
        : `Clockwork Imp scratches for ${enemyDamage} damage.`;
    const intentLine =
      nextIntent === "overwind"
        ? "Clockwork Imp winds its key for a heavy strike."
        : "Clockwork Imp jitters, ready to scratch.";

    setHeroHp(nextHeroHp);

    if (nextHeroHp <= 0) {
      pushLog([enemyLine, "Aster falls as the observatory lights go red."]);
      setStage("defeat");
      return;
    }

    setEnemyIntent(nextIntent);
    pushLog([enemyLine, intentLine]);
  }

  function attack(kind: "attack" | "spark") {
    if (kind === "spark" && heroMp < 3) {
      pushLog(["Aster reaches for Spark, but the charge is gone."]);
      return;
    }

    const basePower = kind === "spark" ? 14 : 8;
    const heroDamage = Math.max(1, basePower + focusStacks * 4 - 2);
    const nextEnemyHp = Math.max(0, enemyHp - heroDamage);
    const actionLine =
      kind === "spark"
        ? `Aster casts Spark for ${heroDamage} damage.`
        : `Aster attacks for ${heroDamage} damage.`;

    if (kind === "spark") {
      setHeroMp((current) => Math.max(0, current - 3));
    }

    setFocusStacks(0);
    setEnemyHp(nextEnemyHp);

    if (nextEnemyHp <= 0) {
      pushLog([actionLine, "Clockwork Imp collapses into a pile of ticking brass."]);
      setStage("victory");
      return;
    }

    pushLog([actionLine]);
    resolveEnemyTurn();
  }

  function defend() {
    pushLog(["Aster braces behind a flickering ward."]);
    resolveEnemyTurn(true);
  }

  function focus() {
    setFocusStacks((current) => current + 1);
    setHeroMp((current) => Math.min(heroMaxMp, current + 2));
    pushLog(["Aster tunes the prism lens. Spark will burn brighter."]);
    resolveEnemyTurn();
  }

  return (
    <div className="relative min-h-[620px] overflow-hidden rounded-lg border border-slate-200 bg-[#10131f] shadow-sm">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,32,55,0.2),rgba(4,6,12,0.95)),radial-gradient(circle_at_50%_12%,rgba(236,180,88,0.32),transparent_24%),radial-gradient(circle_at_78%_46%,rgba(31,150,165,0.24),transparent_28%)]" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(90deg,rgba(117,148,164,0.2)_1px,transparent_1px),linear-gradient(0deg,rgba(117,148,164,0.2)_1px,transparent_1px)] bg-[size:30px_30px]" />

      <div className="absolute left-4 top-4 rounded-md border border-amber-200/30 bg-black/40 px-3 py-2 font-mono text-xs uppercase text-amber-100">
        {stageLabel}
      </div>

      <PixelBackdrop active={stage !== "title"} danger={stage === "defeat"} />

      {stage === "title" ? (
        <CenteredScene
          kicker="Unity Runtime Placeholder"
          title="Astral Rift"
          body="An original 16-bit JRPG slice with a clockwork ambush under a haunted observatory."
          actionLabel="Start"
          onAction={startGame}
        />
      ) : null}

      {stage === "room" ? (
        <CenteredScene
          kicker="Observatory Room"
          title="Aster"
          body="The floor hums under a fractured star map. Mira waits beside the engine hatch as brass footsteps tick below."
          actionLabel="Talk to Mira"
          onAction={() => setStage("dialogue")}
        />
      ) : null}

      {stage === "dialogue" ? (
        <CenteredScene
          kicker="Mira"
          title={miraLines[lineIndex]}
          body="The first dialogue runner feeds this same original sequence from Unity data."
          actionLabel={lineIndex >= miraLines.length - 1 ? "Enter Battle" : "Continue"}
          onAction={continueDialogue}
        />
      ) : null}

      {stage === "battle" ? (
        <div className="absolute inset-0 flex flex-col justify-end p-4 text-white sm:p-5">
          <div className="mb-auto mt-24 grid gap-4 sm:grid-cols-2">
            <Combatant name="Aster" hp={heroHp} maxHp={heroMaxHp} mp={heroMp} maxMp={heroMaxMp} focusStacks={focusStacks} />
            <Combatant name="Clockwork Imp" hp={enemyHp} maxHp={enemyMaxHp} hostile intent={enemyIntent} />
          </div>
          <div className="grid gap-3 rounded-lg border border-amber-200/30 bg-[#090b12]/75 p-4 backdrop-blur sm:grid-cols-[1fr_260px]">
            <div className="min-h-28 space-y-1 font-mono text-xs text-cyan-50">
              {log.map((line, index) => (
                <p key={`${index}-${line}`}>{line}</p>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton icon={<Swords size={16} />} label="Attack" onClick={() => attack("attack")} />
              <ActionButton icon={<Zap size={16} />} label="Spark" disabled={heroMp < 3} onClick={() => attack("spark")} />
              <ActionButton icon={<Shield size={16} />} label="Defend" onClick={defend} />
              <ActionButton icon={<Sparkles size={16} />} label="Focus" onClick={focus} />
            </div>
          </div>
        </div>
      ) : null}

      {stage === "victory" ? (
        <CenteredScene
          kicker="Victory"
          title="The engine quiets."
          body="Aster gains 8 experience. The WebGL slot now mirrors the richer Unity battle controller."
          actionLabel="Restart Slice"
          onAction={startGame}
        />
      ) : null}

      {stage === "defeat" ? (
        <CenteredScene
          kicker="Defeat"
          title="The lenses go dark."
          body="Try using Defend when the imp winds its key, or Focus before spending Spark."
          actionLabel="Retry Battle"
          onAction={() => {
            resetBattle();
            setStage("battle");
          }}
        />
      ) : null}
    </div>
  );
}

function PixelBackdrop({ active, danger }: { active: boolean; danger: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute left-[10%] top-[16%] h-24 w-24 rounded-full border border-amber-100/25" />
      <div className="absolute left-[calc(50%-70px)] top-[11%] h-36 w-36 rounded-full border border-cyan-100/20" />
      <div className="absolute right-[12%] top-[20%] h-20 w-20 rounded-full border border-amber-100/25" />
      <div className="absolute bottom-28 left-1/2 h-16 w-56 -translate-x-1/2 rounded-t-full border border-cyan-100/20 bg-cyan-200/10" />
      <div
        className={`absolute bottom-36 left-[28%] h-16 w-12 rounded-sm border ${
          active ? "border-cyan-100/45 bg-cyan-300/20" : "border-slate-300/20 bg-slate-500/10"
        }`}
      />
      <div
        className={`absolute bottom-36 right-[28%] h-14 w-14 rounded-sm border ${
          danger ? "border-rose-200/60 bg-rose-400/30" : "border-amber-100/45 bg-amber-300/20"
        }`}
      />
    </div>
  );
}

function CenteredScene({
  kicker,
  title,
  body,
  actionLabel,
  onAction
}: {
  kicker: string;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="absolute left-1/2 top-1/2 flex w-[min(86vw,620px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-5 text-center text-white">
      <div>
        <p className="text-sm font-semibold uppercase text-amber-200">{kicker}</p>
        <p className="mt-4 text-4xl font-semibold sm:text-6xl">{title}</p>
        <p className="mt-4 text-sm leading-6 text-cyan-50">{body}</p>
      </div>
      <button
        className="rounded-md border border-amber-200 bg-amber-100 px-5 py-3 text-sm font-semibold text-slate-950 shadow-[0_0_40px_rgba(236,180,88,0.25)] transition hover:bg-white"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  disabled = false,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex min-h-11 items-center justify-center gap-2 rounded-md border border-cyan-100/20 bg-white px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-slate-700"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function Combatant({
  name,
  hp,
  maxHp,
  mp,
  maxMp,
  focusStacks = 0,
  hostile = false,
  intent
}: {
  name: string;
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
  focusStacks?: number;
  hostile?: boolean;
  intent?: EnemyIntent;
}) {
  return (
    <div className="rounded-lg border border-cyan-100/25 bg-[#090b12]/60 p-4 backdrop-blur">
      <div
        className={`mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-md border font-mono text-sm ${
          hostile
            ? "border-rose-300/50 bg-rose-400/20 text-rose-100"
            : "border-cyan-200/50 bg-cyan-400/20 text-cyan-100"
        }`}
      >
        {hostile ? "IMP" : "AST"}
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold">{name}</span>
        <span className="font-mono">
          HP {hp}/{maxHp}
        </span>
      </div>
      <Meter value={hp} max={maxHp} hostile={hostile} />
      {typeof mp === "number" && typeof maxMp === "number" ? (
        <>
          <div className="mt-3 flex items-center justify-between text-xs text-cyan-50">
            <span>MP</span>
            <span className="font-mono">
              {mp}/{maxMp}
            </span>
          </div>
          <Meter value={mp} max={maxMp} mana />
        </>
      ) : null}
      <p className="mt-3 min-h-5 text-xs text-amber-100">
        {hostile
          ? intent === "overwind"
            ? "Intent: Overwind"
            : "Intent: Scratch"
          : focusStacks > 0
            ? `Focus x${focusStacks}`
            : "Ready"}
      </p>
    </div>
  );
}

function Meter({
  value,
  max,
  hostile = false,
  mana = false
}: {
  value: number;
  max: number;
  hostile?: boolean;
  mana?: boolean;
}) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
      <div
        className={mana ? "h-full bg-cyan-300" : hostile ? "h-full bg-rose-300" : "h-full bg-amber-300"}
        style={{ width: `${(value / max) * 100}%` }}
      />
    </div>
  );
}
